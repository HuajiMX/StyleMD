import type { Root } from 'mdast'
import { toString as mdastToString } from 'mdast-util-to-string'
import { FALLBACK_ROLE, isKnownRole } from '@stylemd/theme-schema'

declare module 'mdast' {
  interface Data {
    /** 由 annotateRoles 写入的结构角色；渲染与样式编译都只认这个字段。 */
    role?: string
  }
}

interface AnyNode {
  type: string
  data?: { role?: string }
  children?: AnyNode[]
  [key: string]: unknown
}

export interface AnnotateOptions {
  /** 关闭启发式识别后，只有原生 Markdown 语义会被角色化。 */
  autoDetect?: boolean
}

export interface RoleStats {
  counts: Record<string, number>
  warnings: string[]
}

export interface AnnotatedDocument {
  tree: Root
  stats: RoleStats
}

const TABLE_CAPTION_PATTERN = /^表\s*\d/
const FIGURE_CAPTION_PATTERN = /^\s*图\s*\d/
const REFERENCE_SECTION_PATTERN = /参考文献|references|bibliography/i

const HEADING_BY_DEPTH: Record<number, string> = {
  1: 'heading.1',
  2: 'heading.2',
  3: 'heading.3',
  4: 'heading.4',
  5: 'heading.5',
  6: 'heading.6',
}

interface WalkContext {
  /** 当前所在的容器指令名（abstract / keywords / 自定义）。 */
  directive?: string
  /** 是否处于「参考文献」小节内。 */
  inReferenceSection: boolean
  /** 上一个同级块级节点的角色。 */
  previousRole?: string
  /** 上一个同级块级节点是否为「只包含图片的段落」。 */
  previousWasImageParagraph: boolean
}

function setRole(node: AnyNode, role: string, stats: RoleStats): void {
  let finalRole = role
  if (!isKnownRole(finalRole)) {
    stats.warnings.push(`内部生成了未注册的角色「${finalRole}」，已回退为「${FALLBACK_ROLE}」`)
    finalRole = FALLBACK_ROLE
  }
  node.data = { ...(node.data ?? {}), role: finalRole }
  stats.counts[finalRole] = (stats.counts[finalRole] ?? 0) + 1
}

function isImageOnlyParagraph(node: AnyNode): boolean {
  if (node.type !== 'paragraph') return false
  const children = node.children ?? []
  return children.length === 1 && ['image', 'imageReference'].includes(children[0]?.type ?? '')
}

/**
 * 把 mdast 标注成角色树。角色有两个来源：
 * 一是原生语义（标题层级、列表、表格、代码等）直接映射；
 * 二是启发式识别（图题、表题、参考文献条目、容器指令），可在 UI 中关闭。
 * 每次判定都会写入 stats，使界面能够回答「这段被识别成了什么」。
 */
export function annotateRoles(tree: Root, options: AnnotateOptions = {}): AnnotatedDocument {
  const autoDetect = options.autoDetect ?? true
  const stats: RoleStats = { counts: {}, warnings: [] }
  const root = tree as unknown as AnyNode
  walkBlocks(root, { inReferenceSection: false, previousWasImageParagraph: false }, autoDetect, stats)
  return { tree, stats }
}

function walkBlocks(parent: AnyNode, context: WalkContext, autoDetect: boolean, stats: RoleStats): void {
  const children = parent.children ?? []
  let previousRole: string | undefined
  let previousWasImageParagraph = false
  let inReferenceSection = context.inReferenceSection

  for (const child of children) {
    const childContext: WalkContext = { ...context, inReferenceSection, previousRole, previousWasImageParagraph }
    const role = classifyBlock(child, childContext, autoDetect, stats)
    if (role) setRole(child, role, stats)

    if (child.type === 'containerDirective') {
      const name = typeof child.name === 'string' ? child.name : ''
      walkBlocks(child, { ...childContext, directive: name || context.directive }, autoDetect, stats)
    } else if (child.children && child.children.length > 0) {
      walkBlocks(child, childContext, autoDetect, stats)
    }

    if (autoDetect && child.type === 'heading') {
      const depth = typeof child.depth === 'number' ? child.depth : 1
      const text = mdastToString(child as never)
      if (REFERENCE_SECTION_PATTERN.test(text)) {
        inReferenceSection = true
      } else if (inReferenceSection && depth <= 2) {
        inReferenceSection = false
      }
    }

    previousRole = role
    previousWasImageParagraph = isImageOnlyParagraph(child)
  }
}

function classifyBlock(
  node: AnyNode,
  context: WalkContext,
  autoDetect: boolean,
  stats: RoleStats,
): string | undefined {
  switch (node.type) {
    case 'strong': return 'inline.strong'
    case 'emphasis': return 'inline.emphasis'
    case 'inlineCode': return 'code.inline'
    case 'link':
    case 'linkReference': return 'inline.link'
    case 'image':
    case 'imageReference': return 'image'
    case 'heading': {
      const depth = typeof node.depth === 'number' ? node.depth : 1
      return HEADING_BY_DEPTH[depth] ?? 'heading.6'
    }
    case 'list':
      return node.ordered === true ? 'list.ordered' : 'list.unordered'
    case 'listItem':
      return 'list.item'
    case 'blockquote':
      return 'blockquote'
    case 'code':
      return 'code.block'
    case 'table':
      return 'table'
    case 'thematicBreak':
      return 'divider'
    case 'footnoteDefinition':
      return 'reference.item'
    case 'containerDirective': {
      const name = typeof node.name === 'string' ? node.name : ''
      if (!name) return undefined
      return name === 'abstract' || name === 'keywords' ? name : FALLBACK_ROLE
    }
    case 'paragraph': {
      if (context.directive === 'abstract') return 'abstract'
      if (context.directive === 'keywords') return 'keywords'
      if (isImageOnlyParagraph(node)) return 'image'
      if (!autoDetect) return FALLBACK_ROLE

      const text = mdastToString(node as never).trim()
      if (context.inReferenceSection) return 'reference.item'
      if (context.previousWasImageParagraph) return 'figure.caption'
      if (TABLE_CAPTION_PATTERN.test(text)) return 'table.caption'
      if (FIGURE_CAPTION_PATTERN.test(text)) {
        stats.warnings.push(`段落「${text.slice(0, 20)}…」被识别为图题，但上一段不是图片，可在界面中改判`)
        return 'figure.caption'
      }
      return FALLBACK_ROLE
    }
    default:
      return undefined
  }
}
