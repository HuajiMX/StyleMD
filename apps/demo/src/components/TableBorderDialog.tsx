import { useLayoutEffect, useRef, useState } from 'react'
import type { ComputedStyles, RoleStyle, StyleTheme } from '@stylemd/theme-schema'
import { clamp, useDialogFrame } from '../lib/dialogFrame'
import {
  BORDER_PRESETS,
  BORDER_STYLE_OPTIONS,
  CELL_ROLE,
  HEADER_ROLE,
  applyBorderPreset,
  borderCss,
  currentLine,
  edgeLine,
  edgeOn,
  setEdge,
  type BorderEdgeId,
  type BorderLine,
} from '../lib/tableBorders'
import { Field, NumberInput, Row, Section, SelectInput } from './fields'
import {
  IconBorderGrid,
  IconBorderNone,
  IconBorderOuter,
  IconBorderThreeLine,
} from './icons'

/**
 * 窗口宽度贴着内容定：这页最宽的两块是「预览」那条（四条外框方向键 + 预览图 + 三条内部线，
 * 固定 410px 不会换行）和「设置」四个预设按钮（408px），加窗口内边距与描边约 446。
 * 原来固定 700，表单只用到 410，右边空掉四成。
 * 默认宽度就取这个下限（跟样式窗口一样）：这页没有需要伸展的内容，开窗即最紧。
 */
const MIN_WIDTH = 470
const MIN_HEIGHT = 360

const PRESET_ICONS = {
  none: <IconBorderNone />,
  grid: <IconBorderGrid />,
  outer: <IconBorderOuter />,
  'three-line': <IconBorderThreeLine />,
}

/** 预览图四周的四条外框线（上 / 右 / 下 / 左），位置见 styles.css 的 .border-preview。 */
const OUTER_KEYS = [
  { id: 'outer-top' as const, area: 'bp-top' },
  { id: 'outer-left' as const, area: 'bp-left' },
  { id: 'outer-right' as const, area: 'bp-right' },
  { id: 'outer-bottom' as const, area: 'bp-bottom' },
]

/** 格线三条：表头下线、内部横线、内部竖线，竖着排在预览图右边。 */
const INNER_KEYS: BorderEdgeId[] = ['header-bottom', 'horizontal', 'vertical']

const EDGE_LABELS: Record<BorderEdgeId, string> = {
  'outer-top': '上框线',
  'outer-right': '右框线',
  'outer-bottom': '下框线',
  'outer-left': '左框线',
  'header-bottom': '表头下线',
  horizontal: '内部横线',
  vertical: '内部竖线',
}

interface TableBorderDialogProps {
  theme: StyleTheme
  computed: ComputedStyles
  onRoleChange: (role: string, patch: Partial<RoleStyle>) => void
  onClose: () => void
}

/**
 * 表格「边框和底纹」窗口，照着 Word 的那一页做。
 *
 * 关键差别在"手里的线"：线型 / 粗细 / 颜色**不会**一改就刷到表格上——换线型不该顺手把现有
 * 四条边一起换掉。要应用得明确动作：点「设置」里的预设，或者点预览图上的某一条边
 * （那条边没线就刷上手里的线，有线就撤掉）。这样七条边可以各用各的样式——
 * 「先关掉旧的上框线、再点开」就是"改这条边的样式"这套操作。
 *
 * 表格的边和普通结构不一样：单元格紧密堆积，内部横线 / 内部竖线是相邻单元格**共用**的一条，
 * 所以这里按"边"来操作，落在数据上分别是 `table` 角色的四边、`table.header` 的下边框，
 * 以及 `table` 角色的 `grid`（见 lib/tableBorders.ts 与 core 的格线块）。
 */
export function TableBorderDialog({ theme, computed, onRoleChange, onClose }: TableBorderDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const { frameStyle, setFrame, adjusted, restored, beginDrag, beginResize } = useDialogFrame({
    key: 'table-border-dialog',
    measure: () => ({ width: MIN_WIDTH, height: 470 }),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
  })
  /**
   * 高度贴着内容走（与样式窗口同一套）：开窗时与切换「设置」预设后量一次，用户手动拖过就不再插手。
   * 这页删掉解释小字后内容矮了一截，固定 540 会在「底纹与内边距」和页脚之间留一大块空白。
   */
  useLayoutEffect(() => {
    if (adjusted.current || restored) return
    const dialog = dialogRef.current
    const body = bodyRef.current
    if (!dialog || !body) return
    const style = getComputedStyle(body)
    let content = 0
    for (const child of body.children) content += (child as HTMLElement).offsetHeight
    const chrome =
      dialog.offsetHeight - body.offsetHeight + Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
    setFrame((current) => ({ ...current, height: clamp(content + chrome + 2, MIN_HEIGHT, window.innerHeight - 80) }))
  }, [adjusted, restored, setFrame])
  const [line, setLine] = useState<BorderLine>(() => currentLine(computed))
  const patchLine = (patch: Partial<BorderLine>) => setLine({ ...line, ...patch })

  const toggleEdge = (id: BorderEdgeId) => setEdge(onRoleChange, id, edgeOn(computed, id) ? { style: 'none' } : line)
  const cssOf = (id: BorderEdgeId) => borderCss(edgeLine(computed, id))

  const shade = (role: string) => {
    const explicit = theme.styles.find((style) => style.role === role)?.background?.color
    return explicit ?? computed.roles[role]?.background.color ?? '#ffffff'
  }
  const padding = (role: string) => computed.roles[role]?.paddingPt ?? 0

  return (
    <div className="dialog-layer" onPointerDown={onClose}>
      <section
        ref={dialogRef}
        className="style-dialog border-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="边框和底纹"
        style={frameStyle}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head" onPointerDown={beginDrag} title="按住拖动窗口">
          <h2 className="dialog-title">边框和底纹</h2>
          <button type="button" className="dialog-close" aria-label="关闭边框和底纹窗口" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="dialog-body" ref={bodyRef}>
          <div className="form">
            <Section title="设置">
              <div className="field-chips">
                {BORDER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="field-chip preset-chip"
                    title={`${preset.label}：${preset.hint}`}
                    onClick={() => applyBorderPreset(onRoleChange, preset.id, line)}
                  >
                    {PRESET_ICONS[preset.id]}
                    <strong>{preset.label}</strong>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="边框线" note="选择样式后在下方预览中点击对应边框以刷上样式">
              <Row>
                <Field label="线型" inline>
                  <SelectInput
                    ariaLabel="边框线型"
                    value={line.style}
                    options={BORDER_STYLE_OPTIONS}
                    onChange={(value) => patchLine({ style: value })}
                  />
                </Field>
                <Field label="粗细" inline hint="线宽（pt）">
                  <span className="field-control">
                    <NumberInput
                      value={line.widthPt}
                      inherited={false}
                      min={0.25}
                      step={0.25}
                      ariaLabel="边框粗细 pt"
                      onChange={(value) => patchLine({ widthPt: Math.max(0.25, value ?? 1) })}
                    />
                    <span className="unit">pt</span>
                  </span>
                </Field>
                <Field label="颜色" inline>
                  <input
                    type="color"
                    aria-label="边框颜色"
                    value={line.color}
                    onChange={(event) => patchLine({ color: event.target.value })}
                  />
                </Field>
              </Row>
            </Section>

            <Section title="预览">
              <div className="border-preview">
                {OUTER_KEYS.map(({ id, area }) => (
                  <button
                    key={id}
                    type="button"
                    className={`bp-side ${area}${edgeOn(computed, id) ? ' on' : ''}`}
                    title={`${EDGE_LABELS[id]}：没线就刷上手里的线，有线就撤掉`}
                    aria-label={EDGE_LABELS[id]}
                    aria-pressed={edgeOn(computed, id)}
                    onClick={() => toggleEdge(id)}
                  >
                    {EDGE_LABELS[id].slice(0, 1)}
                  </button>
                ))}
                <span className="bp-canvas" aria-hidden="true">
                  <span
                    className="bp-table"
                    style={{
                      borderTop: cssOf('outer-top'),
                      borderRight: cssOf('outer-right'),
                      borderBottom: cssOf('outer-bottom'),
                      borderLeft: cssOf('outer-left'),
                    }}
                  >
                    {[0, 1, 2].map((row) => (
                      <span
                        key={row}
                        className={`bp-row${row === 0 ? ' bp-head' : ''}`}
                        style={{
                          borderBottom: row === 0 ? cssOf('header-bottom') : row === 1 ? cssOf('horizontal') : 'none',
                        }}
                      >
                        <span className="bp-cell" style={{ borderRight: cssOf('vertical') }} />
                        <span className="bp-cell" />
                      </span>
                    ))}
                  </span>
                </span>
                <span className="bp-inner" role="group" aria-label="内部线">
                  {INNER_KEYS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`bp-side${edgeOn(computed, id) ? ' on' : ''}`}
                      title={`${EDGE_LABELS[id]}：没线就刷上手里的线，有线就撤掉`}
                      aria-label={EDGE_LABELS[id]}
                      aria-pressed={edgeOn(computed, id)}
                      onClick={() => toggleEdge(id)}
                    >
                      {EDGE_LABELS[id]}
                    </button>
                  ))}
                </span>
              </div>
            </Section>

            <Section title="底纹与内边距">
              <Row>
                {(
                  [
                    { role: HEADER_ROLE, label: '表头' },
                    { role: CELL_ROLE, label: '内容' },
                  ] as const
                ).map((panel) => (
                  <Field key={panel.role} label={panel.label} inline>
                    <span className="field-control">
                      <input
                        type="color"
                        aria-label={`${panel.label}底纹色`}
                        value={shade(panel.role)}
                        onChange={(event) => onRoleChange(panel.role, { background: { color: event.target.value } })}
                      />
                      <NumberInput
                        value={padding(panel.role)}
                        inherited={false}
                        min={0}
                        step={1}
                        ariaLabel={`${panel.label}内边距 pt`}
                        onChange={(value) => onRoleChange(panel.role, { paddingPt: Math.max(0, value ?? 0) })}
                      />
                      <span className="unit">pt</span>
                    </span>
                  </Field>
                ))}
              </Row>
            </Section>
          </div>
        </div>

        <footer className="dialog-foot">
          <span className="dialog-note">改动即时生效，随时可以在「开始 → 样式包」里导出这套样式</span>
          <span className="dialog-actions">
            <button type="button" className="primary" onClick={onClose}>
              完成
            </button>
          </span>
        </footer>
        <span className="dialog-resize" onPointerDown={beginResize} role="presentation" />
      </section>
    </div>
  )
}
