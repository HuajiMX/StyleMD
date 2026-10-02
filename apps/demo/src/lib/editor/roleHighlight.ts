import { StateEffect, StateField, type EditorState } from '@codemirror/state'
import { GutterMarker, gutter } from '@codemirror/view'
import type { RoleSpan } from '@stylemd/core'

/**
 * 结构高亮：光标落在哪个角色跨度里，就在**行号右边**画一条竖线，位置跟 VS Code 的改动条一样。
 *
 * 早先的版本把竖线画在文字上（box-shadow inset）、又给整块铺了底色，结果是竖线压住第一个字、
 * 底色还跟语法高亮抢眼。现在范围信息交给行号槽，编辑区里只留「当前行」的底色。
 *
 * 跨度来自 core 的 collectRoleSpans（原始文本坐标），跟右侧样式卡片用的是同一份数据。
 */
export interface RoleHighlight {
  spans: RoleSpan[]
  cursor: number
}

export const setRoleHighlight = StateEffect.define<RoleHighlight>()

/** 光标所在角色的区间；行号槽的竖线按它画。 */
export const activeRoleField = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setRoleHighlight)) return activeRange(effect.value, transaction.state)
    }
    if (!value) return null
    // 文本改动后先把旧区间按变更映射过去，等下一轮防抖同步再精确定位。
    const from = transaction.changes.mapPos(value.from, -1)
    const to = transaction.changes.mapPos(value.to, 1)
    return to > from ? { from, to } : null
  },
})

function activeRange({ spans, cursor }: RoleHighlight, state: EditorState): { from: number; to: number } | null {
  const length = state.doc.length
  const position = Math.min(Math.max(0, cursor), length)
  // 选包含光标的最深跨度——和最内层的结构对齐，父容器不抢戏。
  let active: RoleSpan | null = null
  for (const span of spans) {
    if (position < span.start || position > span.end) continue
    if (!active || span.depth > active.depth) active = span
  }
  if (!active) return null
  const from = Math.min(Math.max(0, active.start), length)
  const to = Math.min(Math.max(from, active.end), length)
  return to > from ? { from, to } : null
}

class RoleBarMarker extends GutterMarker {
  elementClass: string

  constructor(elementClass: string) {
    super()
    this.elementClass = elementClass
  }
}

/** 占位标记：给这条槽撑出固定宽度，免得没有高亮时行号紧贴正文。 */
class RoleSpacerMarker extends GutterMarker {
  elementClass = 'cm-role-spacer'
}

/**
 * 竖线按行拼接：中间行方头，只有首行圆上角、尾行圆下角。
 * 每行都加圆角的话，接缝处会出现一排小缺口。
 */
const barOnly = new RoleBarMarker('cm-role-bar')
const barStart = new RoleBarMarker('cm-role-bar cm-role-start')
const barEnd = new RoleBarMarker('cm-role-bar cm-role-end')
const barStartEnd = new RoleBarMarker('cm-role-bar cm-role-start cm-role-end')
const roleSpacer = new RoleSpacerMarker()

export const roleGutter = gutter({
  class: 'cm-role-gutter',
  initialSpacer: () => roleSpacer,
  lineMarker(view, line) {
    const range = view.state.field(activeRoleField, false)
    if (!range) return null
    if (line.to < range.from || line.from > range.to) return null
    const isStart = range.from >= line.from && range.from <= line.to
    const isEnd = range.to >= line.from && range.to <= line.to
    if (isStart && isEnd) return barStartEnd
    if (isStart) return barStart
    if (isEnd) return barEnd
    return barOnly
  },
  // 高亮是从 React 侧派发进来的，只判断 docChanged / selectionSet 会漏掉它。
  lineMarkerChange: (update) =>
    update.docChanged ||
    update.selectionSet ||
    update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(setRoleHighlight))),
})
