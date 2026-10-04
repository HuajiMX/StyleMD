import type { Root } from 'mdast'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

/** 只支持一层 key: value / key: [a, b] 的前置元数据，复杂 YAML 会给出提示。 */
export type Frontmatter = Record<string, string | string[]>

export interface ParsedDocument {
  frontmatter: Frontmatter
  tree: Root
  bodySource: string
  /**
   * 规范化后的正文（`::: name` 的空格已去掉）。
   * 解析树的位置信息对应这份文本，定位光标时需要它才能把行/列换算回原文偏移。
   */
  normalizedSource: string
  warnings: string[]
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function unquote(value: string): string {
  const startsWithDouble = value.startsWith('"') && value.endsWith('"')
  const startsWithSingle = value.startsWith("'") && value.endsWith("'")
  if (value.length >= 2 && (startsWithDouble || startsWithSingle)) {
    return value.slice(1, -1)
  }
  return value
}

function parseScalar(raw: string): string | string[] {
  const value = raw.trim()
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => unquote(item.trim()))
      .filter((item) => item.length > 0)
  }
  return unquote(value)
}

/**
 * 拆出前置元数据。刻意不引入 YAML 依赖：v1 只需要 title / author / date 这几个平铺字段。
 * 遇到嵌套结构时不报错，而是跳过并给出 warning，保证文档仍能渲染。
 */
export function splitFrontmatter(source: string): { frontmatter: Frontmatter; body: string; warnings: string[] } {
  const warnings: string[] = []
  const match = FRONTMATTER_PATTERN.exec(source)
  if (!match) return { frontmatter: {}, body: source, warnings }

  const frontmatter: Frontmatter = Object.create(null) as Frontmatter
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const separator = line.indexOf(':')
    if (separator <= 0 || /^\s/.test(line)) {
      warnings.push(`前置元数据中无法解析的行已忽略：${line.trim()}`)
      continue
    }
    const key = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1)
    if (!rawValue.trim()) {
      warnings.push(`前置元数据字段「${key}」是嵌套结构，v1 仅支持平铺键值，已忽略`)
      continue
    }
    frontmatter[key] = parseScalar(rawValue)
  }
  return { frontmatter, body: source.slice(match[0].length), warnings }
}

/**
 * 容器指令的规范写法是 `:::name`（冒号后紧跟名字），但用户几乎都会写成 `::: name`。
 * 这里统一掉这个空格：改的只是指令行本身，不触碰正文内容。
 */
function normalizeDirectiveSyntax(body: string): string {
  // Parse once to identify code ranges; rewriting raw lines must never alter a code example.
  const tree = unified().use(remarkParse).parse(body)
  const protectedLines = new Set<number>()
  const visit = (node: import('unist').Node) => {
    if (node.type === 'code' && node.position) {
      for (let line = node.position.start.line; line <= node.position.end.line; line += 1) protectedLines.add(line)
    }
    if ('children' in node) for (const child of (node as import('unist').Parent).children) visit(child)
  }
  visit(tree)
  return body.split('\n').map((line, index) => protectedLines.has(index + 1) ? line : line.replace(/^([ \t]*:::)[ \t]+(?=[A-Za-z])/, '$1')).join('\n')
}

export function parseMarkdown(source: string): ParsedDocument {
  const { frontmatter, body, warnings } = splitFrontmatter(source.replace(/^\uFEFF/, ''))
  const normalized = normalizeDirectiveSyntax(body)
  // remark-math 把 `$...$` / `$$...$$` 切成 inlineMath / math 节点；围栏代码块里的美元符号
  // 仍按代码处理（`normalizeDirectiveSyntax` 也保护代码行）。`$$` 的分隔符语义统一见 promoteDisplayMath。
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkMath)
  const tree = processor.parse(normalized) as Root
  promoteDisplayMath(tree, normalized)
  return { frontmatter, tree, bodySource: body, normalizedSource: normalized, warnings }
}

interface PositionedNode {
  type: string
  value?: string
  children?: PositionedNode[]
  position?: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
}

/** 列号是「第几个字符」而非 UTF-16 下标：中文、emoji 都算一个（与 roles/locate.ts 同一套算法）。 */
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
 * `$$...$$` 一律按行间公式处理。
 *
 * micromark 只把「`$$` 单独起行 + 单独收尾」认成行间公式，其余（最常见的就是单行 `$$E = mc^2$$`）会退化成
 * 行内公式：不居中、也不吃 math.block 的样式。而 Pandoc / MathJax / KaTeX auto-render / Typora 都把 `$$`
 * 当行间公式，用户也是这个直觉——`$...$` 才是行内公式。
 * 段落里夹着 `$$` 时按 Pandoc 的做法把段落切开：文字 → 公式块 → 文字。
 */
function promoteDisplayMath(root: Root, source: string): void {
  const lines = source.split('\n')
  const startsWithDoubleDollar = (node: PositionedNode): boolean => {
    const start = node.position?.start
    if (!start) return false
    const line = lines[start.line - 1] ?? ''
    return line.slice(columnToIndex(line, start.column)).startsWith('$$')
  }
  const isDisplayMath = (node: PositionedNode | undefined): boolean =>
    node?.type === 'inlineMath' && startsWithDoubleDollar(node)

  /** 返回切分后的块级节点；段落里没有 `$$` 公式时返回 null，交给常规遍历继续往下走。 */
  const splitParagraph = (node: PositionedNode): PositionedNode[] | null => {
    const children = node.children ?? []
    if (!children.some(isDisplayMath)) return null
    const blocks: PositionedNode[] = []
    let run: PositionedNode[] = []
    const flushRun = (): void => {
      // 夹在公式之间的空白段没有内容，留着会渲染成空段落（还带段间距）。
      if (run.some((child) => child.type !== 'text' || (child.value ?? '').trim().length > 0)) {
        const start = run[0]?.position?.start
        const end = run[run.length - 1]?.position?.end
        blocks.push({
          type: 'paragraph',
          children: run,
          ...(start && end ? { position: { start, end } } : {}),
        })
      }
      run = []
    }
    for (const child of children) {
      if (isDisplayMath(child)) {
        flushRun()
        blocks.push({ type: 'math', value: child.value, position: child.position })
      } else {
        run.push(child)
      }
    }
    flushRun()
    return blocks
  }

  const walk = (children: PositionedNode[]): void => {
    for (let index = 0; index < children.length; index += 1) {
      const node = children[index]
      if (!node) continue
      const blocks = node.type === 'paragraph' ? splitParagraph(node) : null
      if (blocks) {
        children.splice(index, 1, ...blocks)
        index += blocks.length - 1
        continue
      }
      if (node.children) walk(node.children)
    }
  }
  walk((root as unknown as PositionedNode).children ?? [])
}
