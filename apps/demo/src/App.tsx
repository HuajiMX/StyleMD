import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
} from '@stylemd/theme-schema'
import pagedPolyfill from '@pagedjs-polyfill?raw'
import sampleMarkdown from '../../../examples/sample-thesis.md?raw'
import { OutlinePanel } from './components/OutlinePanel'
import { PreviewPane } from './components/PreviewPane'
import { EditorSchemeDialog } from './components/EditorSchemeDialog'
import { Ribbon, type RibbonTab } from './components/Ribbon'
import { SourcePane } from './components/SourcePane'
import { StatusBar, type ViewMode } from './components/StatusBar'
import { StyleDialog } from './components/StyleDialog'
import { blankDocument, documentTitle, downloadText, markdownFileName, withDocumentTitle } from './lib/document'
import { startWidthDrag } from './lib/dragResize'
import { documentOutline, type OutlineItem } from './lib/outline'
import { formatSavedAt, loadSession, saveSession } from './lib/session'
import type { SourceEditorHandle } from './lib/editor/types'
import { activeScheme, applyScheme, loadSchemeLibrary, saveSchemeLibrary } from './lib/editor/scheme'
import { SCHEME_RIBBON_LIMIT, markSchemeUsed, orderSchemesByRecent, type EditorSchemeLibrary } from '@stylemd/editor-theme'
import { clearRoleGroup, resetRoleStyle, updateDefaults, updatePage, upsertRoleStyle } from './lib/themeOps'
import { useDebounced } from './lib/useDebounced'

const MIN_NAV_WIDTH = 160
const MAX_NAV_WIDTH = 420
const MIN_EDITOR_WIDTH = 240

export function App() {
  // 上一次的存档：文档、光标、样式包、界面布局。坏档一律当没有。
  const [session] = useState(() => loadSession())
  const [markdown, setMarkdown] = useState(() => session?.markdown ?? sampleMarkdown)
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
  const [schemeDialogOpen, setSchemeDialogOpen] = useState(false)
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
  const [autoDetect, setAutoDetect] = useState(true)
  const [pagedStatus, setPagedStatus] = useState<'pending' | 'paged' | 'error'>('pending')
  const [readyId, setReadyId] = useState('')
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    session?.viewMode === 'edit' || session?.viewMode === 'preview' || session?.viewMode === 'both'
      ? session.viewMode
      : 'both',
  )
  const [navOpen, setNavOpen] = useState(() => session?.navOpen ?? true)
  const [navWidth, setNavWidth] = useState(() => session?.navWidth ?? 220)
  const [editorWidth, setEditorWidth] = useState(() => session?.editorWidth ?? 420)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const editorRef = useRef<SourceEditorHandle | null>(null)
  const scrollRatioRef = useRef(0)
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

  // 光标 → 结构角色。跨度用防抖后的正文计算，跟预览看到的内容保持一致；
  // 光标没落在任何结构上（比如在文件头的元数据里）就按正文段落处理。
  const roleSpans = useMemo(() => collectRoleSpans(debouncedMarkdown, { autoDetect }), [debouncedMarkdown, autoDetect])
  const cursorRole = useMemo(() => roleAtOffset(roleSpans, cursorOffset), [roleSpans, cursorOffset])
  const activeRole = cursorRole ?? 'body.text'
  const cursorLine = useMemo(() => markdown.slice(0, cursorOffset).split('\n').length - 1, [markdown, cursorOffset])
  const outline = useMemo(() => documentOutline(roleSpans, debouncedMarkdown), [roleSpans, debouncedMarkdown])
  const [activeOutlineOffset, setActiveOutlineOffset] = useState<number | null>(null)
  const documentName = useMemo(() => documentTitle(markdown), [markdown])

  // 预览与导出共用 result.html（同一个渲染函数），预览只是额外插入了纸张外壳与 Paged.js。
  const previewHtml = useMemo(() => {
    const html = result.html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: https: http:; font-src data:; base-uri \'none\'; form-action \'none\'">')
    return injectPagedPolyfill(injectHeadStyle(html, PREVIEW_CHROME_CSS), pagedPolyfill, previewId)
  }, [result.html, previewId])

  useEffect(() => {
    setPagedStatus('pending')
    setPageCount(null)
    const timer = window.setTimeout(() => setPagedStatus('error'), 60000)
    const receive = (event: MessageEvent) => {
      const data = event.data
      if (event.source !== iframeRef.current?.contentWindow || data?.type !== 'stylemd:pagination' || data.id !== previewId) return
      if (data.status !== 'paged' && data.status !== 'error') return
      window.clearTimeout(timer)
      setPageCount(Number.isInteger(data.pages) && data.pages > 0 ? data.pages : 0)
      setPagedStatus(data.status)
      setReadyId(previewId)
    }
    const receiveScroll = (event: MessageEvent) => {
      const data = event.data
      if (event.source !== iframeRef.current?.contentWindow || data?.type !== 'stylemd:scroll-report' || data.id !== previewId) return
      if (typeof data.ratio === 'number') applyPreviewScroll(data.ratio)
    }
    window.addEventListener('message', receive)
    window.addEventListener('message', receiveScroll)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('message', receive)
      window.removeEventListener('message', receiveScroll)
    }
  }, [applyPreviewScroll, previewId])

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'stylemd:zoom', id: previewId, zoom }, '*')
  }, [zoom, readyId, previewId])

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

  const handleDefaultsChange = useCallback((patch: Partial<DocumentDefaults>) => {
    changeTheme((current) => updateDefaults(current, patch))
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

  const handlePrint = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'stylemd:print', id: previewId }, '*')
  }, [previewId])

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
    iframeRef.current?.contentWindow?.postMessage({ type: 'stylemd:scroll', id: previewId, ratio }, '*')
  }, [previewId, scheduleActiveOutline])

  // 正文、编辑器宽度或展示模式一变，标题的位置就变了，重新算一遍高亮。
  useEffect(() => {
    const frame = window.requestAnimationFrame(updateActiveOutline)
    return () => window.cancelAnimationFrame(frame)
  }, [updateActiveOutline, editorWidth, viewMode, navOpen])

  // 分页完成后把当前滚动进度补发给预览：恢复会话时预览刚建好，早先那条消息没人接。
  useEffect(() => {
    if (!readyId || readyId !== previewId) return
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'stylemd:scroll', id: previewId, ratio: scrollRatioRef.current },
      '*',
    )
  }, [readyId, previewId])

  // 会话存档：改动停下 400ms 再写，避免每敲一个字都写一次 localStorage。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedAtValue = Date.now()
      saveSession({
        markdown,
        cursorOffset,
        theme,
        viewMode,
        navOpen,
        navWidth,
        editorWidth,
        zoom,
        savedAt: savedAtValue,
      })
      setSavedAt(savedAtValue)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [markdown, cursorOffset, theme, viewMode, navOpen, navWidth, editorWidth, zoom])

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
  const handleSaveDocument = useCallback(() => downloadText(markdownFileName(documentName), markdown), [documentName, markdown])
  const handleSaveDocumentAs = useCallback(
    (name: string) => downloadText(markdownFileName(name), markdown),
    [markdown],
  )
  const handleRenameDocument = useCallback(
    (name: string) => setMarkdown((current) => withDocumentTitle(current, name)),
    [],
  )

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
        onTabChange={setRibbonTab}
        autoDetect={autoDetect}
        status={{ roles: roleCount, warnings: result.warnings.length + validation.warnings.length, errors: validation.errors.length }}
        canPrint={validation.ok && !rendering.error && markdown === debouncedMarkdown && readyId === previewId && pagedStatus === 'paged'}
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
        onDefaultsChange={handleDefaultsChange}
        onLoadMarkdown={setMarkdown}
        onLoadSample={handleLoadSample}
        onNewDocument={handleNewDocument}
        onSaveDocument={handleSaveDocument}
        onSaveDocumentAs={handleSaveDocumentAs}
        onRenameDocument={handleRenameDocument}
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

        {viewMode !== 'edit' ? <PreviewPane html={previewHtml} iframeRef={iframeRef} /> : null}
      </main>

      <StatusBar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        navOpen={navOpen}
        onNavToggle={() => setNavOpen((open) => !open)}
        cursorRole={cursorRole}
        charCount={markdown.length}
        pageCount={pageCount}
        pagedStatus={readyId === previewId ? pagedStatus : pagedStatus === 'error' ? 'error' : 'pending'}
        zoom={zoom}
        onZoomChange={setZoom}
        savedAt={savedAt}
      />

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
