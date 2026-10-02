import { useEffect, useRef, type CSSProperties, type MutableRefObject } from 'react'
import type { RoleSpan } from '@stylemd/core'
import { createSourceEditor, type SourceEditor } from '../lib/editor/createEditor'
import type { SourceEditorHandle } from '../lib/editor/types'

interface SourcePaneProps {
  value: string
  editorRef: MutableRefObject<SourceEditorHandle | null>
  onChange: (value: string) => void
  onCursorChange: (offset: number) => void
  /** 滚动进度 0–1，用来让预览跟着走。 */
  onScrollRatio: (ratio: number) => void
  /** 结构角色跨度（原始文本坐标），用于「光标在哪，哪儿就亮」。 */
  roleSpans: RoleSpan[]
  cursorOffset: number
  /** 布局由上层决定：并排时要给固定基准宽度，单独展示时铺满。 */
  style?: CSSProperties
}

/**
 * Markdown 源。除了编辑，它还是「当前在改哪个结构」的输入源：
 * 光标一移动就把偏移报给上层，功能区据此把字体 / 段落定位到对应样式。
 *
 * 编辑器内核是 CodeMirror 6，生命期只有一次——回调走 ref 转发，
 * 避免每次渲染重建编辑器而丢掉光标、撤销栈与滚动位置。
 */
export function SourcePane({
  value,
  editorRef,
  onChange,
  onCursorChange,
  onScrollRatio,
  roleSpans,
  cursorOffset,
  style,
}: SourcePaneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorInstanceRef = useRef<SourceEditor | null>(null)
  const handlersRef = useRef({ onChange, onCursorChange, onScrollRatio })
  handlersRef.current = { onChange, onCursorChange, onScrollRatio }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const editor = createSourceEditor({
      parent: host,
      value,
      onChange: (next) => handlersRef.current.onChange(next),
      onCursor: (offset) => handlersRef.current.onCursorChange(offset),
      onScrollRatio: (ratio) => handlersRef.current.onScrollRatio(ratio),
    })
    editorInstanceRef.current = editor
    editorRef.current = editor

    if (new URLSearchParams(window.location.search).has('e2e')) {
      window.__stylemdEditor = {
        getValue: () => editor.getValue(),
        setValue: (next) => editor.setValue(next),
        getCursor: () => editor.view.state.selection.main.head,
        setCursor: (offset) => editor.setCursor(offset),
        getScrollTop: () => editor.view.scrollDOM.scrollTop,
        setScrollTop: (top) => {
          editor.view.scrollDOM.scrollTop = top
        },
        getScrollRatio: () => editor.getScrollRatio(),
      }
    }

    return () => {
      delete window.__stylemdEditor
      editorRef.current = null
      editorInstanceRef.current = null
      editor.destroy()
    }
    // 编辑器只建一次；外部值变化由下面的 effect 推给它。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部值变化（新建 / 载入示例 / 打开文件 / 重命名）才整篇替换；
  // 用户自己敲进来的内容不会走这里，因为两边字符串已经相等。
  useEffect(() => {
    editorInstanceRef.current?.setValue(value)
  }, [value])

  // 结构高亮：角色跨度或光标一变就推一次。
  useEffect(() => {
    editorInstanceRef.current?.setRoleHighlight({ spans: roleSpans, cursor: cursorOffset })
  }, [roleSpans, cursorOffset])

  return (
    <section className="pane source-pane" style={style}>
      <div className="source-input" aria-label="Markdown 源" ref={hostRef} />
    </section>
  )
}
