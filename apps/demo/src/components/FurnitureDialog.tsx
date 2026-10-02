import { useRef } from 'react'
import type { PageFurniture, PageSetup } from '@stylemd/theme-schema'
import { useDialogFrame } from '../lib/dialogFrame'
import { Field, NumberInput, Row, Section, ToggleChip } from './fields'

export type FurnitureArea = 'header' | 'footer'

const SLOTS = [
  { key: 'left' as const, label: '左部' },
  { key: 'center' as const, label: '中部' },
  { key: 'right' as const, label: '右部' },
]

/** 快捷域：写进页眉页脚字符串，构建时分页器会替换成实际内容。 */
const FIELD_CHIPS = [
  { token: '{page}', label: '页码', hint: '当前页码' },
  { token: '{pages}', label: '总页数', hint: '文档总页数' },
  { token: '{title}', label: '文档标题', hint: '标题栏里的文档名' },
  { token: '{date}', label: '日期', hint: '导出当天日期' },
]

const MIN_WIDTH = 560
const MIN_HEIGHT = 320

interface FurnitureDialogProps {
  area: FurnitureArea
  page: PageSetup
  onChange: (patch: Partial<PageSetup>) => void
  /** 打开这个区域的样式窗口（page.header / page.footer 角色）。 */
  onOpenStyle: () => void
  /** 取消：回到打开弹窗时的页面设置。 */
  onCancel: () => void
  onClose: () => void
}

/**
 * 页眉 / 页脚编辑弹窗。仿 Word 的三段式（左部 / 中部 / 右部）+ 快捷域按钮：
 * 光标停在哪个输入框，点域按钮就往哪里插。改动即时生效，取消则整页设置回滚。
 */
export function FurnitureDialog({ area, page, onChange, onOpenStyle, onCancel, onClose }: FurnitureDialogProps) {
  const title = area === 'header' ? '页眉' : '页脚'
  const distanceLabel = area === 'header' ? '距页面顶部' : '距页面底部'
  const furniture: PageFurniture = (area === 'header' ? page.header : page.footer) ?? {}
  const { frameStyle, beginDrag, beginResize } = useDialogFrame({
    key: `furniture-${area}`,
    measure: () => ({ width: 720, height: 360 }),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
  })
  const inputRefs = useRef<Record<(typeof SLOTS)[number]['key'], HTMLInputElement | null>>({
    left: null,
    center: null,
    right: null,
  })
  const focusedSlot = useRef<(typeof SLOTS)[number]['key']>('center')

  const patch = (next: Partial<PageFurniture>) => onChange({ [area]: { ...furniture, ...next } })

  const insertField = (token: string) => {
    const key = focusedSlot.current
    const input = inputRefs.current[key]
    const current = furniture[key] ?? ''
    const start = input?.selectionStart ?? current.length
    const end = input?.selectionEnd ?? current.length
    patch({ [key]: `${current.slice(0, start)}${token}${current.slice(end)}` })
    // 等受控输入把新值刷进 DOM，再把光标放到插入内容之后，方便接着插下一个域。
    requestAnimationFrame(() => {
      const target = inputRefs.current[key]
      if (!target) return
      const caret = start + token.length
      target.focus()
      target.setSelectionRange(caret, caret)
    })
  }

  return (
    <div className="dialog-layer" onPointerDown={onClose}>
      <section
        className="style-dialog furniture-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${title}配置`}
        style={frameStyle}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head" onPointerDown={beginDrag} title="按住拖动窗口">
          <h2 className="dialog-title">{title}</h2>
          <span className="dialog-sub">分左、中、右三段，可用下面的域按钮插入页码、标题等</span>
          <button type="button" className="dialog-close" aria-label={`关闭${title}窗口`} onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="dialog-body">
          <div className="form">
            <Section title="插入域" note="光标停在哪个输入框，就插到哪个位置">
              <div className="field-chips">
                {FIELD_CHIPS.map((field) => (
                  <button
                    key={field.token}
                    type="button"
                    className="field-chip"
                    title={field.hint}
                    onClick={() => insertField(field.token)}
                  >
                    <strong>{field.label}</strong>
                    <code>{field.token}</code>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="内容">
              <div className="furniture-grid">
                {SLOTS.map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <input
                      ref={(element) => {
                        inputRefs.current[key] = element
                      }}
                      type="text"
                      aria-label={`${title}${label}`}
                      value={furniture[key] ?? ''}
                      onFocus={() => {
                        focusedSlot.current = key
                      }}
                      onChange={(event) => patch({ [key]: event.target.value })}
                    />
                  </Field>
                ))}
              </div>
            </Section>

            <Section title="位置">
              <Row>
                <Field label={distanceLabel} hint="单位 mm，留空则在页边距区里居中">
                  <NumberInput
                    value={furniture.distanceMm}
                    inherited={false}
                    min={0}
                    step={1}
                    ariaLabel={`${title}${distanceLabel} mm`}
                    onChange={(value) => patch({ distanceMm: value })}
                  />
                </Field>
                <ToggleChip
                  label="首页不显示页眉页脚"
                  checked={page.skipFurnitureOnFirstPage ?? false}
                  onChange={(checked) => onChange({ skipFurnitureOnFirstPage: checked })}
                />
              </Row>
            </Section>
          </div>
        </div>

        <footer className="dialog-foot">
          <span className="dialog-note">改动即时生效，取消会回到打开窗口时的设置</span>
          <span className="dialog-actions">
            <button type="button" className="secondary" onClick={onOpenStyle}>
              样式
            </button>
            <button type="button" className="secondary" onClick={onCancel}>
              取消
            </button>
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
