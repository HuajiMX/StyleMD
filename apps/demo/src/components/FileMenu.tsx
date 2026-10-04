import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { canWriteFiles, openMarkdownFile, type OpenedFile } from '../lib/document'
import { IconChevronDown } from './icons'

interface FileMenuProps {
  /** 文件名主名（不含 .md），「另存为」表单拿它当默认值。 */
  fileName: string
  onNew: () => void
  onOpenFile: (file: OpenedFile) => void
  onLoadSample: () => void
  onSave: () => void
  onSaveAs: (name: string) => void
  autoSave: boolean
  onAutoSaveChange: (enabled: boolean) => void
  /** 预览里指针移动的计数：父文档收不到任何鼠标事件，只能由宿主转发这声通报。 */
  previewHoverTick: number
}

type InlineForm = 'saveAs' | null

/**
 * 最左边的「文件」选项卡：点开是一个下拉菜单。
 * 另存为和重命名需要在菜单里输入名字，所以菜单内容会在列表和表单之间切换。
 *
 * 展开规则：悬停即开、移开即收，点一下钉住（长期打开）。菜单面板是 portal 到 body 的，
 * 指针从选项卡走到面板会先触发 root 的 mouseleave，所以收起要留一点缓冲，靠面板的
 * mouseenter 取消；表单打开时不自动收起，免得鼠标一走就丢掉正在输入的名字。
 */
export function FileMenu(props: FileMenuProps) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [form, setForm] = useState<InlineForm>(null)
  const [draft, setDraft] = useState('')
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  /** `<input type=file>` 是弹不出系统对话框（或调用失败）时的兜底，用 Promise 包一层好 await。 */
  const pendingPick = useRef<((file: File | null) => void) | null>(null)
  const closeTimer = useRef<number | null>(null)
  const open = pinned || hovered

  const pickWithInput = () =>
    new Promise<File | null>((resolve) => {
      const input = fileInput.current
      if (!input) {
        resolve(null)
        return
      }
      pendingPick.current = resolve
      input.click()
    })

  const cancelPendingClose = () => {
    if (closeTimer.current === null) return
    window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  const close = () => {
    cancelPendingClose()
    setPinned(false)
    setHovered(false)
    setForm(null)
  }

  const enterMenu = () => {
    cancelPendingClose()
    setHovered(true)
  }

  const leaveMenu = () => {
    if (form) return
    cancelPendingClose()
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setHovered(false)
    }, 140)
  }

  useEffect(() => cancelPendingClose, [])

  // 指针移到预览上：父文档不再收到事件，靠宿主转发的通报把悬停态收起来（钉住的不受影响）。
  useEffect(() => {
    leaveMenu()
  }, [props.previewHoverTick])

  // 悬停判定统一走 document 上的 pointermove，而不是 onMouseEnter/onMouseLeave：
  //  - 指针移进预览 iframe 时父文档收不到任何鼠标事件，靠 leave 事件菜单会一直挂着；
  //  - 从 iframe 回到选项卡时，浏览器可能因为冻结的 :hover 状态不再补 mouseenter，也得靠它兜底。
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && (rootRef.current?.contains(target) || panelRef.current?.contains(target))) {
        enterMenu()
        return
      }
      if (open) leaveMenu()
    }
    document.addEventListener('pointermove', onPointerMove)
    return () => document.removeEventListener('pointermove', onPointerMove)
  })

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  })

  const startForm = (kind: Exclude<InlineForm, null>) => {
    setDraft(props.fileName)
    setForm(kind)
    // 已经在输入了就别再被悬停收起打断。
    setPinned(true)
  }

  const submitForm = () => {
    const name = draft.trim()
    if (name && form === 'saveAs') props.onSaveAs(name)
    close()
  }

  const handleOpen = async () => {
    try {
      const picked = await openMarkdownFile(pickWithInput)
      if (picked) props.onOpenFile(picked)
    } catch (error) {
      window.alert(`无法读取 Markdown：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      close()
    }
  }

  const items = [
    { key: 'new', label: '新建', hint: '清空当前内容，起一份新文档', run: () => props.onNew() },
    {
      key: 'open',
      label: '打开…',
      hint: '从磁盘载入 Markdown，之后「保存」写回同一个文件',
      run: () => void handleOpen(),
    },
    { key: 'sample', label: '载入示例文档', hint: '用内置的论文示例替换当前内容', run: () => props.onLoadSample() },
    {
      key: 'save',
      label: '保存',
      hint: canWriteFiles() ? '写回打开的文件；还没打开文件就按「另存为」处理' : '当前浏览器不能直接写文件，改为下载 .md',
      run: () => props.onSave(),
    },
    {
      key: 'saveAs',
      label: '另存为…',
      hint: canWriteFiles() ? '选一个文件写进去（文件名在系统对话框里改）' : '换一个文件名下载一份',
      // 能写文件时文件名交给系统对话框，不用先在自己这个输入框里问一遍
      run: () => (canWriteFiles() ? void props.onSaveAs(props.fileName) : startForm('saveAs')),
    },
  ]

  return (
    <div className="file-menu" ref={rootRef} onMouseEnter={enterMenu}>
      <button
        type="button"
        className={`ribbon-tab file-tab${open ? ' active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="悬停展开，点击钉住"
        onClick={() => {
          if (pinned) {
            close()
            return
          }
          setPinned(true)
          setHovered(true)
        }}
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
              onMouseEnter={enterMenu}
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
                    另存为文件名
                    <input
                      type="text"
                      autoFocus
                      aria-label="另存为文件名"
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
                <>
                  {items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitem"
                      className="file-item"
                      title={item.hint}
                      onClick={() => {
                        item.run()
                        if (item.key !== 'saveAs' && item.key !== 'open') close()
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                  <span className="file-sep" role="separator" />
                  <label className="file-item file-check" title="改动停下后自动把文档与样式写进浏览器会话；关掉后刷新不会恢复">
                    <input
                      type="checkbox"
                      checked={props.autoSave}
                      onChange={(event) => props.onAutoSaveChange(event.target.checked)}
                    />
                    自动保存
                  </label>
                </>
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
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          event.target.value = ''
          pendingPick.current?.(file)
          pendingPick.current = null
        }}
      />
    </div>
  )
}
