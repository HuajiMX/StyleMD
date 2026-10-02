import type { RoleSpan } from '@stylemd/core'

export interface OutlineItem {
  role: string
  depth: number
  text: string
  /** 源码里的字符偏移，用于跳转。 */
  offset: number
  line: number
}

/**
 * 从角色跨度里挑出各级标题，做成目录。
 * 复用定位代码已经算好的偏移，不另起一套解析。
 */
export function documentOutline(spans: RoleSpan[], markdown: string): OutlineItem[] {
  return spans
    .filter((span) => span.role.startsWith('heading.'))
    .map((span) => {
      const line = markdown.slice(0, span.start).split('\n').length - 1
      const raw = markdown.slice(span.start).split('\n')[0] ?? ''
      return {
        role: span.role,
        depth: Number(span.role.slice('heading.'.length)) || 1,
        text: raw.replace(/^#{1,6}\s*/, '').trim() || '（无标题）',
        offset: span.start,
        line,
      }
    })
}
