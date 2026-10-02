/**
 * 会话存档：把当前文档、光标位置、样式包和界面布局写到 localStorage。
 * 刷新或下次打开时原样恢复，不用重新载入文件、重新找位置。
 *
 * 存档随时可能是旧的或损坏的（用户手改、版本升级），这里只管存取，
 * 校验交给调用方——坏档一律当作没有存档处理。
 */
const STORAGE_KEY = 'stylemd:session:v1'

export interface SessionSnapshot {
  markdown: string
  cursorOffset: number
  /** 样式包原样存下，读取时走 migrate + validate 再决定用不用。 */
  theme?: unknown
  viewMode?: string
  navOpen?: boolean
  navWidth?: number
  editorWidth?: number
  zoom?: number
  savedAt: number
}

export function loadSession(): SessionSnapshot | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>
    if (typeof parsed?.markdown !== 'string') return null
    return {
      markdown: parsed.markdown,
      cursorOffset: typeof parsed.cursorOffset === 'number' ? parsed.cursorOffset : 0,
      theme: parsed.theme,
      viewMode: parsed.viewMode,
      navOpen: parsed.navOpen,
      navWidth: parsed.navWidth,
      editorWidth: parsed.editorWidth,
      zoom: parsed.zoom,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    }
  } catch {
    // 无痕模式、存储被禁用、存档损坏：一律当作没有存档。
    return null
  }
}

export function saveSession(snapshot: SessionSnapshot): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // 写不进去也不该影响编辑：安静跳过。
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 同上。
  }
}

/** 底部栏用的时间显示：17:03。 */
export function formatSavedAt(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
