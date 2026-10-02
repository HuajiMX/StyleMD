import type { Root } from 'mdast'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
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
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective)
  const tree = processor.parse(normalized) as Root
  return { frontmatter, tree, bodySource: body, normalizedSource: normalized, warnings }
}
