/**
 * 把「编辑器里的光标位置」映射到结构角色。
 *
 * 复用既有的解析 + 角色标注管线，这里只多做两件事：
 *  1. 把 mdast 的 1 基「行/列」换算成原文的字符偏移；
 *  2. 定义「光标落在哪个角色上」的判定规则。
 *
 * 纯函数，不依赖 DOM 或 UI；demo 的光标联动、CLI 的 `--at` 之类能力都能共用。
 */
import { FALLBACK_ROLE } from '@stylemd/theme-schema'
import { annotateRoles, type AnnotateOptions } from './annotate'
import { parseMarkdown } from '../parse/markdown'

export interface RoleSpan {
  role: string
  /** 原文坐标下的起始偏移（含前置元数据）。 */
  start: number
  /** 原文坐标下的结束偏移（不含）。 */
  end: number
  /** 角色嵌套深度：越深表示离光标所在的最小结构越近。 */
  depth: number
  /** 父跨度下标，-1 表示该角色没有被别的角色包住。 */
  parent: number
}

interface PositionedNode {
  type: string
  data?: { role?: string }
  children?: PositionedNode[]
  position?: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
}

/** 每行起始偏移，行尾的 `\n` 计入上一行长度。 */
function lineStarts(lines: string[]): number[] {
  const starts: number[] = []
  let offset = 0
  for (const line of lines) {
    starts.push(offset)
    offset += line.length + 1
  }
  return starts
}

/**
 * 列号是「第几个字符」，不是字节偏移也不是 UTF-16 下标：emoji 这类代理对算一个字符。
 * 越界时收敛到行尾，避免出现负偏移。
 */
function columnToIndex(line: string, column: number): number {
  let index = 0
  let remaining = Math.max(0, column - 1)
  while (remaining > 0 && index < line.length) {
    const code = line.codePointAt(index) ?? 0
    index += code > 0xffff ? 2 : 1
    remaining -= 1
  }
  return index
}

/**
 * 解析树的位置基于「规范化后的正文」，而光标偏移基于「用户手里的原文」。
 * 两者只差一条前置元数据和若干 `::: name` 里被删掉的空格，按行起点对齐即可。
 */
function createOffsetMapper(source: string, bodySource: string, normalizedSource: string) {
  const bodyStart = Math.max(0, source.length - bodySource.length)
  const bodyLines = bodySource.split('\n')
  const normalizedLines = normalizedSource.split('\n')
  const bodyStarts = lineStarts(bodyLines)
  const normalizedStarts = lineStarts(normalizedLines)

  return (line: number, column: number): number => {
    const index = Math.min(Math.max(line - 1, 0), normalizedStarts.length - 1)
    const lineStart = bodyStarts[index] ?? (bodyStarts[bodyStarts.length - 1] ?? 0) + (normalizedLines[index]?.length ?? 0)
    return bodyStart + lineStart + columnToIndex(normalizedLines[index] ?? '', column)
  }
}

/**
 * 收集所有带角色的节点在原文中的跨度。返回值按遍历顺序排列，父节点一定在子节点之前。
 */
export function collectRoleSpans(source: string, options: AnnotateOptions = {}): RoleSpan[] {
  const parsed = parseMarkdown(source)
  const { tree } = annotateRoles(parsed.tree, options)
  const toOffset = createOffsetMapper(source, parsed.bodySource, parsed.normalizedSource)
  const spans: RoleSpan[] = []

  const visit = (node: PositionedNode, depth: number, parent: number): void => {
    let currentParent = parent
    let currentDepth = depth
    const role = node.data?.role
    const position = node.position
    if (role && position) {
      const start = toOffset(position.start.line, position.start.column)
      const end = Math.max(start, toOffset(position.end.line, position.end.column))
      spans.push({ role, start, end, depth, parent })
      currentParent = spans.length - 1
      currentDepth = depth + 1
    }
    for (const child of node.children ?? []) visit(child, currentDepth, currentParent)
  }

  visit(tree as unknown as PositionedNode, 0, -1)
  return spans
}

/**
 * 判定光标落在哪个角色上：取最内层的那一个。
 *
 * `body.text` 是「没被别的规则认领」时的兜底角色，它本身不具有结构信息。
 * 所以当兜底角色套在列表项、引用块、容器指令里时，向外取一层，
 * 免得用户把光标放进列表项却看到「正文段落」。
 */
export function roleAtOffset(spans: RoleSpan[], offset: number): string | undefined {
  let best = -1
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index]
    if (!span || offset < span.start || offset > span.end) continue
    if (best < 0) {
      best = index
      continue
    }
    const current = spans[best]
    if (!current || span.depth > current.depth || (span.depth === current.depth && span.start >= current.start)) {
      best = index
    }
  }
  if (best < 0) return undefined

  let resolved = best
  while (spans[resolved]?.role === FALLBACK_ROLE) {
    const parent = spans[resolved]?.parent ?? -1
    if (parent < 0 || spans[parent]?.role === FALLBACK_ROLE) break
    resolved = parent
  }
  return spans[resolved]?.role
}

/** 一次性定位：适合测试、CLI 等低频调用；编辑器请复用 `collectRoleSpans` 的结果。 */
export function locateRole(
  source: string,
  offset: number,
  options: AnnotateOptions = {},
): string | undefined {
  return roleAtOffset(collectRoleSpans(source, options), offset)
}
