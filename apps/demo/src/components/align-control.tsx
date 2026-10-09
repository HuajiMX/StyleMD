export const ALIGN_OPTIONS = [
  { value: 'left' as const, label: '左对齐' },
  { value: 'center' as const, label: '居中' },
  { value: 'right' as const, label: '右对齐' },
  { value: 'justify' as const, label: '两端对齐' },
]

export type AlignValue = (typeof ALIGN_OPTIONS)[number]['value']

/** 对齐图标：四根横条按对齐方式摆放，比文字缩写更容易一眼认出来。 */
function AlignIcon({ mode }: { mode: AlignValue }) {
  const widths = mode === 'justify' ? [14, 14, 14, 8] : [14, 9, 14, 8]
  const offsets =
    mode === 'right'
      ? widths.map((width) => 2 + (14 - width))
      : mode === 'center'
        ? widths.map((width) => 2 + (14 - width) / 2)
        : widths.map(() => 2)

  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      {widths.map((width, index) => (
        <rect key={index} x={offsets[index]} y={3 + index * 3.4} width={width} height={2} rx={1} />
      ))}
    </svg>
  )
}

interface AlignSegmentedProps {
  value: AlignValue
  onChange: (value: AlignValue) => void
}

/** 对齐用的分段按钮，工具栏与样式窗口共用同一套。 */
export function AlignSegmented({ value, onChange }: AlignSegmentedProps) {
  return (
    <span className="seg" role="group" aria-label="段落对齐">
      {ALIGN_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`seg-button${value === option.value ? ' on' : ''}`}
          aria-label={option.label}
          aria-pressed={value === option.value}
          title={option.label}
          onClick={() => onChange(option.value)}
        >
          <AlignIcon mode={option.value} />
        </button>
      ))}
    </span>
  )
}

export type CellAlignH = 'left' | 'center' | 'right'
export type CellAlignV = 'top' | 'middle' | 'bottom'

const H_OPTIONS: { value: CellAlignH; label: string }[] = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中' },
  { value: 'right', label: '右' },
]
const V_OPTIONS: { value: CellAlignV; label: string; suffix: string }[] = [
  { value: 'top', label: '上', suffix: '上' },
  { value: 'middle', label: '中', suffix: '中' },
  { value: 'bottom', label: '下', suffix: '下' },
]

/**
 * 单元格对齐的九宫格图标：一个方框里两条短线，横轴按左/中/右摆、竖轴按上/中/下摆，
 * 和 Word 的「单元格对齐方式」九宫格是同一套读法（行＝竖轴，列＝横轴）。
 */
function CellAlignGlyph({ h, v }: { h: CellAlignH; v: CellAlignV }) {
  // 短线的左右起点：左对齐贴左边、居中居中、右对齐贴右边
  const lengths = [6, 4]
  const offsets =
    h === 'right'
      ? lengths.map((length) => 13 - length)
      : h === 'center'
        ? lengths.map((length) => 8 - length / 2)
        : lengths.map(() => 3)
  const top = v === 'top' ? 4.2 : v === 'middle' ? 6.6 : 9
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {offsets.map((offset, index) => (
        <line
          key={index}
          x1={offset}
          x2={offset + lengths[index]!}
          y1={top + index * 2.2}
          y2={top + index * 2.2}
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="square"
        />
      ))}
    </svg>
  )
}

interface CellAlignGridProps {
  value: { h: CellAlignH; v: CellAlignV }
  /** 九宫格的按钮比较多，无障碍名要带上这组是给谁用的（「表头」「内容」）。 */
  label: string
  onChange: (h: CellAlignH, v: CellAlignV) => void
}

/** 九宫格对齐：3 列（左/中/右）× 3 行（上/中/下）。 */
export function CellAlignGrid({ value, label, onChange }: CellAlignGridProps) {
  return (
    <span className="cell-align-grid" role="group" aria-label={`${label}对齐`}>
      {V_OPTIONS.flatMap((vertical) =>
        H_OPTIONS.map((horizontal) => {
          const on = value.h === horizontal.value && value.v === vertical.value
          const text = `${horizontal.label}${vertical.suffix}`
          return (
            <button
              key={`${horizontal.value}-${vertical.value}`}
              type="button"
              className={`cell-align-cell${on ? ' on' : ''}`}
              aria-label={`${label}${text}`}
              aria-pressed={on}
              title={`${label}${text}`}
              onClick={() => onChange(horizontal.value, vertical.value)}
            >
              <CellAlignGlyph h={horizontal.value} v={vertical.value} />
            </button>
          )
        }),
      )}
    </span>
  )
}
