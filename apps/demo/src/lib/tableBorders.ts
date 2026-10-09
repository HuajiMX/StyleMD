import type { BorderSide, BorderStyle, ComputedStyles, RoleStyle } from '@stylemd/theme-schema'
import { tableGridOf } from '@stylemd/core'

/**
 * 表格边框的操作模型。
 *
 * 表格不像普通结构那样"每个盒子四条独立的边"：单元格紧密堆积，相邻单元格**共用**一条边
 * （左边单元格的右边框与右边单元格的左边框在视觉上是同一条线）。所以这里操作的对象是**边**：
 *  - 上 / 下 / 左 / 右框线挂在 `table` 角色自己的四条边上（外框四边可以各不相同）；
 *  - 表头下线 = `table.header` 的下边框；
 *  - 内部横线 / 内部竖线 = `table` 角色的 `grid`（相邻单元格共用的那两条，由编译器只画一次，
 *    见 core 的 `tableGridOf` 与 compile-css 的格线块）。
 *
 * 线型 / 粗细 / 颜色是"手里这条线"，改它不动表格；点预设、或点某一条边才应用上去——
 * 仿 Word「边框和底纹」：这样不同边才能各用各的样式。
 */

export const TABLE_ROLE = 'table'
export const HEADER_ROLE = 'table.header'
export const CELL_ROLE = 'table.cell'

export interface BorderLine {
  style: BorderStyle
  widthPt: number
  color: string
}

export const DEFAULT_BORDER_LINE: BorderLine = { style: 'solid', widthPt: 0.75, color: '#d8dee4' }

export const BORDER_STYLE_OPTIONS = [
  { value: 'solid' as const, label: '实线' },
  { value: 'dashed' as const, label: '虚线' },
  { value: 'dotted' as const, label: '点线' },
  { value: 'double' as const, label: '双线' },
]

/** 表格上的七条边：四条外框 + 表头下线 + 内部横线 + 内部竖线。 */
export const BORDER_EDGES = [
  { id: 'outer-top', label: '上框线', kind: 'outer', side: 'top' },
  { id: 'outer-bottom', label: '下框线', kind: 'outer', side: 'bottom' },
  { id: 'outer-left', label: '左框线', kind: 'outer', side: 'left' },
  { id: 'outer-right', label: '右框线', kind: 'outer', side: 'right' },
  { id: 'header-bottom', label: '表头下线', kind: 'header' },
  { id: 'horizontal', label: '内部横线', kind: 'grid', line: 'horizontal' },
  { id: 'vertical', label: '内部竖线', kind: 'grid', line: 'vertical' },
] as const
export type BorderEdgeId = (typeof BORDER_EDGES)[number]['id']

export const OUTER_EDGE_IDS = ['outer-top', 'outer-right', 'outer-bottom', 'outer-left'] as const
export const INNER_EDGE_IDS = ['header-bottom', 'horizontal', 'vertical'] as const

const EDGE_BY_ID = new Map(BORDER_EDGES.map((edge) => [edge.id, edge]))
const OFF = { style: 'none' as const }

/** 画得出线才算"这条边开着"（`none` 与没写都不算）。 */
export function draws(side: BorderSide | undefined): boolean {
  return Boolean(side?.style && side.style !== 'none')
}

/** 读某条边当前的线。 */
export function edgeLine(computed: ComputedStyles, id: BorderEdgeId): BorderSide | undefined {
  const edge = EDGE_BY_ID.get(id)
  if (!edge) return undefined
  if (edge.kind === 'outer') return computed.roles[TABLE_ROLE]?.border?.[edge.side]
  const lines = tableGridOf(computed)
  if (edge.kind === 'header') return lines.headerBottom
  return edge.line === 'horizontal' ? lines.horizontal : lines.vertical
}

export function edgeOn(computed: ComputedStyles, id: BorderEdgeId): boolean {
  return draws(edgeLine(computed, id))
}

/** "手里这条线"的初始值：取第一条画得出来的边，都没有就用默认线。 */
export function currentLine(computed: ComputedStyles): BorderLine {
  for (const edge of BORDER_EDGES) {
    const side = edgeLine(computed, edge.id)
    if (draws(side)) {
      return {
        style: side?.style ?? DEFAULT_BORDER_LINE.style,
        widthPt: side?.widthPt ?? DEFAULT_BORDER_LINE.widthPt,
        color: side?.color ?? DEFAULT_BORDER_LINE.color,
      }
    }
  }
  return DEFAULT_BORDER_LINE
}

type RolePatcher = (role: string, patch: Partial<RoleStyle>) => void

/** 把一条边设成某条线；`{ style: 'none' }` 就是撤掉这条边。 */
export function setEdge(patch: RolePatcher, id: BorderEdgeId, line: Partial<BorderLine> | { style: 'none' }): void {
  const edge = EDGE_BY_ID.get(id)
  if (!edge) return
  if (edge.kind === 'outer') {
    patch(TABLE_ROLE, { border: { [edge.side]: line } })
    return
  }
  if (edge.kind === 'header') {
    patch(HEADER_ROLE, { border: { bottom: line } })
    return
  }
  patch(TABLE_ROLE, { grid: { [edge.line]: line } })
}

export type BorderPreset = 'none' | 'grid' | 'outer' | 'three-line'

export const BORDER_PRESETS = [
  { id: 'none' as const, label: '无边框', short: '无', hint: '七条线全撤掉' },
  { id: 'grid' as const, label: '全部网格', short: '网格', hint: '外框与内部横线、内部竖线都用手里这条线' },
  { id: 'outer' as const, label: '仅外框', short: '外框', hint: '只留四条外框线，内部线全撤' },
  { id: 'three-line' as const, label: '三线表', short: '三线', hint: '上下粗线夹一条表头细线，其余全撤' },
] as const

/**
 * 预设：把手里的线铺到对应的边上。
 * 三线表的顶线与底线比表头线粗一倍，是这种表样的惯例；其余预设统一用手里这条线，
 * 免得「点了一下全部网格，线色却变回默认灰」。
 */
export function applyBorderPreset(patch: RolePatcher, preset: BorderPreset, line: BorderLine): void {
  if (preset === 'none') {
    for (const edge of BORDER_EDGES) setEdge(patch, edge.id, OFF)
    return
  }
  if (preset === 'outer') {
    for (const edge of BORDER_EDGES) setEdge(patch, edge.id, edge.kind === 'outer' ? line : OFF)
    return
  }
  if (preset === 'grid') {
    for (const edge of BORDER_EDGES) setEdge(patch, edge.id, line)
    return
  }
  const thick = { ...line, widthPt: Math.round(line.widthPt * 200) / 100 }
  setEdge(patch, 'outer-top', thick)
  setEdge(patch, 'outer-bottom', thick)
  setEdge(patch, 'outer-left', OFF)
  setEdge(patch, 'outer-right', OFF)
  setEdge(patch, 'header-bottom', line)
  setEdge(patch, 'horizontal', OFF)
  setEdge(patch, 'vertical', OFF)
}

export const PRESET_LABELS: Record<BorderPreset | 'custom', string> = {
  none: '无边框',
  grid: '全部网格',
  outer: '仅外框',
  'three-line': '三线表',
  custom: '自定义',
}

/** 认出当前这套线更像哪个预设（认不出算自定义），用来在工具带上写一句当前状态。 */
export function presetOf(computed: ComputedStyles): BorderPreset | 'custom' {
  const on = (id: BorderEdgeId) => edgeOn(computed, id)
  const outer = OUTER_EDGE_IDS.filter(on).length
  const inner = INNER_EDGE_IDS.filter(on)
  if (outer === 0 && inner.length === 0) return 'none'
  if (outer === 4 && inner.length === 3) return 'grid'
  if (outer === 4 && inner.length === 0) return 'outer'
  if (outer === 2 && on('outer-top') && on('outer-bottom') && inner.length === 1 && inner[0] === 'header-bottom') {
    return 'three-line'
  }
  return 'custom'
}

/** 一条边框落成 CSS 简写，给窗口里的预览方块用（与 compile-css 的写法一致）。 */
export function borderCss(border: BorderSide | undefined): string {
  if (!draws(border)) return 'none'
  return `${border?.widthPt ?? 1}pt ${border?.style ?? 'solid'} ${border?.color ?? '#000000'}`
}
