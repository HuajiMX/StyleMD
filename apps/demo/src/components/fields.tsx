import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CHINESE_FONT_SIZES, formatFontSize, parseFontSize } from '../lib/typePresets'

interface FieldProps {
  /** 传空串表示不要标签，控件自己说明自己（工具带里的字体名、字号就是这种）。 */
  label: string
  hint?: string
  inherited?: boolean
  /** 工具栏那种一眼要扫过很多项的场合，标签列收窄一点。 */
  compact?: boolean
  /** 表单里的行内排布：标签紧贴控件，控件保持自身宽度，一行可以并排放好几组。 */
  inline?: boolean
  /** 行内排布里需要更宽控件时用（例如字体族的回退链）。 */
  wide?: boolean
  children: ReactNode
}

export function Field({ label, hint, inherited, compact, inline, wide, children }: FieldProps) {
  const className = [
    'field',
    label ? '' : 'bare',
    inline ? 'inline' : '',
    wide ? 'wide' : '',
    inherited ? 'inherited' : '',
    compact ? ' compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label className={className} title={hint}>
      {label ? <span className="field-label">{label}</span> : null}
      <span className="field-control">{children}</span>
    </label>
  )
}

interface NumberInputProps {
  value: number | undefined
  inherited: boolean
  min?: number
  max?: number
  step?: number
  ariaLabel?: string
  onChange: (value: number | undefined) => void
}

export function NumberInput({ value, inherited, min, max, step = 0.5, ariaLabel, onChange }: NumberInputProps) {
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      className={inherited ? 'inherited-input' : ''}
      value={value ?? ''}
      min={min}
      max={max}
      step={step}
      onChange={(event) => {
        const raw = event.target.value
        onChange(raw === '' ? undefined : Number(raw))
      }}
    />
  )
}

interface SelectInputProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  inherited?: boolean
  ariaLabel?: string
  onChange: (value: T) => void
}

export function SelectInput<T extends string>({ value, options, inherited, ariaLabel, onChange }: SelectInputProps<T>) {
  return (
    <select
      aria-label={ariaLabel}
      className={inherited ? 'inherited-input' : ''}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export interface ComboOption {
  value: string
  label: string
  hint?: string
}

interface Anchor {
  left: number
  top: number
  width: number
}

/**
 * 悬浮面板的定位与关闭：面板挂在 body 上（功能区和弹窗都会裁剪子元素），
 * 用 fixed 定位贴着触发元素下沿，滚动或改窗口大小时跟着挪。
 */
function useAnchoredPanel(open: boolean, onDismiss: () => void) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const box = rootRef.current?.getBoundingClientRect()
      if (box) setAnchor({ left: box.left, top: box.bottom + 2, width: box.width })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      dismissRef.current()
    }
    // 必须用捕获阶段的 pointerdown：样式窗口在 `.style-dialog` 上用 stopPropagation 挡住
    // 「点窗口内部顺手关掉窗口」，而 React 18 把事件委托挂在 #root，原生事件冒泡到那里就被截住了，
    // 冒泡阶段的 document 监听收不到弹窗内部的点击，字号下拉点外部就收不起来。
    // 用 pointerdown 而不是 mousedown：窗口右下角的缩放把手在 pointerdown 里 preventDefault，
    // 后续的 mousedown 压根不会产生，压在把手上时照样得能把下拉收起来。
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  }, [open])

  return { rootRef, panelRef, anchor }
}

interface ComboProps {
  /** 未编辑时显示的内容。 */
  value: string
  options: ComboOption[]
  ariaLabel: string
  title?: string
  className?: string
  inherited?: boolean
  /** 回车或失焦时交出用户敲的原文，由调用方决定接受还是忽略。 */
  onCommit: (text: string) => void
  onPick: (value: string) => void
}

/**
 * 输入框 + 下拉候选。
 *
 * 用 datalist 会踩一个坑：浏览器按输入框当前文本前缀过滤候选，
 * 框里只要不是候选的完整前缀，下拉就是空的——看起来就是"下拉用不了"。
 * 这里自己控制候选列表，输入时按包含关系过滤，不输入时给全量。
 */
export function Combo({ value, options, ariaLabel, title, className, inherited, onCommit, onPick }: ComboProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const { rootRef, panelRef, anchor } = useAnchoredPanel(open, () => setOpen(false))

  // 只在用户真的动过输入框后才过滤，否则一聚焦就只剩当前值一项。
  const query = draft?.trim().toLowerCase() ?? ''
  const shown = draft !== null && query
    ? options.filter((option) => option.label.toLowerCase().includes(query) || option.hint?.toLowerCase().includes(query))
    : options

  const commit = (text: string | null) => {
    setDraft(null)
    setOpen(false)
    if (text !== null) onCommit(text)
  }

  return (
    <span className={`combo${className ? ` ${className}` : ''}`} ref={rootRef}>
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-autocomplete="list"
        title={title}
        className={inherited ? 'inherited-input' : ''}
        value={draft ?? value}
        onChange={(event) => {
          setDraft(event.target.value)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(draft)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            commit(null)
          }
        }}
        onBlur={() => {
          // 光标离开输入框就提交：点别处、切标签都算数；点候选按钮和候选本身已经 preventDefault，不会触发这里。
          commit(draft)
        }}
      />
      <button
        type="button"
        className="combo-toggle"
        tabIndex={-1}
        aria-label={`${ariaLabel}候选`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((previous) => !previous)}
      >
        ▾
      </button>
      {open && anchor
        ? createPortal(
            <span
              className="combo-list"
              ref={panelRef}
              role="listbox"
              aria-label={`${ariaLabel}候选`}
              style={{ left: anchor.left, top: anchor.top, minWidth: Math.max(anchor.width, 112) }}
            >
          {shown.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.label === value}
              className="combo-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setDraft(null)
                setOpen(false)
                onPick(option.value)
              }}
            >
              <span>{option.label}</span>
              {option.hint ? <em>{option.hint}</em> : null}
            </button>
          ))}
          {shown.length === 0 ? <span className="combo-empty">没有匹配的候选</span> : null}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}

interface PopoverProps {
  label: string
  title?: string
  className?: string
  /** 触发按钮里的内容：图标 + 当前值。 */
  trigger: ReactNode
  /** 面板关闭前的收尾（例如把正在编辑的数字提交掉），只在点外面或再点一次触发按钮时调用。 */
  onBeforeClose?: () => void
  children: (close: () => void) => ReactNode
}

/** 图标按钮 + 悬浮面板，工具带里改数值用它，省掉一行一个输入框。 */
export function Popover({ label, title, className, trigger, onBeforeClose, children }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const beforeCloseRef = useRef(onBeforeClose)
  beforeCloseRef.current = onBeforeClose
  const dismiss = () => {
    if (!open) return
    beforeCloseRef.current?.()
    setOpen(false)
  }
  const { rootRef, panelRef, anchor } = useAnchoredPanel(open, dismiss)

  return (
    <span className={`popover${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        className="popover-trigger"
        aria-label={label}
        aria-expanded={open}
        title={title ?? label}
        onClick={() => (open ? dismiss() : setOpen(true))}
      >
        {trigger}
      </button>
      {open && anchor
        ? createPortal(
            <span
              className="popover-panel"
              ref={panelRef}
              style={{ left: anchor.left, top: anchor.top, minWidth: Math.max(anchor.width, 128) }}
            >
              {children(() => setOpen(false))}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}


interface FontSizeComboProps {
  value: number
  inherited: boolean
  ariaLabel?: string
  onChange: (value: number) => void
}

/**
 * 字号：一个控件里同时能下拉（中文字号）和直接输入（中文或数字）。
 * 输入不合规就当没发生，显示回原来的值。
 */
export function FontSizeCombo({ value, inherited, ariaLabel = '字号 pt', onChange }: FontSizeComboProps) {
  return (
    <Combo
      className="font-size-combo"
      ariaLabel={ariaLabel}
      inherited={inherited}
      title="可下拉选「小四」这类中文字号，也可直接输入中文或数字（单位 pt）"
      value={formatFontSize(value)}
      options={CHINESE_FONT_SIZES.map((size) => ({ value: size.label, label: size.label, hint: `${size.pt}pt` }))}
      onPick={(label) => {
        const size = CHINESE_FONT_SIZES.find((item) => item.label === label)
        if (size) onChange(size.pt)
      }}
      onCommit={(text) => {
        const parsed = parseFontSize(text)
        if (parsed !== null) onChange(parsed)
      }}
    />
  )
}

interface ToggleChipProps {
  label: string
  checked: boolean
  title?: string
  onChange: (checked: boolean) => void
}

export function ToggleChip({ label, checked, title, onChange }: ToggleChipProps) {
  return (
    <label className={`chip-toggle${checked ? ' on' : ''}`} title={title}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

interface IconToggleProps {
  label: string
  checked: boolean
  title?: string
  /** 图标；不传就用 label 当字形（加粗用的就是 B / I / U 这三个字形）。 */
  glyph?: ReactNode
  className?: string
  onChange: (checked: boolean) => void
}

/** 工具带里的开关：无边框方角小按钮，按下时才有底色，和 Word 的 B / I / U 一致。 */
export function IconToggle({ label, checked, title, glyph, className, onChange }: IconToggleProps) {
  return (
    <button
      type="button"
      className={`icon-toggle${checked ? ' on' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      aria-pressed={checked}
      title={title ?? label}
      onClick={() => onChange(!checked)}
    >
      {glyph ?? label}
    </button>
  )
}

interface IconButtonProps {
  label: string
  title?: string
  disabled?: boolean
  /** 图标旁边的短文字，两三个字以内；能靠图标认出来的动作就留空。 */
  text?: string
  children: ReactNode
  onClick: () => void
}

export function IconButton({ label, title, disabled, text, children, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button${text ? ' with-text' : ''}`}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      {text ? <span>{text}</span> : null}
    </button>
  )
}

interface SectionProps {
  title: string
  /** 分区标题右侧的补充说明，例如「对 1–3 级标题生效」。 */
  note?: string
  children: ReactNode
}

/**
 * 表单分区：小标题 + 一条拉到右边的细线，下面跟若干行。
 * 不画卡片框，靠线和留白分块——纸张表单一直是这么排的。
 */
export function Section({ title, note, children }: SectionProps) {
  return (
    <section className="form-section">
      <h4 className="section-title">
        <span>{title}</span>
        <i className="section-rule" />
        {note ? <em className="section-note">{note}</em> : null}
      </h4>
      <div className="section-body">{children}</div>
    </section>
  )
}

/** 一行：里面按「标签: 控件」成组排，一行放不下自动换行。 */
export function Row({ children }: { children: ReactNode }) {
  return <div className="form-row">{children}</div>
}
