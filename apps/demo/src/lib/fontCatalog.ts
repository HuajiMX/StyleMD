import { useEffect, useSyncExternalStore } from 'react'
import { desktopBridge } from './desktop'
import { FONT_FAMILIES } from './typePresets'

/**
 * 字体候选的三个来源，按可信度从高到低。
 *
 * `desktop` = 桌面壳主进程枚举出来的系统字体（一定能用）；
 * `browser` = 浏览器的 Local Font Access API（`queryLocalFonts`）；
 * `curated` = 手写的常用清单，本环境不给枚举字体时的兜底。
 */
export type FontSource = 'desktop' | 'browser' | 'curated'

export interface FontCatalog {
  /** 全部候选，常用的排前面 */
  families: string[]
  source: FontSource
  /** 给界面看的来源说明，直接摆在字体分区上 */
  note: string
  /** 读到的本机字体数量；`curated` 来源为 0 */
  systemCount: number
  /** 英文家族名 → 本地化（中文）名；没有就显示家族名本身 */
  aliases: Record<string, string>
}

export const CURATED_HINT = '常用'
export const SYSTEM_HINT = '本机'

/**
 * `queryLocalFonts` 和 File System Access API 一样还没进 lib.dom，
 * 这里按 document.ts 的做法声明最小形状，不引第三方类型。
 */
interface FontDataLike {
  family: string
}

interface LocalFontWindow {
  queryLocalFonts?: () => Promise<FontDataLike[]>
}

const CURATED_SET = new Set(FONT_FAMILIES)

/** 去掉空白与重复项，保持原有顺序。 */
export function dedupeFamilies(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

/**
 * 常用名单原样排前面（手写顺序是有意的），本机其余字体按名称往后接。
 * 直接按字母排会让「宋体」「微软雅黑」淹没在四百多个字体里，没法用。
 *
 * `labelOf` 用来排序：列表里显示的是中文名时，就得按中文名排，
 * 否则用户看到的是「按一个看不见的键乱排」。
 */
export function mergeFamilies(
  curated: string[],
  system: string[],
  labelOf: (family: string) => string = (family) => family,
): string[] {
  const head = dedupeFamilies(curated)
  const headSet = new Set(head)
  // 去重要对「传进来的常用名单」做，不是对模块级常量：否则本机字体里
  // 那些恰好也在常用清单里的（Arial、KaiTi 之类）会被过滤掉却没人补回来。
  const rest = dedupeFamilies(system).filter((family) => !headSet.has(family))
  rest.sort((a, b) => labelOf(a).localeCompare(labelOf(b), 'zh-Hans'))
  return [...head, ...rest]
}

/** 展示用的名字：有中文名就用中文名，否则就是家族名本身。 */
export function fontLabel(family: string, aliases: Record<string, string>): string {
  return aliases[family] ?? family
}

/** 用户敲进来的可能是中文名，反查回家族名（样式里存的一律是家族名，CSS 匹配才稳）。 */
export function resolveFontInput(text: string, catalog: FontCatalog): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return catalog.families.find((family) => catalog.aliases[family] === trimmed) ?? trimmed
}

export interface FontOption {
  value: string
  label: string
  hint: string
  /** 中英文名都算命中，用户敲哪个都能搜到 */
  keywords: string
}

/** 下拉候选项：值是家族名，标签是中文名，两个名字都能搜。 */
export function fontOptions(catalog: FontCatalog): FontOption[] {
  return catalog.families.map((family) => {
    const label = fontLabel(family, catalog.aliases)
    return {
      value: family,
      label,
      hint: fontOptionHint(family, catalog.source),
      keywords: `${family} ${label}`,
    }
  })
}

/** 候选列表里的分组标注：常用名单里的算「常用」，其余是「本机」。 */
export function fontOptionHint(family: string, source: FontSource = 'curated'): string {
  if (CURATED_SET.has(family)) return CURATED_HINT
  return source === 'curated' ? CURATED_HINT : SYSTEM_HINT
}

const CURATED_ONLY: FontCatalog = {
  families: [...FONT_FAMILIES],
  source: 'curated',
  note: '常用字体清单（当前环境不给枚举本机字体）',
  systemCount: 0,
  aliases: {},
}

let current: FontCatalog = CURATED_ONLY
let inFlight: Promise<void> | null = null
let settled = false
const listeners = new Set<() => void>()

export function getFontCatalog(): FontCatalog {
  return current
}

export function subscribeFontCatalog(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 订阅候选清单；组件挂载时顺带拉一次（已经拉过就是空操作）。 */
export function useFontCatalog(): FontCatalog {
  const catalog = useSyncExternalStore(subscribeFontCatalog, getFontCatalog)
  useEffect(() => {
    void loadFontCatalog()
  }, [])
  return catalog
}

/**
 * 拉一次候选清单。
 *
 * `force = false` 时不会去弹浏览器的权限框：`queryLocalFonts` 会问用户
 * 「允许这个站点查看你的字体吗」，页面一加载就弹太唐突，只有此前已经授权过才直接读；
 * 没授权就先给常用清单，等用户点「加载本机字体」再问（那次点击就是用户手势）。
 */
export function loadFontCatalog(force = false): Promise<void> {
  if (inFlight) return inFlight
  if (settled && !force) return Promise.resolve()
  inFlight = runLoad(force).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runLoad(force: boolean): Promise<void> {
  settled = true
  const system = await readSystemFamilies(force)
  if (system.kind !== 'ok') {
    publish({
      ...CURATED_ONLY,
      note: system.kind === 'denied' ? '常用字体清单（未获本机字体权限）' : CURATED_ONLY.note,
    })
    return
  }
  const localizedCount = system.families.filter((family) => system.aliases[family]).length
  publish({
    families: mergeFamilies(FONT_FAMILIES, system.families, (family) => fontLabel(family, system.aliases)),
    source: system.source,
    note: `${system.source === 'desktop' ? '桌面壳' : '浏览器'}读到 ${system.families.length} 个本机字体${
      localizedCount > 0 ? `（${localizedCount} 个有中文名）` : ''
    }，常用的排在前面`,
    systemCount: system.families.length,
    aliases: system.aliases,
  })
}

type SystemFonts =
  | { kind: 'ok'; source: 'desktop' | 'browser'; families: string[]; aliases: Record<string, string> }
  | { kind: 'unavailable' }
  | { kind: 'denied' }

async function readSystemFamilies(force: boolean): Promise<SystemFonts> {
  const listFontAliases = desktopBridge()?.listFontAliases
  const queryLocalFonts = (window as unknown as LocalFontWindow).queryLocalFonts

  // 列表只有一个来源：渲染进程自己的 `queryLocalFonts()`——它就是系统名册
  // （Windows 上底层是 DirectWrite），而且给出的名字正是排版时会匹配的那套。
  // 桌面壳额外补一本名字词典（Chromium 只给英文家族名），拿不到就显示英文名。
  let aliases: Record<string, string> = {}
  if (typeof listFontAliases === 'function') {
    try {
      aliases = await listFontAliases()
    } catch {
      aliases = {}
    }
  }

  if (typeof queryLocalFonts !== 'function') return { kind: 'unavailable' }
  // 桌面壳里主进程已经放行 local-fonts 权限，读它不会弹框；
  // 浏览器里会弹权限框，只有用户此前授权过才直接读，否则退回常用清单，
  // 等用户点「加载本机字体」再问（那次点击就是用户手势）
  const inDesktop = typeof listFontAliases === 'function'
  if (!inDesktop && !force && !(await isLocalFontsGranted())) return { kind: 'denied' }
  try {
    // 必须带上 window 当接收者，解构出来直接调用会丢
    const families = dedupeFamilies((await queryLocalFonts.call(window)).map((font) => font.family))
    return families.length > 0
      ? { kind: 'ok', source: inDesktop ? 'desktop' : 'browser', families, aliases }
      : { kind: 'unavailable' }
  } catch {
    return { kind: 'denied' }
  }
}

/**
 * 有的浏览器不认 `local-fonts` 这个权限名，`query` 直接抛错，按「没授权」处理。
 */
async function isLocalFontsGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'local-fonts' as PermissionName })
    return status.state === 'granted'
  } catch {
    return false
  }
}

/**
 * 环境里有没有「点了能拿到本机字体」的入口。
 * 桌面壳在主进程就枚举好了，不需要用户点按钮，所以这里返回 false。
 */
export function canRequestSystemFonts(): boolean {
  // 桌面壳里读字体不弹框，根本不需要这个入口
  if (desktopBridge()?.listFontAliases) return false
  return typeof (window as unknown as LocalFontWindow).queryLocalFonts === 'function'
}

function publish(next: FontCatalog): void {
  current = next
  for (const listener of listeners) listener()
}
