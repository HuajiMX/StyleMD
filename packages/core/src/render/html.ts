import type { Root } from 'mdast'
import { FALLBACK_ROLE, cssRoleName } from '@stylemd/theme-schema'
import { childrenOf, type AnyNode } from '../internal/node'
import { annotateRoles } from '../roles/annotate'
import { MATH_BASE_CSS, renderMath } from './math'
import { KATEX_CSS } from './math-css.generated'

export interface RenderOptions {
  /** 文档标题，用于 <title> 与页眉页脚域。 */
  title?: string
  language?: string
  /**
   * 是否允许 Markdown 中的原始 HTML 直出。默认关闭并转义：
   * 预览和导出都在同一个渲染进程里，原始 HTML 是最直接的安全边界（规划 §12）。
   */
  allowRawHtml?: boolean
  /** 传入 CSS 文本时输出完整 HTML 文档，否则只输出内容片段。 */
  stylesheet?: string
  extraHead?: string
  extraBodyEnd?: string
  /**
   * 传进来的树还没做过角色标注时，是否自动补一步。
   * 默认开启：直接调 renderBody 是常见用法，忘了标注会让整篇退化成正文样式。
   */
  autoAnnotate?: boolean
}

export interface RenderResult {
  html: string
  warnings: string[]
  /**
   * 片段里是否含公式。只取 renderBody 片段自己拼页面的调用方必须据此补 KATEX_CSS，
   * 否则公式只有骨架没有字体（build() 会自动带上）。
   */
  hasMath: boolean
}

interface RenderContext {
  allowRawHtml: boolean
  warnings: string[]
  sectionIndex: number
  rawHtmlWarned: boolean
  /** 文档里出现过公式时才把 KaTeX 样式塞进 <head>，普通文档的产物大小不受影响。 */
  hasMath: boolean
  definitions: Map<string, AnyNode>
}

const INLINE_TYPES = new Set([
  'text',
  'strong',
  'emphasis',
  'delete',
  'inlineCode',
  'link',
  'break',
  'footnoteReference',
  'image',
  'imageReference',
  'textDirective',
  'inlineMath',
])

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

function roleOf(node: AnyNode): string {
  const role = node.data?.role
  return typeof role === 'string' && role ? role : FALLBACK_ROLE
}

function roleAttribute(node: AnyNode): string {
  return ` data-role="${escapeAttribute(cssRoleName(roleOf(node)))}"`
}

function safeUrl(value: string, image: boolean, ctx: RenderContext): string | undefined {
  const normalized = value.trim()
  const protocol = normalized.replace(/[\u0000-\u0020\u007f]/g, '').match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase()
  const allowed = !protocol || ['http', 'https', ...(image ? [] : ['mailto', 'tel'])].includes(protocol)
    || (image && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(normalized))
  // Relative paths（含 Windows 的 `.\fig.png`）照常放行；只拦掉 UNC/协议相对地址。
  if (allowed && !/^[\\/]{2}/.test(normalized)) return normalized
  ctx.warnings.push(`已阻止不安全的${image ? '图片' : '链接'}地址协议`)
  return undefined
}

/**
 * 标题文本里已经带了编号（「第一章」「1.1」「一、」）时，关掉自动编号，
 * 否则会出现「第1章 第一章 绪论」这种重复编号。
 */
const EXISTING_NUMBERING = /^\s*(第\s*[0-9一二三四五六七八九十百千]+\s*[章节篇部分]|[0-9]+(\.[0-9]+)*[\s.、]|[一二三四五六七八九十]+[、.]|\([0-9]+\)|（[0-9]+）)/

function plainTextOf(node: AnyNode): string {
  if (typeof node.value === 'string') return node.value
  return childrenOf(node)
    .map((child) => plainTextOf(child))
    .join('')
}

function renderNode(node: AnyNode, ctx: RenderContext): string {
  switch (node.type) {
    case 'root':
      return childrenOf(node)
        .map((child) => renderNode(child, ctx))
        .filter((html) => html.length > 0)
        .join('\n')

    case 'text':
      return escapeHtml(node.value ?? '')

    case 'strong':
      return `<strong${roleAttribute(node)}>${renderChildren(node, ctx)}</strong>`
    case 'emphasis':
      return `<em${roleAttribute(node)}>${renderChildren(node, ctx)}</em>`
    case 'delete':
      return `<del${roleAttribute(node)}>${renderChildren(node, ctx)}</del>`
    case 'inlineCode':
      return `<code${roleAttribute(node)}>${escapeHtml(node.value ?? '')}</code>`
    case 'inlineMath':
    case 'math': {
      ctx.hasMath = true
      const display = node.type === 'math'
      const result = renderMath(node.value ?? '', display)
      if (result.error) ctx.warnings.push(result.error)
      const tag = display ? 'div' : 'span'
      const className = display ? 'stylemd-math stylemd-math-block' : 'stylemd-math stylemd-math-inline'
      return `<${tag}${roleAttribute(node)} class="${className}">${result.html}</${tag}>`
    }
    case 'link': {
      const url = safeUrl(node.url ?? '', false, ctx)
      const title = node.title ? ` title="${escapeAttribute(node.title)}"` : ''
      return url === undefined ? renderChildren(node, ctx) : `<a${roleAttribute(node)} href="${escapeAttribute(url)}"${title}>${renderChildren(node, ctx)}</a>`
    }
    case 'linkReference':
    case 'imageReference': {
      const definition = ctx.definitions.get((node.identifier ?? '').toUpperCase())
      if (!definition) return node.type === 'imageReference' ? escapeHtml(node.alt ?? '') : renderChildren(node, ctx)
      return renderNode({ ...node, type: node.type === 'imageReference' ? 'image' : 'link', url: definition.url, title: definition.title }, ctx)
    }
    case 'image': {
      const url = safeUrl(node.url ?? '', true, ctx)
      if (url === undefined) return escapeHtml(node.alt ?? '')
      const alt = escapeAttribute(node.alt ?? '')
      const title = node.title ? ` title="${escapeAttribute(node.title)}"` : ''
      return `<img${roleAttribute(node)} src="${escapeAttribute(url)}" alt="${alt}"${title}>`
    }
    case 'break':
      return '<br>'
    case 'footnoteReference':
      return `<sup class="stylemd-footnote-ref">[${escapeHtml(node.label ?? node.identifier ?? '')}]</sup>`

    case 'heading': {
      const depth = Math.min(Math.max(node.depth ?? 1, 1), 6)
      ctx.sectionIndex += 1
      const numbering = EXISTING_NUMBERING.test(plainTextOf(node)) ? ' data-numbering="off"' : ''
      return `<h${depth}${roleAttribute(node)}${numbering} id="sec-${ctx.sectionIndex}">${renderChildren(node, ctx)}</h${depth}>`
    }
    case 'paragraph': {
      const children = childrenOf(node)
      const onlyChild = children.length === 1 ? children[0] : undefined
      if (onlyChild?.type === 'image') {
        return `<p${roleAttribute(node)}>${renderNode(onlyChild, ctx)}</p>`
      }
      return `<p${roleAttribute(node)}>${renderChildren(node, ctx)}</p>`
    }
    case 'blockquote':
      return `<blockquote${roleAttribute(node)}>\n${renderChildren(node, ctx, '\n')}\n</blockquote>`
    case 'list': {
      const tag = node.ordered === true ? 'ol' : 'ul'
      const start = node.ordered === true && typeof node.start === 'number' && node.start !== 1 ? ` start="${node.start}"` : ''
      return `<${tag}${roleAttribute(node)}${start}>\n${renderChildren(node, ctx, '\n')}\n</${tag}>`
    }
    case 'listItem': {
      const checkbox = typeof node.checked === 'boolean' ? `<input type="checkbox" disabled${node.checked ? ' checked' : ''}> ` : ''
      const children = childrenOf(node)
      const first = children[0]
      // 单项段落不额外包 <p>，"· 文本" 的排版由 list.item 角色直接控制。
      if (children.length === 1 && first?.type === 'paragraph') {
        return `<li${roleAttribute(node)}>${checkbox}${renderChildren(first, ctx)}</li>`
      }
      return `<li${roleAttribute(node)}>${checkbox}${renderChildren(node, ctx, '\n')}</li>`
    }
    case 'code': {
      const language = typeof node.lang === 'string' && node.lang ? ` data-language="${escapeAttribute(node.lang)}"` : ''
      return `<pre${roleAttribute(node)}${language}><code>${escapeHtml(node.value ?? '')}</code></pre>`
    }
    case 'table':
      return renderTable(node, ctx)
    case 'thematicBreak':
      return `<hr${roleAttribute(node)}>`
    case 'footnoteDefinition':
      return `<div${roleAttribute(node)} class="stylemd-footnote">${renderChildren(node, ctx, '\n')}</div>`
    case 'definition':
    case 'yaml':
      return ''
    case 'containerDirective': {
      const name = typeof node.name === 'string' ? node.name : ''
      const tag = name === 'abstract' || name === 'keywords' ? 'section' : 'div'
      return `<${tag} class="stylemd-container">\n${renderChildren(node, ctx, '\n')}\n</${tag}>`
    }
    case 'leafDirective':
    case 'textDirective':
      return `<span${roleAttribute(node)}>${renderChildren(node, ctx)}</span>`
    case 'html': {
      if (ctx.allowRawHtml) return node.value ?? ''
      if (!ctx.rawHtmlWarned) {
        ctx.rawHtmlWarned = true
        ctx.warnings.push('文档包含原始 HTML，已按设置转义显示（可在设置中显式开启直出）')
      }
      return `<span class="stylemd-raw-html">${escapeHtml(node.value ?? '')}</span>`
    }
    default:
      return childrenOf(node).length > 0 ? renderChildren(node, ctx) : ''
  }
}

function renderChildren(node: AnyNode, ctx: RenderContext, separator = ''): string {
  return childrenOf(node)
    .map((child) => renderNode(child, ctx))
    .filter((html) => html.length > 0)
    .join(separator)
}

function renderTable(node: AnyNode, ctx: RenderContext): string {
  const rows = childrenOf(node)
  const headerRow = rows[0]?.type === 'tableRow' ? rows[0] : undefined
  const bodyRows = headerRow ? rows.slice(1) : rows

  const renderCell = (cell: AnyNode, isHeader: boolean, index: number): string => {
    const tag = isHeader ? 'th' : 'td'
    const alignment = Array.isArray(node.align) ? node.align[index] : undefined
    const align = typeof alignment === 'string' && ['left', 'center', 'right'].includes(alignment) ? ` style="text-align: ${alignment}"` : ''
    const attributes = isHeader
      ? ` data-role="table-header"`
      : ` data-role="table-cell"`
    return `<${tag}${attributes}${align}>${renderChildren(cell, ctx)}</${tag}>`
  }

  const header = headerRow
    ? `  <thead>\n    <tr>${childrenOf(headerRow).map((cell, index) => renderCell(cell, true, index)).join('')}</tr>\n  </thead>\n`
    : ''
  const body = bodyRows
    .map((row) => `    <tr>${childrenOf(row).map((cell, index) => renderCell(cell, false, index)).join('')}</tr>`)
    .join('\n')

  return `<table${roleAttribute(node)}>\n${header}  <tbody>\n${body}\n  </tbody>\n</table>`
}

function createContext(options: RenderOptions, root: AnyNode): RenderContext {
  const definitions = new Map<string, AnyNode>()
  const visit = (node: AnyNode) => {
    if (node.type === 'definition' && node.identifier && !definitions.has(node.identifier.toUpperCase())) definitions.set(node.identifier.toUpperCase(), node)
    childrenOf(node).forEach(visit)
  }
  visit(root)
  return {
    allowRawHtml: options.allowRawHtml ?? false,
    warnings: [],
    sectionIndex: 0,
    rawHtmlWarned: false,
    hasMath: false,
    definitions,
  }
}

function hasRoleAnnotation(node: AnyNode): boolean {
  if (node.data?.role) return true
  return childrenOf(node).some((child) => hasRoleAnnotation(child))
}

/** 只渲染内容片段，供"嵌入已有页面"的场景使用（例如预览容器）。 */
export function renderBody(tree: Root, options: RenderOptions = {}): RenderResult {
  const root = tree as unknown as AnyNode
  const source = options.autoAnnotate !== false && !hasRoleAnnotation(root) ? annotateRoles(tree).tree : tree
  const ctx = createContext(options, root)
  return { html: renderNode(source as unknown as AnyNode, ctx), warnings: ctx.warnings, hasMath: ctx.hasMath }
}

/** 渲染完整 HTML 文档：预览与导出共用同一个函数，保证"所见即所得"（规划 §7 硬约束）。 */
export function renderHtmlDocument(tree: Root, options: RenderOptions & { stylesheet: string }): RenderResult {
  const root = tree as unknown as AnyNode
  const source = options.autoAnnotate !== false && !hasRoleAnnotation(root) ? annotateRoles(tree).tree : tree
  const ctx = createContext(options, root)
  const body = renderNode(source as unknown as AnyNode, ctx)
  const language = options.language ?? 'zh-CN'
  const title = escapeHtml(options.title ?? 'StyleMD 文档')
  // KaTeX 的样式表带着内联字体，只在有公式时附加；转义规则与主题样式一致，避免 `</style>` 提前收尾。
  const mathStyles = ctx.hasMath ? `<style>\n${`${MATH_BASE_CSS}\n${KATEX_CSS}`.replace(/</g, '\\3c ')}\n</style>\n` : ''
  const html = `<!doctype html>
<html lang="${escapeAttribute(language)}">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
${options.stylesheet.replace(/</g, '\\3c ')}
</style>
${mathStyles}${options.extraHead ?? ''}
</head>
<body class="stylemd-document">
${body}
${options.extraBodyEnd ?? ''}
</body>
</html>
`
  return { html, warnings: ctx.warnings, hasMath: ctx.hasMath }
}
