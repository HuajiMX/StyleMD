/** mdast 节点的最小结构视图：核心库只依赖这些字段，避免与具体 remark 版本耦合。 */
export interface AnyNode {
  type: string
  data?: { role?: string }
  value?: string
  depth?: number
  ordered?: boolean
  start?: number
  name?: string
  url?: string
  alt?: string
  title?: string
  align?: string | (string | null)[]
  lang?: string
  label?: string
  identifier?: string
  children?: AnyNode[]
  [key: string]: unknown
}

export function childrenOf(node: AnyNode): AnyNode[] {
  return Array.isArray(node.children) ? node.children : []
}

export function isNode(value: unknown): value is AnyNode {
  return typeof value === 'object' && value !== null && typeof (value as AnyNode).type === 'string'
}
