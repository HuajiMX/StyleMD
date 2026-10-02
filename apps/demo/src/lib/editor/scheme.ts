import {
  BUILT_IN_SCHEMES,
  DEFAULT_SCHEME_ID,
  contrastRatio,
  migrateSchemeLibrary,
  relativeLuminance,
  type EditorScheme,
  type EditorSchemeLibrary,
  type EditorSchemeTokens,
  type EditorTokenName,
} from '@stylemd/editor-theme'

/**
 * 配色方案库的存取与套用。
 *
 * 存档放在**独立**的 localStorage 键里，而不是和文档会话混在一起：
 * 换文档、清会话都不该把用户调好的配色弄丢。
 */
const STORAGE_KEY = 'stylemd:editor-schemes:v1'

/** 色槽 → CSS 自定义属性名。这层映射属于宿主界面，不属于数据包。 */
export const TOKEN_VARS: Record<EditorTokenName, string> = {
  background: '--ed-bg',
  foreground: '--ed-fg',
  heading: '--syn-heading',
  emphasis: '--syn-em',
  code: '--syn-code',
  codeBg: '--syn-code-bg',
  link: '--syn-link',
  listMarker: '--syn-list',
  marker: '--syn-mark',
  muted: '--syn-meta',
  separator: '--syn-sep',
  activeLine: '--ed-active-line',
  activeBlockBar: '--ed-active-bar',
}

export function defaultLibrary(): EditorSchemeLibrary {
  const schemes = BUILT_IN_SCHEMES.map((scheme) => ({ ...scheme, tokens: { ...scheme.tokens } }))
  return {
    schemaVersion: 1,
    activeId: DEFAULT_SCHEME_ID,
    schemes,
    recentIds: schemes.map((scheme) => scheme.id),
  }
}

/** 读存档：坏档一律当没有，绝不让配色问题把工作台搞崩。 */
export function loadSchemeLibrary(): EditorSchemeLibrary {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultLibrary()
    return migrateSchemeLibrary(JSON.parse(raw) as unknown).library
  } catch {
    return defaultLibrary()
  }
}

export function saveSchemeLibrary(library: EditorSchemeLibrary): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library))
  } catch {
    // 无痕模式、存储被禁用：静默跳过，不影响编辑。
  }
}

export function activeScheme(library: EditorSchemeLibrary): EditorScheme {
  const found = library.schemes.find((scheme) => scheme.id === library.activeId)
  if (found) return found
  const fallback = library.schemes.find((scheme) => scheme.id === DEFAULT_SCHEME_ID)
  if (!fallback) throw new Error('配色方案库缺少默认方案')
  return fallback
}

/**
 * 把配色写进 CSS 自定义属性。
 *
 * 编辑器的高亮类名都引用 var(--syn-*)，所以换配色不需要重建编辑器、不需要重解析文档，
 * 也不会打断光标与撤销栈——只是变量重算加一帧重绘。
 */
export function applyScheme(tokens: EditorSchemeTokens, root: HTMLElement = document.documentElement): void {
  for (const [name, variable] of Object.entries(TOKEN_VARS) as [EditorTokenName, string][]) {
    root.style.setProperty(variable, tokens[name])
  }
  // 深色配色要让原生滚动条、选区与输入法候选框跟着换皮肤，否则会露馅。
  root.style.setProperty('--ed-color-scheme', isDarkBackground(tokens.background) ? 'dark' : 'light')
}

export function isDarkBackground(color: string): boolean {
  const luminance = relativeLuminance(color)
  return luminance !== null && luminance < 0.4
}

/** 面板用：某个色槽相对编辑区底色的对比度。 */
export function tokenContrast(tokens: EditorSchemeTokens, name: EditorTokenName): number | null {
  return contrastRatio(tokens[name], tokens.background)
}

export function cloneSchemeTokens(tokens: EditorSchemeTokens): EditorSchemeTokens {
  return { ...tokens }
}
