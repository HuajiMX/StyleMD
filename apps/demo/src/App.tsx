import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { build, collectRoleSpans, roleAtOffset, type BuildResult } from '@stylemd/core'
import { BUILT_IN_THEMES, getBuiltInTheme } from '@stylemd/presets'
import { PREVIEW_CHROME_CSS, injectHeadStyle, injectPagedPolyfill } from '@stylemd/renderer-paged'
import {
  migrateTheme,
  validateTheme,
  type DocumentDefaults,
  type PageSetup,
  type RoleStyle,
  type StyleTheme,
  type TableSpec,
} from '@stylemd/theme-schema'
import pagedPolyfill from '@pagedjs-polyfill?raw'
import sampleMarkdown from '../../../examples/sample-thesis.md?raw'
import { OutlinePanel } from './components/OutlinePanel'
import { PreviewPane, type PreviewFrame, type PreviewSlot } from './components/PreviewPane'
import { EditorSchemeDialog } from './components/EditorSchemeDialog'
import { FurnitureDialog } from './components/FurnitureDialog'
import { Ribbon, type RibbonTab } from './components/Ribbon'
import { SourcePane } from './components/SourcePane'
import { StatusBar, type ViewMode } from './components/StatusBar'
import { StyleDialog } from './components/StyleDialog'
import { TableBorderDialog } from './components/TableBorderDialog'
import {
  blankDocument,
  documentTitle,
  fileStem,
  markdownFileName,
  openMarkdownFile,
  saveMarkdownAs,
  writeToHandle,
  type FileHandle,
  type OpenedFile,
} from './lib/document'
import { startWidthDrag } from './lib/dragResize'
import { desktopBridge } from './lib/desktop'
import { specimenFontFaces } from './lib/inlineStyle'
import { documentOutline, type OutlineItem } from './lib/outline'
import { formatSavedAt, loadAutoSave, loadSession, saveAutoSave, saveSession } from './lib/session'
import { previewShortcuts, useShortcuts, type ShortcutId } from './lib/shortcuts'
import type { SourceEditorHandle } from './lib/editor/types'
import { activeScheme, applyScheme, loadSchemeLibrary, saveSchemeLibrary } from './lib/editor/scheme'
import { SCHEME_RIBBON_LIMIT, markSchemeUsed, orderSchemesByRecent, type EditorSchemeLibrary } from '@stylemd/editor-theme'
import { clearRoleGroup, resetRoleStyle, updateDefaults, updatePage, updateTable, upsertRoleStyle } from './lib/themeOps'
import { useDebounced } from './lib/useDebounced'
import {
  EDITOR_FONT_DEFAULT_PX,
  EDITOR_FONT_STEP_PX,
  ZOOM_STEP,
  clampEditorFontPx,
  clampZoom,
  takeWheelZoomSteps,
} from './lib/zoom'

const MIN_NAV_WIDTH = 160
const MAX_NAV_WIDTH = 420
const MIN_EDITOR_WIDTH = 240

export function App() {
  // 上一次的存档：文档、光标、样式包、界面布局。坏档一律当没有。
  const [session] = useState(() => loadSession())
  const [markdown, setMarkdown] = useState(() => session?.markdown ?? sampleMarkdown)
  /** 当前文件名（含扩展名）；null = 还没保存成文件，标题栏显示「未命名」。 */
  const [fileName, setFileName] = useState<string | null>(() => session?.fileName ?? null)
  const [theme, setTheme] = useState<StyleTheme>(() => {
    if (session?.theme) {
      try {
        const { theme: restored } = migrateTheme(session.theme)
        if (validateTheme(restored).ok) return restored
      } catch {
        // 存档里的样式包不可用，就用默认预设。
      }
    }
    return getBuiltInTheme('tech-document') ?? BUILT_IN_THEMES[0]!
  })
  const [history, setHistory] = useState<StyleTheme[]>([])
  const themeRef = useRef(theme)
  const applyTheme = useCallback((next: StyleTheme) => {
    themeRef.current = next
    setTheme(next)
  }, [])
  const changeTheme = useCallback((update: StyleTheme | ((current: StyleTheme) => StyleTheme)) => {
    const current = themeRef.current
    const next = typeof update === 'function' ? update(current) : update
    setHistory((previous) => [...previous.slice(-49), current])
    applyTheme(next)
  }, [applyTheme])

  const [dialogRole, setDialogRole] = useState<string | null>(null)
  const [borderDialogOpen, setBorderDialogOpen] = useState(false)
  const [schemeDialogOpen, setSchemeDialogOpen] = useState(false)
  const [furnitureArea, setFurnitureArea] = useState<'header' | 'footer' | null>(null)
  /** 打开页眉页脚弹窗时的整页设置；「取消」用它回滚即时改动。 */
  const furnitureSnapshot = useRef<PageSetup | null>(null)
  const [schemeLibrary, setSchemeLibrary] = useState<EditorSchemeLibrary>(() => loadSchemeLibrary())
  const currentScheme = useMemo(() => activeScheme(schemeLibrary), [schemeLibrary])
  // 工具带固定只摆 SCHEME_RIBBON_LIMIT 个，按最近使用排序，其余走「更多」。
  const ribbonSchemes = useMemo(
    () => orderSchemesByRecent(schemeLibrary).slice(0, SCHEME_RIBBON_LIMIT),
    [schemeLibrary],
  )
  useEffect(() => applyScheme(currentScheme.tokens), [currentScheme])
  useEffect(() => saveSchemeLibrary(schemeLibrary), [schemeLibrary])
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>('start')
  const [cursorOffset, setCursorOffset] = useState(() => Math.max(0, session?.cursorOffset ?? 0))
  const [zoom, setZoom] = useState(() => session?.zoom ?? 0.85)
  /** 编辑器字号（px）：编辑器上的 Ctrl+滚轮改，随会话存下来（只影响源码区，不动预览与导出）。 */
  const [editorFontPx, setEditorFontPx] = useState(() =>
    clampEditorFontPx(session?.editorFontPx ?? EDITOR_FONT_DEFAULT_PX),
  )
  const [autoDetect, setAutoDetect] = useState(true)
  /**
   * 排版状态。`error` 与 `timeout` 分开：前者是 iframe 里真抛了异常上报回来（原文挂在 `pagedError` 上），
   * 后者是宿主自己那份 60 秒兜底计时——两者原来共用一句「分页失败」，出事时根本分不出是哪条路。
   */
  const [pagedStatus, setPagedStatus] = useState<'pending' | 'paged' | 'error' | 'timeout'>('pending')
  /** 渲染失败的原因（iframe 的 catch 里那份），只挂在状态栏那串字的 title 上。 */
  const [pagedError, setPagedError] = useState('')
  const [readyId, setReadyId] = useState('')
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    session?.viewMode === 'edit' || session?.viewMode === 'preview' || session?.viewMode === 'both'
      ? session.viewMode
      : 'both',
  )
  const [navOpen, setNavOpen] = useState(() => session?.navOpen ?? true)
  /** 收起功能区：只藏工具带，选项卡栏留着（不然收起来就没地方展开了）。跟着会话存。 */
  const [ribbonCollapsed, setRibbonCollapsed] = useState(() => session?.ribbonCollapsed ?? false)
  const [navWidth, setNavWidth] = useState(() => session?.navWidth ?? 220)
  const [editorWidth, setEditorWidth] = useState(() => session?.editorWidth ?? 420)
  /** 最后一次保存：时间 + 是自动写会话还是手动存文件，状态栏据此显示不同措辞。 */
  const [saved, setSaved] = useState<{ at: number; kind: 'auto' | 'manual' } | null>(
    session ? { at: session.savedAt, kind: 'auto' } : null,
  )
  const [autoSave, setAutoSave] = useState(() => loadAutoSave())
  /** 桌面壳直接出 PDF 的进行中标记：导出期间按钮置灰，免得连点弹出两个保存框。 */
  const [exportingPdf, setExportingPdf] = useState(false)
  /**
   * 预览里指针移动的次数。父文档看不出指针是不是移到了预览 iframe 上（事件与 :hover 都会冻结），
   * 只能靠预览 postMessage 通报；用计数而不是布尔，是因为「已经在预览里」之后再进去不会产生状态变化。
   */
  const [previewHoverTick, setPreviewHoverTick] = useState(0)
  /**
   * 预览的两块画布。正在显示的那块不动，新一版先在另一块里分页（它压在最上面、内容藏着），
   * 排完再换过来：打字时就不会先看到旧内容被清空（闪一下），换上来时也已经恢复好进度（不跳回文首）。
   */
  const frameARef = useRef<HTMLIFrameElement>(null)
  const frameBRef = useRef<HTMLIFrameElement>(null)
  const frameRefs = useMemo<Record<PreviewSlot, RefObject<HTMLIFrameElement>>>(
    () => ({ a: frameARef, b: frameBRef }),
    [],
  )
  const [activeSlot, setActiveSlot] = useState<PreviewSlot>('a')
  const activeSlotRef = useRef<PreviewSlot>('a')
  const editorRef = useRef<SourceEditorHandle | null>(null)
  /** 编辑器那块的宿主元素：判断 Ctrl+滚轮是不是落在编辑器上（预览是另一个文档，另走转发）。 */
  const sourceHostRef = useRef<HTMLDivElement | null>(null)
  /**
   * Ctrl+滚轮的累积量，编辑器和预览各一个。滚轮事件比快捷键密得多（触控板捏合一次能来几十条），
   * 攒够一档才动一次，余量留着下次接着攒。
   */
  const editorWheelRef = useRef(0)
  const previewWheelRef = useRef(0)
  /** 从文件打开 / 另存为拿到的句柄：「保存」写回它，没有就当「另存为」处理。 */
  const fileHandleRef = useRef<FileHandle | null>(null)
  /**
   * 打开 Markdown 的兜底通道：没有 File System Access API（或系统对话框用不了）时用隐藏的
   * `<input type=file>`，两者都收在这个入口里，「文件」菜单与 Ctrl+O 共用一份。
   */
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 等 `<input type=file>` 回话的那次选择；用 Promise 包一层，调用处 await 得到文件或 null。 */
  const pendingPick = useRef<((file: File | null) => void) | null>(null)
  const scrollRatioRef = useRef(0)
  /** iframe 的 onLoad 回调要拿最新缩放，但它不在 state 的渲染闭包里，用 ref 兜住。 */
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])
  const outlineTimerRef = useRef<number | null>(null)
  /** 正在把预览的滚动同步回编辑器；这期间的编辑器 scroll 事件不再回发给预览，免得两边互相推。 */
  const syncingFromPreviewRef = useRef(false)

  const applyPreviewScroll = useCallback((ratio: number) => {
    const editor = editorRef.current
    if (!editor) return
    const clamped = Math.min(Math.max(0, ratio), 1)
    syncingFromPreviewRef.current = true
    editor.setScrollRatio(clamped)
    scrollRatioRef.current = clamped
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        syncingFromPreviewRef.current = false
      }),
    )
  }, [])

  // 恢复上次的光标：把插入点放回去，并把编辑器滚到那一行（预览等分页完成后跟上）。
  useEffect(() => {
    if (!session) return
    const frame = window.requestAnimationFrame(() => {
      const editor = editorRef.current
      if (!editor) return
      const offset = Math.min(Math.max(0, session.cursorOffset), editor.getValue().length)
      editor.revealOffset(offset)
      scrollRatioRef.current = editor.getScrollRatio()
    })
    return () => window.cancelAnimationFrame(frame)
    // 只在首次挂载时恢复一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const debouncedMarkdown = useDebounced(markdown, 180)

  const validation = useMemo(() => validateTheme(theme), [theme])
  const rendering = useMemo(() => {
    try {
      return { result: validation.ok ? build(debouncedMarkdown, theme, { autoDetect }) : null, error: '' }
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [debouncedMarkdown, theme, autoDetect, validation.ok])
  const fallbackResult = useMemo(() => build(sampleMarkdown, getBuiltInTheme('tech-document') ?? BUILT_IN_THEMES[0]!), [])
  const lastResult = useRef<BuildResult | null>(null)
  useEffect(() => { if (rendering.result) lastResult.current = rendering.result }, [rendering.result])
  const result = rendering.result ?? lastResult.current ?? fallbackResult
  const previewId = useMemo(() => crypto.randomUUID(), [result.html])

  // 样式窗口与画廊里的字形样本是内联样式，用不到编译产物里的 @font-face；
  // 把同一套规则注入宿主文档，样本才会和真实预览用同一个字体（见 planFontFamily）。
  useEffect(() => {
    const faces = specimenFontFaces(result.computed)
    const existing = document.getElementById('stylemd-specimen-fonts')
    if (faces.length === 0) {
      existing?.remove()
      return
    }
    const element = existing instanceof HTMLStyleElement ? existing : document.createElement('style')
    element.id = 'stylemd-specimen-fonts'
    element.textContent = faces.join('\n')
    if (!existing) document.head.appendChild(element)
  }, [result.computed])

  // 光标 → 结构角色。跨度用防抖后的正文计算，跟预览看到的内容保持一致；
  // 光标没落在任何结构上（比如在文件头的元数据里）就按正文段落处理。
  const roleSpans = useMemo(() => collectRoleSpans(debouncedMarkdown, { autoDetect }), [debouncedMarkdown, autoDetect])
  const cursorRole = useMemo(() => roleAtOffset(roleSpans, cursorOffset), [roleSpans, cursorOffset])
  const activeRole = cursorRole ?? 'body.text'
  /**
   * 光标是不是落在表格结构里（整表 / 表头单元格 / 内容单元格）。
   * 表题不算——那是表格外面的段落，光标停在表题上不该弹出表格工具。
   */
  const inTable = cursorRole === 'table' || cursorRole === 'table.header' || cursorRole === 'table.cell'
  const inTableRef = useRef(false)
  // 光标进表格就自动切到「表格」选项卡，离开则收起并回到「开始」。只认"进/出"这一次变化：
  // 在表格里挪光标（逐行上下移动）不该把用户手动切回的其他选项卡又抢过去。
  useEffect(() => {
    const was = inTableRef.current
    if (was === inTable) return
    inTableRef.current = inTable
    setRibbonTab(inTable ? 'table' : (current) => (current === 'table' ? 'start' : current))
  }, [inTable])
  const cursorLine = useMemo(() => markdown.slice(0, cursorOffset).split('\n').length - 1, [markdown, cursorOffset])
  const outline = useMemo(() => documentOutline(roleSpans, debouncedMarkdown), [roleSpans, debouncedMarkdown])
  const [activeOutlineOffset, setActiveOutlineOffset] = useState<number | null>(null)
  const documentName = useMemo(() => documentTitle(markdown), [markdown])

  // 预览与导出共用 result.html（同一个渲染函数），预览只是额外插入了纸张外壳与 Paged.js。
  const previewHtml = useMemo(() => {
    const html = result.html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: https: http:; font-src data:; base-uri \'none\'; form-action \'none\'">')
    // 键位表一并交给预览：焦点在预览里时宿主的 window 收不到键事件，得由帧认出来再转回来。
    return injectPagedPolyfill(injectHeadStyle(html, PREVIEW_CHROME_CSS), pagedPolyfill, previewId, previewShortcuts())
  }, [result.html, previewId])

  // 两块画布各自装着哪一版：a 先显示第一版，之后每一版都排进另一块，排完再换过来。
  const [frames, setFrames] = useState<Record<PreviewSlot, PreviewFrame>>(() => ({
    a: { id: '', html: '' },
    b: { id: '', html: '' },
  }))
  /**
   * 正在分页的那块画布。它得压在显示那块上面才不被浏览器限流，可新文档还没接手之前那块的位置上
   * 还挂着更早的一版内容，先抬上去会闪一下旧版；所以等新文档 load 完（那时它自己已经把内容藏好了）
   * 再抬。
   */
  const [incomingSlot, setIncomingSlot] = useState<PreviewSlot | null>(null)
  const framesRef = useRef(frames)
  useEffect(() => {
    framesRef.current = frames
  }, [frames])
  useEffect(() => {
    setFrames((previous) => {
      if (previous.a.id === previewId || previous.b.id === previewId) return previous
      const next: PreviewFrame = { id: previewId, html: previewHtml }
      // 一块都还没装过时（首屏）先填正在显示那块；之后才排进另一块。
      const active = activeSlotRef.current
      const target: PreviewSlot = previous[active].id ? (active === 'a' ? 'b' : 'a') : active
      return target === 'a' ? { ...previous, a: next } : { ...previous, b: next }
    })
    setIncomingSlot(null)
  }, [previewId, previewHtml])

  /** 把消息同时发给两块画布（各自带自己的 id）：待换的那块也要跟上缩放与进度，换上来才是一致的。 */
  const sendToFrames = useCallback((type: string, payload: Record<string, unknown>) => {
    for (const slot of ['a', 'b'] as const) {
      const spec = framesRef.current[slot]
      const target = frameRefs[slot].current?.contentWindow
      if (!spec.id || !target) continue
      target.postMessage({ type, id: spec.id, ...payload }, '*')
    }
  }, [frameRefs])

  /** 这条消息来自哪块画布？两块都不是就返回 null（比如以后嵌了别的页面进来）。 */
  const frameSlotOf = useCallback(
    (source: MessageEventSource | null): PreviewSlot | null =>
      source === frameARef.current?.contentWindow
        ? 'a'
        : source === frameBRef.current?.contentWindow
          ? 'b'
          : null,
    [],
  )

  /**
   * 画布一挂上就把缩放与「当前进度」告诉它。这时分页多半还没跑完，预览脚本会先把它们记下，
   * 等页面排好再应用——新预览露面的那一刻就已经在原来的位置，不会有跳回文首的动作。
   */
  const handleFrameLoad = useCallback((slot: PreviewSlot) => {
    const spec = framesRef.current[slot]
    const target = frameRefs[slot].current?.contentWindow
    if (!spec.id || !target) return
    // 新文档已经加载完（内容在分页期间由文档自己藏着），可以把它抬成"正在分页"那块了。
    // 只抬当前这一版：备用画布在预览重新挂载（比如切回双栏）时也会重新加载，抬错了它会把更早一版
    // 的内容重新露到最上面。
    if (spec.id === previewId && slot !== activeSlotRef.current) setIncomingSlot(slot)
    target.postMessage({ type: 'stylemd:zoom', id: spec.id, zoom: zoomRef.current }, '*')
    target.postMessage({ type: 'stylemd:scroll', id: spec.id, ratio: scrollRatioRef.current }, '*')
  }, [frameRefs, previewId])

  useEffect(() => {
    setPagedStatus('pending')
    setPagedError('')
    setPageCount(null)
    let timer: number | null = null
    let settled = false
    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
    }
    /**
     * 排版全靠 iframe 里的 requestAnimationFrame 推进，宿主本身不可见时（终端把窗口完全遮住、
     * 标签切到后台、桌面壳还在 show:false 阶段）整条链会停下来。这段「停」不能算进超时里：
     * 否则用户离开两分钟再回来，门一开就被告知「排版超时」。隐藏期间干脆不挂表，回到可见时从零重计。
     */
    const armTimer = () => {
      if (settled) return
      clearTimer()
      timer = window.setTimeout(() => setPagedStatus('timeout'), 60000)
    }
    const onVisibility = () => {
      if (document.hidden) clearTimer()
      else armTimer()
    }
    if (!document.hidden) armTimer()
    document.addEventListener('visibilitychange', onVisibility)
    const receive = (event: MessageEvent) => {
      const data = event.data
      if (data?.type !== 'stylemd:pagination' || data.id !== previewId) return
      const slot = frameSlotOf(event.source)
      if (!slot) return
      if (data.status !== 'paged' && data.status !== 'error') return
      settled = true
      clearTimer()
      setPageCount(Number.isInteger(data.pages) && data.pages > 0 ? data.pages : 0)
      setPagedStatus(data.status)
      // 失败原因随上报一起带过来（iframe 的 catch 里抓到的原文），记进 console 并挂到状态栏的 title 上。
      if (data.status === 'error' && typeof data.message === 'string' && data.message) {
        setPagedError(data.message)
        console.error('[stylemd] 渲染失败', data.message)
      }
      // 排好的是另一块：只换身份（层级/可见性），两块 iframe 都不重新加载，所以看不到闪白。
      if (slot !== activeSlotRef.current) {
        activeSlotRef.current = slot
        setActiveSlot(slot)
        setIncomingSlot(null)
      }
      setReadyId(previewId)
    }
    const receiveScroll = (event: MessageEvent) => {
      const data = event.data
      // 只认正在显示的那块：待换的那块是被程序滚过去的，不能反过来推编辑器。
      if (data?.type !== 'stylemd:scroll-report' || frameSlotOf(event.source) !== activeSlotRef.current) return
      if (typeof data.ratio === 'number') applyPreviewScroll(data.ratio)
    }
    const receivePointer = (event: MessageEvent) => {
      const data = event.data
      if (data?.type !== 'stylemd:pointer' || !frameSlotOf(event.source)) return
      if (data.over) setPreviewHoverTick((tick) => tick + 1)
    }
    window.addEventListener('message', receive)
    window.addEventListener('message', receiveScroll)
    window.addEventListener('message', receivePointer)
    return () => {
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('message', receive)
      window.removeEventListener('message', receiveScroll)
      window.removeEventListener('message', receivePointer)
    }
  }, [applyPreviewScroll, frameSlotOf, previewId])

  useEffect(() => {
    sendToFrames('stylemd:zoom', { zoom })
  }, [zoom, readyId, previewId, sendToFrames])

  /**
   * 换上新画布后再补发一次进度兜底。正常路径上待换那块分页结束前就收到了进度、换上来时已经停好；
   * 万一那条消息没赶上（预览脚本还没开始听），这里补一次，同样的值再滚一次也不会跳。
   */
  useEffect(() => {
    if (!readyId || readyId !== previewId) return
    frameRefs[activeSlotRef.current].current?.contentWindow?.postMessage(
      { type: 'stylemd:scroll', id: readyId, ratio: scrollRatioRef.current },
      '*',
    )
  }, [readyId, previewId, frameRefs])

  const handleRoleChange = useCallback((role: string, patch: Partial<RoleStyle>) => {
    changeTheme((current) => upsertRoleStyle(current, role, patch))
  }, [changeTheme])

  const handleClearGroup = useCallback((role: string, group: keyof RoleStyle) => {
    changeTheme((current) => clearRoleGroup(current, role, group))
  }, [changeTheme])

  const handleResetRole = useCallback((role: string) => {
    changeTheme((current) => resetRoleStyle(current, role))
  }, [changeTheme])

  const handlePageChange = useCallback((patch: Partial<PageSetup>) => {
    changeTheme((current) => updatePage(current, patch))
  }, [changeTheme])

  const handleEditFurniture = useCallback((area: 'header' | 'footer') => {
    furnitureSnapshot.current = themeRef.current.document.page
    setFurnitureArea(area)
  }, [])

  const handleDefaultsChange = useCallback((patch: Partial<DocumentDefaults>) => {
    changeTheme((current) => updateDefaults(current, patch))
  }, [changeTheme])

  /** 表格整体版式（document.table）：宽度模式、最小尺寸、分布行列、跨页重复标题行、整体对齐。 */
  const handleTableChange = useCallback((patch: Partial<TableSpec>) => {
    changeTheme((current) => updateTable(current, patch))
  }, [changeTheme])

  const handleExportTheme = useCallback(() => {
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${theme.id}.stylemd.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [theme])

  const openDialog = useCallback((role: string) => setDialogRole(role), [])

  /**
   * 滚到哪个标题区间，左侧大纲就高亮哪一条。
   * 用镜像量出每个标题「顶到首行」所需的 scrollTop，取最后一个不超过当前位置的，
   * 就是当前所处的章节——比按比例估算准，软换行也不会带偏。
   */
  const updateActiveOutline = useCallback(() => {
    const editor = editorRef.current
    if (!editor || outline.length === 0) {
      setActiveOutlineOffset(null)
      return
    }
    const tops = editor.offsetTopsFor(outline.map((item) => item.offset))
    const current = editor.scrollTop()
    let index = 0
    for (let position = 0; position < tops.length; position += 1) {
      if ((tops[position] ?? 0) <= current + 6) index = position
      else break
    }
    setActiveOutlineOffset(outline[index]?.offset ?? null)
  }, [outline])

  /** 滚动事件很密，而量一次镜像要重排整篇文本，所以按 120ms 节流。 */
  const scheduleActiveOutline = useCallback(() => {
    if (outlineTimerRef.current !== null) return
    outlineTimerRef.current = window.setTimeout(() => {
      outlineTimerRef.current = null
      updateActiveOutline()
    }, 120)
  }, [updateActiveOutline])

  /** 编辑器滚动 → 预览按进度跟着走。 */
  const handleSourceScroll = useCallback((ratio: number) => {
    scheduleActiveOutline()
    if (syncingFromPreviewRef.current) return
    scrollRatioRef.current = ratio
    // 待换那块也要收到：它可能正排着下一版，记下进度才能在换上来时停在同一处。
    sendToFrames('stylemd:scroll', { ratio })
  }, [scheduleActiveOutline, sendToFrames])

  // 正文、编辑器宽度或展示模式一变，标题的位置就变了，重新算一遍高亮。
  useEffect(() => {
    const frame = window.requestAnimationFrame(updateActiveOutline)
    return () => window.cancelAnimationFrame(frame)
  }, [updateActiveOutline, editorWidth, viewMode, navOpen])

  // 会话存档：改动停下 400ms 再写，避免每敲一个字都写一次 localStorage。
  useEffect(() => {
    if (!autoSave) return
    const timer = window.setTimeout(() => {
      const savedAtValue = Date.now()
      saveSession({
        markdown,
        cursorOffset,
        fileName: fileName ?? undefined,
        theme,
        viewMode,
        navOpen,
        ribbonCollapsed,
        navWidth,
        editorWidth,
        zoom,
        editorFontPx,
        savedAt: savedAtValue,
      })
      setSaved({ at: savedAtValue, kind: 'auto' })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [
    autoSave,
    markdown,
    cursorOffset,
    fileName,
    theme,
    viewMode,
    navOpen,
    ribbonCollapsed,
    navWidth,
    editorWidth,
    zoom,
    editorFontPx,
  ])

  const handleAutoSaveChange = useCallback((enabled: boolean) => {
    setAutoSave(enabled)
    saveAutoSave(enabled)
  }, [])

  const jumpToOutline = useCallback((item: OutlineItem) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    // 把目标标题顶到首行；已经到文末时编辑器会自己夹住，不会多跳。
    editor.revealOffset(item.offset)
    setCursorOffset(item.offset)
  }, [])

  const handleNewDocument = useCallback(() => setMarkdown(blankDocument()), [])
  const handleLoadSample = useCallback(() => setMarkdown(sampleMarkdown), [])
  const pickWithInput = useCallback(
    () =>
      new Promise<File | null>((resolve) => {
        const input = fileInputRef.current
        if (!input) {
          resolve(null)
          return
        }
        pendingPick.current = resolve
        input.click()
      }),
    [],
  )
  const handleOpenFile = useCallback((file: OpenedFile) => {
    fileHandleRef.current = file.handle
    setFileName(file.name)
    setMarkdown(file.text)
  }, [])
  /** 打开 Markdown：优先系统文件对话框（能拿到句柄，「保存」就能写回原文件），否则退回文件选择框。 */
  const handleOpenDocument = useCallback(async () => {
    try {
      const picked = await openMarkdownFile(pickWithInput)
      if (picked) handleOpenFile(picked)
    } catch (error) {
      window.alert(`无法读取 Markdown：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [handleOpenFile, pickWithInput])
  /** 标题栏里改的是**文件名**；文档标题（前置元数据）不动，仍在灰色小字与页眉域里。 */
  const handleRenameFile = useCallback((stem: string) => {
    const name = stem.trim()
    if (!name) return
    setFileName(markdownFileName(name))
  }, [])
  const suggestedFileName = fileName ?? markdownFileName(documentName)
  /** 标题栏上那个大字（不含扩展名），也是「另存为…」的建议文件名。 */
  const ribbonFileName = fileName ? fileStem(fileName) : '未命名'
  const handleSaveDocumentAs = useCallback(
    async (name: string) => {
      try {
        const suggested = markdownFileName(name)
        const result = await saveMarkdownAs(markdown, suggested)
        if (result.outcome === 'cancelled') return
        if (result.handle) {
          fileHandleRef.current = result.handle
          setFileName(result.handle.name)
        } else {
          setFileName(suggested)
        }
        setSaved({ at: Date.now(), kind: 'manual' })
      } catch (error) {
        window.alert(`保存失败：${error instanceof Error ? error.message : String(error)}`)
      }
    },
    [markdown],
  )
  /** 保存 = 写回打开的文件；还没有文件句柄（新建 / 载入示例）就按另存为处理。 */
  const handleSaveDocument = useCallback(async () => {
    const handle = fileHandleRef.current
    if (!handle) {
      await handleSaveDocumentAs(fileStem(suggestedFileName))
      return
    }
    try {
      await writeToHandle(handle, markdown)
      setSaved({ at: Date.now(), kind: 'manual' })
    } catch (error) {
      window.alert(`保存失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [handleSaveDocumentAs, markdown, suggestedFileName])

  /**
   * 导出 PDF。
   * 桌面壳里有宿主通道：把与预览同一份 HTML 交给主进程，隐藏窗口里跑完分页再 printToPDF，
   * 保存位置由系统保存框决定（见 apps/desktop/src/pdf.ts）。
   * 浏览器里没有这条通道，仍旧让预览调 `window.print()` 走打印对话框。
   */
  const handlePrint = useCallback(() => {
    const bridge = desktopBridge()
    if (bridge?.exportPdf) {
      if (exportingPdf) return
      setExportingPdf(true)
      void bridge
        .exportPdf({ html: previewHtml, suggestedName: fileStem(suggestedFileName) })
        .then((result) => {
          if (result.status === 'error') window.alert(`导出 PDF 失败：${result.message}`)
        })
        .catch((error: unknown) => {
          window.alert(`导出 PDF 失败：${error instanceof Error ? error.message : String(error)}`)
        })
        .finally(() => setExportingPdf(false))
      return
    }
    const spec = framesRef.current[activeSlotRef.current]
    frameRefs[activeSlotRef.current].current?.contentWindow?.postMessage(
      { type: 'stylemd:print', id: spec.id },
      '*',
    )
  }, [exportingPdf, frameRefs, previewHtml, suggestedFileName])

  /** 预览与导出都就绪了才能打印 / 导出：按钮的禁用条件与 Ctrl+P 共用同一份判断。 */
  const canPrint =
    validation.ok &&
    !rendering.error &&
    !exportingPdf &&
    markdown === debouncedMarkdown &&
    readyId === previewId &&
    pagedStatus === 'paged'

  /** 状态栏那两个加减按钮的步长；快捷键走同一条，缩放范围与它们一致。 */
  const stepZoom = useCallback((steps: number) => {
    setZoom((current) => clampZoom(current + steps * ZOOM_STEP))
  }, [])

  /** Ctrl+滚轮落在编辑器上：改编辑器字号（步长 1px）。 */
  const applyEditorFontWheel = useCallback((deltaY: number, deltaMode: number) => {
    const steps = takeWheelZoomSteps(editorWheelRef, deltaY, deltaMode)
    if (steps === 0) return
    setEditorFontPx((current) => clampEditorFontPx(current + steps * EDITOR_FONT_STEP_PX))
  }, [])

  /** Ctrl+滚轮落在预览上：与 Ctrl+= / Ctrl+- 同一套步长（预览把它那边的 wheel 转过来）。 */
  const applyPreviewZoomWheel = useCallback(
    (deltaY: number, deltaMode: number) => {
      stepZoom(takeWheelZoomSteps(previewWheelRef, deltaY, deltaMode))
    },
    [stepZoom],
  )

  /**
   * 宿主文档里的 Ctrl+滚轮：指针在编辑器上就动编辑器字号，别处什么都不做。
   *
   * 别处仍然 `preventDefault`：浏览器会把 Ctrl+滚轮当整页缩放，而 Ctrl+= / Ctrl+- / Ctrl+0 已经被
   * 接走做预览缩放了，留着这个口子只会让「Ctrl 系列只动内容」的预期漏气。
   * 预览那一片收不到这个事件（指针在 iframe 里，事件在那个文档里派发），由预览自己转发
   * `stylemd:zoom-wheel`。必须非被动监听——被动监听里 `preventDefault` 是空的。
   */
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const target = event.target
      if (target instanceof Node && sourceHostRef.current?.contains(target)) {
        applyEditorFontWheel(event.deltaY, event.deltaMode)
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [applyEditorFontWheel])

  // 编辑器字号写成一个 CSS 变量（`.cm-scroller` 的主题引用它），所以改字号不用重建编辑器；
  // 改完请 CodeMirror 重新量一次——行高还按旧值算的话，滚动同步与大纲跳转都会偏。
  useEffect(() => {
    document.documentElement.style.setProperty('--ed-font-size', `${editorFontPx}px`)
    editorRef.current?.remeasure()
  }, [editorFontPx])

  const runShortcut = useShortcuts({
    save: () => void handleSaveDocument(),
    saveAs: () => void handleSaveDocumentAs(ribbonFileName),
    open: () => void handleOpenDocument(),
    newDocument: handleNewDocument,
    // 还没排完页不能导出（按钮那时也是禁用的），按了就当没按，别把没排完的 HTML 交出去。
    print: () => {
      if (canPrint) handlePrint()
    },
    zoomIn: () => stepZoom(1),
    zoomOut: () => stepZoom(-1),
    zoomReset: () => setZoom(1),
  })

  /**
   * 预览 iframe 里按的键。点过预览之后焦点落在那个文档里，键事件不会冒泡到宿主，
   * 只能由预览按注入的键位表认出来、postMessage 转过来（见 `renderer-paged` 的 keydown 转发）。
   * 走 `runShortcut` 就意味着和宿主键盘走的是同一份处理函数。
   */
  useEffect(() => {
    const receiveShortcut = (event: MessageEvent) => {
      const data = event.data
      if (data?.type !== 'stylemd:shortcut' || !frameSlotOf(event.source)) return
      if (typeof data.shortcut === 'string') runShortcut(data.shortcut as ShortcutId)
    }
    window.addEventListener('message', receiveShortcut)
    return () => window.removeEventListener('message', receiveShortcut)
  }, [frameSlotOf, runShortcut])

  /** 预览里的 Ctrl+滚轮：帧那边拦下默认行为后把滚轮量转过来，按与 Ctrl+= / Ctrl+- 相同的步长走。 */
  useEffect(() => {
    const receiveZoomWheel = (event: MessageEvent) => {
      const data = event.data
      if (data?.type !== 'stylemd:zoom-wheel' || !frameSlotOf(event.source)) return
      if (typeof data.delta !== 'number') return
      applyPreviewZoomWheel(data.delta, typeof data.mode === 'number' ? data.mode : 0)
    }
    window.addEventListener('message', receiveZoomWheel)
    return () => window.removeEventListener('message', receiveZoomWheel)
  }, [applyPreviewZoomWheel, frameSlotOf])

  const roleCount = Object.keys(result.stats.counts).length

  return (
    <div className="app">
      <Ribbon
        theme={theme}
        computed={result.computed}
        activeRole={activeRole}
        cursorRole={cursorRole}
        documentTitle={documentName}
        tab={ribbonTab}
        onTabChange={(tab) => {
          setRibbonTab(tab)
          // 收起状态点选项卡要把工具带放出来（仿 Word，点当前那一栏也放）：收起只是不用的时候
          // 让位给正文，既然在挑栏目了，就是要用这一栏的控件。光标进表格那类程序化切换不走这里，
          // 那种情况下工具带不该自己弹出来。
          setRibbonCollapsed(false)
        }}
        autoDetect={autoDetect}
        status={{ roles: roleCount, warnings: result.warnings.length + validation.warnings.length, errors: validation.errors.length }}
        canPrint={canPrint}
        canUndo={history.length > 0}
        onUndo={() => {
          const previous = history.at(-1)
          if (!previous) return
          setHistory(history.slice(0, -1))
          applyTheme(previous)
        }}
        onPrint={handlePrint}
        onPresetChange={(id) => {
          const preset = getBuiltInTheme(id)
          if (preset) changeTheme(preset)
        }}
        onImport={changeTheme}
        onExport={handleExportTheme}
        onAutoDetectChange={setAutoDetect}
        onRoleChange={handleRoleChange}
        onClearGroup={handleClearGroup}
        onResetRole={handleResetRole}
        onOpenDialog={openDialog}
        onPageChange={handlePageChange}
        onEditFurniture={handleEditFurniture}
        onDefaultsChange={handleDefaultsChange}
        onOpenDocument={() => void handleOpenDocument()}
        onLoadSample={handleLoadSample}
        onNewDocument={handleNewDocument}
        onSaveDocument={handleSaveDocument}
        onSaveDocumentAs={handleSaveDocumentAs}
        fileName={ribbonFileName}
        onRenameFile={handleRenameFile}
        autoSave={autoSave}
        onAutoSaveChange={handleAutoSaveChange}
        previewHoverTick={previewHoverTick}
        tableContext={inTable}
        onTableChange={handleTableChange}
        onOpenBorderDialog={() => setBorderDialogOpen(true)}
        collapsed={ribbonCollapsed}
        onToggleCollapsed={() => setRibbonCollapsed((collapsed) => !collapsed)}
        schemes={ribbonSchemes}
        activeSchemeId={currentScheme.id}
        hiddenSchemeCount={Math.max(0, schemeLibrary.schemes.length - ribbonSchemes.length)}
        onSelectScheme={(id) => setSchemeLibrary((library) => markSchemeUsed(library, id))}
        onOpenSchemeDialog={() => setSchemeDialogOpen(true)}
      />

      {validation.errors.length > 0 ? (
        <div className="banner error">
          <strong>样式包存在问题：</strong>
          {validation.errors.join('；')}
        </div>
      ) : null}
      {rendering.error ? <div role="alert" className="banner error">渲染失败：{rendering.error}</div> : null}

      <main className="workspace">
        {navOpen ? (
          <>
            <div className="nav-slot" style={{ width: navWidth }}>
              <OutlinePanel items={outline} activeOffset={activeOutlineOffset} onJump={jumpToOutline} />
            </div>
            <span
              className="splitter"
              role="separator"
              aria-label="拖动调整导航面板宽度"
              onPointerDown={(event) => startWidthDrag(event, navWidth, MIN_NAV_WIDTH, MAX_NAV_WIDTH, setNavWidth)}
            />
          </>
        ) : null}

        {viewMode !== 'preview' ? (
          <SourcePane
            value={markdown}
            editorRef={editorRef}
            hostRef={sourceHostRef}
            onChange={setMarkdown}
            onCursorChange={setCursorOffset}
            onScrollRatio={handleSourceScroll}
            roleSpans={roleSpans}
            cursorOffset={cursorOffset}
            style={viewMode === 'both' ? { flex: `0 0 ${editorWidth}px` } : undefined}
          />
        ) : null}

        {viewMode === 'both' ? (
          <span
            className="splitter"
            role="separator"
            aria-label="拖动调整编辑器宽度"
            onPointerDown={(event) =>
              startWidthDrag(
                event,
                editorWidth,
                MIN_EDITOR_WIDTH,
                Math.max(MIN_EDITOR_WIDTH + 80, window.innerWidth - 360),
                setEditorWidth,
              )
            }
          />
        ) : null}

        {viewMode !== 'edit' ? (
          <PreviewPane
            frames={frames}
            activeSlot={activeSlot}
            incomingSlot={incomingSlot}
            frameRefs={frameRefs}
            onFrameLoad={handleFrameLoad}
          />
        ) : null}
      </main>

      <StatusBar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        navOpen={navOpen}
        onNavToggle={() => setNavOpen((open) => !open)}
        cursorRole={cursorRole}
        charCount={markdown.length}
        pageCount={pageCount}
        pagedStatus={
          readyId === previewId
            ? pagedStatus
            : pagedStatus === 'error' || pagedStatus === 'timeout'
              ? pagedStatus
              : 'pending'
        }
        pagedError={pagedError}
        zoom={zoom}
        onZoomChange={setZoom}
        saved={saved}
      />

      {/* 打开 Markdown 的兜底入口（系统文件对话框用不了时走它）：菜单项与 Ctrl+O 共用这一份。 */}
      <input
        ref={fileInputRef}
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

      {/* 页眉页脚弹窗排在样式窗口前面：从它点「样式」时，样式窗口要盖在它上面。 */}
      {furnitureArea ? (
        <FurnitureDialog
          area={furnitureArea}
          page={theme.document.page}
          onChange={handlePageChange}
          onOpenStyle={() => setDialogRole(furnitureArea === 'header' ? 'page.header' : 'page.footer')}
          onCancel={() => {
            const snapshot = furnitureSnapshot.current
            if (snapshot) handlePageChange(snapshot)
            setFurnitureArea(null)
          }}
          onClose={() => setFurnitureArea(null)}
        />
      ) : null}

      {dialogRole ? (
        <StyleDialog
          theme={theme}
          computed={result.computed}
          role={dialogRole}
          documentTitle={documentName}
          onRoleChange={handleRoleChange}
          onClearGroup={handleClearGroup}
          onResetRole={handleResetRole}
          onClose={() => setDialogRole(null)}
        />
      ) : null}

      {borderDialogOpen ? (
        <TableBorderDialog
          theme={theme}
          computed={result.computed}
          onRoleChange={handleRoleChange}
          onClose={() => setBorderDialogOpen(false)}
        />
      ) : null}

      {schemeDialogOpen ? (
        <EditorSchemeDialog
          library={schemeLibrary}
          onChange={setSchemeLibrary}
          onClose={() => setSchemeDialogOpen(false)}
        />
      ) : null}
    </div>
  )
}
