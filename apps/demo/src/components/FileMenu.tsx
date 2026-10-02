import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronDown } from './icons'

interface FileMenuProps {
  documentName: string
  onNew: () => void
  onOpen: (text: string) => void
  onLoadSample: () => void
  onSave: () => void
  onSaveAs: (name: string) => void
  onRename: (name: string) => void
}

type InlineForm = 'saveAs' | 'rename' | null

/**
 * 最左边的「文件」选项卡：点开是一个下拉菜单。
 * 另存为和重命名需要在菜单里输入名字，所以菜单内容会在列表和表单之间切换。
 */
export function FileMenu(props: FileMenuProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<InlineForm>(null)
  const [draft, setDraft] = useState('')
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const box = rootRef.current?.getBoundingClientRect()
      if (box) setAnchor({ left: box.left, top: box.bottom + 2 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => document.removeEventListener('mousedown', onDocumentMouseDown)
  })

  const close = () => {
    setOpen(false)
    setForm(null)
  }

  const startForm = (kind: Exclude<InlineForm, null>) => {
    setDraft(props.documentName)
    setForm(kind)
  }

  const submitForm = () => {
    const name = draft.trim()
    if (name) {
      if (form === 'saveAs') props.onSaveAs(name)
      if (form === 'rename') props.onRename(name)
    }
    close()
  }

  const items = [
    { key: 'new', label: '新建', hint: '清空当前内容，起一份新文档', run: () => props.onNew() },
    { key: 'open', label: '打开…', hint: '从磁盘载入 Markdown', run: () => fileInput.current?.click() },
    { key: 'sample', label: '载入示例文档', hint: '用内置的论文示例替换当前内容', run: () => props.onLoadSample() },
    { key: 'save', label: '保存', hint: '按当前标题下载为 .md', run: () => props.onSave() },
    { key: 'saveAs', label: '另存为…', hint: '换一个文件名保存', run: () => startForm('saveAs') },
    { key: 'rename', label: '重命名…', hint: '改文档标题（写回前置元数据）', run: () => startForm('rename') },
  ]

  return (
    <div className="file-menu" ref={rootRef}>
      <button
        type="button"
        className={`ribbon-tab file-tab${open ? ' active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        文件
        <IconChevronDown />
      </button>

      {open && anchor
        ? createPortal(
            <div
              className="file-panel"
              role="menu"
              aria-label="文件"
              ref={panelRef}
              style={{ left: anchor.left, top: anchor.top }}
            >
              {form ? (
                <form
                  className="file-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitForm()
                  }}
                >
                  <label>
                    {form === 'saveAs' ? '另存为文件名' : '文档标题'}
                    <input
                      type="text"
                      autoFocus
                      aria-label={form === 'saveAs' ? '另存为文件名' : '文档标题'}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          setForm(null)
                        }
                      }}
                    />
                  </label>
                  <div className="file-form-actions">
                    <button type="button" className="mini ghost" onClick={() => setForm(null)}>
                      返回
                    </button>
                    <button type="submit" className="mini primary">
                      确定
                    </button>
                  </div>
                </form>
              ) : (
                items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    className="file-item"
                    title={item.hint}
                    onClick={() => {
                      item.run()
                      if (item.key !== 'saveAs' && item.key !== 'rename' && item.key !== 'open') close()
                    }}
                  >
                    {item.label}
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}

      <input
        ref={fileInput}
        type="file"
        accept="text/markdown,text/plain,.md,.markdown"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          try {
            if (file.size > 5 * 1024 * 1024) throw new Error('Markdown 文件不能超过 5 MB')
            props.onOpen(await file.text())
          } catch (error) {
            window.alert(`无法读取 Markdown：${error instanceof Error ? error.message : String(error)}`)
          } finally {
            event.target.value = ''
            close()
          }
        }}
      />
    </div>
  )
}
