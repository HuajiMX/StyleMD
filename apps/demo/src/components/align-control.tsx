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
