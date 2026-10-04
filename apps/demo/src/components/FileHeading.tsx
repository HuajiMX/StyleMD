import { useEffect, useRef, useState } from 'react'

interface FileHeadingProps {
  /** 文件名主名（不含 .md）。 */
  fileName: string
  /** 文档标题（前置元数据），灰色小字。 */
  documentTitle: string
  onRename: (name: string) => void
}

/**
 * 标题栏正中：大字是**文件名**（点一下变输入框，回车改名），灰色小字是**文档标题**。
 *
 * 文件名和文档标题是两回事：前者决定保存 / 下载用什么名字，后者写在前置元数据里，
 * 供页眉页脚域和正文排版使用，所以标题栏两个都要给。
 */
export function FileHeading({ fileName, documentTitle, onRename }: FileHeadingProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fileName)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Esc 取消后输入框会失焦，别让这次失焦把取消当成确认。 */
  const cancelled = useRef(false)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    setEditing(false)
    const next = draft.trim()
    if (next && next !== fileName) onRename(next)
  }

  const cancel = () => {
    cancelled.current = true
    setDraft(fileName)
    setEditing(false)
  }

  return (
    <div className="doc-heading">
      {editing ? (
        <input
          ref={inputRef}
          className="doc-file-input"
          aria-label="文件名"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancel()
            }
          }}
          onBlur={commit}
        />
      ) : (
        <button
          type="button"
          className="doc-file"
          title="点击重命名文件（回车确认，Esc 取消）"
          onClick={() => {
            setDraft(fileName)
            setEditing(true)
          }}
        >
          {fileName}
        </button>
      )}
      <span className="doc-subtitle" title={documentTitle}>
        {documentTitle}
      </span>
    </div>
  )
}
