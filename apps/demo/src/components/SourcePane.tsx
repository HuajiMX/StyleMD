import type { CSSProperties, RefObject } from 'react'

interface SourcePaneProps {
  value: string
  textareaRef: RefObject<HTMLTextAreaElement>
  onChange: (value: string) => void
  onCursorChange: (offset: number) => void
  /** 滚动进度 0–1，用来让预览跟着走。 */
  onScrollRatio: (ratio: number) => void
  /** 布局由上层决定：并排时要给固定基准宽度，单独展示时铺满。 */
  style?: CSSProperties
}

/**
 * Markdown 源。除了编辑，它还是「当前在改哪个结构」的输入源：
 * 光标一移动就把偏移报给上层，功能区据此把字体 / 段落定位到对应样式。
 * 窗格标题栏已经去掉，字符数和缩放都收进了全局底部栏。
 */
export function SourcePane({ value, textareaRef, onChange, onCursorChange, onScrollRatio, style }: SourcePaneProps) {
  return (
    <section className="pane source-pane" style={style}>
      <textarea
        ref={textareaRef}
        className="source-input"
        aria-label="Markdown 源"
        spellCheck={false}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          onCursorChange(event.target.selectionStart)
        }}
        onSelect={(event) => onCursorChange(event.currentTarget.selectionStart)}
        onClick={(event) => onCursorChange(event.currentTarget.selectionStart)}
        onKeyUp={(event) => onCursorChange(event.currentTarget.selectionStart)}
        onFocus={(event) => onCursorChange(event.currentTarget.selectionStart)}
        onScroll={(event) => {
          const { scrollTop, scrollHeight, clientHeight } = event.currentTarget
          const range = scrollHeight - clientHeight
          onScrollRatio(range > 0 ? scrollTop / range : 0)
        }}
      />
    </section>
  )
}
