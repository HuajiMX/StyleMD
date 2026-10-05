import { annotateRoles, type RoleStats } from './roles/annotate'
import { parseMarkdown, type Frontmatter, type ParsedDocument } from './parse/markdown'
import { renderBody, renderHtmlDocument } from './render/html'
import { compileCss, type CompileCssOptions } from './style/compile-css'
import { resolveStyles } from './style/resolve'
import { validateTheme, type ComputedStyles, type StyleTheme } from '@stylemd/theme-schema'

export * from './parse/markdown'
export * from './roles/annotate'
export * from './roles/locate'
export * from './style/resolve'
export * from './style/compile-css'
export * from './style/font-faces'
export * from './render/html'
export * from './render/math'
export type { AnyNode } from './internal/node'

export interface BuildOptions extends CompileCssOptions {
  /** 关闭图题/表题/参考文献的启发式识别。 */
  autoDetect?: boolean
  allowRawHtml?: boolean
  language?: string
}

export interface BuildResult {
  /** 完整 HTML 文档（内容 + 编译后的 CSS），预览与导出都用它。 */
  html: string
  /** 内容片段，便于嵌到别的容器里。 */
  body: string
  css: string
  computed: ComputedStyles
  stats: RoleStats
  frontmatter: Frontmatter
  parsed: ParsedDocument
  warnings: string[]
}

/**
 * 核心入口：Markdown + 样式包 → 可直接预览/导出的 HTML。
 * 这是宿主无关、后端无关的纯函数，Electron / 浏览器 / CLI / CI 都调它。
 */
export function build(markdown: string, theme: StyleTheme, options: BuildOptions = {}): BuildResult {
  const validation = validateTheme(theme)
  if (!validation.ok) throw new Error(`样式包校验失败：${validation.errors.join('；')}`)
  const parsed = parseMarkdown(markdown)
  const { tree, stats } = annotateRoles(parsed.tree, { autoDetect: options.autoDetect ?? true })
  const computed = resolveStyles(theme)
  const title = firstString(parsed.frontmatter.title) ?? options.title ?? theme.name
  const css = compileCss(computed, { title, date: options.date, includePage: options.includePage })
  const bodyResult = renderBody(tree, { allowRawHtml: options.allowRawHtml })
  const documentResult = renderHtmlDocument(tree, {
    stylesheet: css,
    title,
    language: options.language,
    allowRawHtml: options.allowRawHtml,
  })

  return {
    html: documentResult.html,
    body: bodyResult.html,
    css,
    computed,
    stats,
    frontmatter: parsed.frontmatter,
    parsed,
    warnings: [...new Set([...parsed.warnings, ...stats.warnings, ...bodyResult.warnings, ...documentResult.warnings])],
  }
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}
