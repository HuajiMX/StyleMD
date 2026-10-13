import { useCallback, useEffect, useRef } from 'react'
import type { PreviewShortcut } from '@stylemd/renderer-paged'

/**
 * 全局快捷键。
 *
 * 「有哪些快捷键」只在这张表里定义，界面上的提示文案也从这儿取（`acceleratorLabel`），
 * 免得提示和实际行为各说各话，加一条时也不会漏掉某一处。
 *
 * 为什么不做成 Electron 的菜单加速键：桌面壳去掉了默认菜单栏（macOS 除外），加速键没有宿主可挂；
 * 而渲染进程自己听 keydown 在两个环境里都成立——一条实现同时管浏览器和桌面壳。
 * Chromium 不会替我们处理 Ctrl+S / Ctrl+P（那是 Chrome 浏览器层的命令，Electron 里没有这两个），
 * 所以它们会原样送到页面上；Ctrl+= / Ctrl+- / Ctrl+0 的整页缩放属于浏览器默认行为，由 preventDefault 拦掉。
 *
 * 刻意没接的几个键：
 * - Ctrl+Z / Ctrl+Y：编辑器（CodeMirror）自己有撤销栈，全局抢下来会让编辑器的撤销失灵；
 *   工具带上那个「撤销」只管样式包，两套栈合不成一个。
 * - Ctrl+R / F5：在桌面壳里等于重载页面，关掉自动保存时按一下就把没写盘的内容全丢了。
 * - Ctrl+W：关窗口是外壳的事，不该由页面悄悄做掉。
 */

export type ShortcutId =
  | 'save'
  | 'saveAs'
  | 'open'
  | 'newDocument'
  | 'print'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'

/** 一个按法：`key` 用 `KeyboardEvent.key` 的小写写法（字母一律小写，标点原样）。 */
interface Combo {
  key: string
  /** 组合里要不要按 Shift；不写就是「按了 Shift 不算这一条」，Ctrl+S 因此不会被 Ctrl+Shift+S 误触发。 */
  shift?: boolean
}

interface ShortcutSpec {
  id: ShortcutId
  /** 同一个动作可以有好几种按法（Ctrl+= 与 Ctrl+Shift+= 都是放大），第一条用于显示。 */
  combos: Combo[]
}

const SPECS: ShortcutSpec[] = [
  { id: 'save', combos: [{ key: 's' }] },
  { id: 'saveAs', combos: [{ key: 's', shift: true }] },
  { id: 'open', combos: [{ key: 'o' }] },
  { id: 'newDocument', combos: [{ key: 'n' }] },
  { id: 'print', combos: [{ key: 'p' }] },
  // 主键盘上 + 是 Shift+=，两个都认：手感随用户，提示只写最简单的那个。
  { id: 'zoomIn', combos: [{ key: '=' }, { key: '+', shift: true }] },
  { id: 'zoomOut', combos: [{ key: '-' }] },
  { id: 'zoomReset', combos: [{ key: '0' }] },
]

/** 只看这几个字段，测试与单测里可以传普通对象，不必造 KeyboardEvent。 */
export type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
>

/**
 * 键盘事件对应哪条快捷键；不是快捷键就返回 null。
 *
 * 主修饰键 Ctrl 与 Cmd 都认（macOS 上两种习惯都常见）；带 Alt 的一律不认——
 * 有些键盘的 AltGr 会报成 Ctrl+Alt，抢下来会吃掉输入法组合键。Shift 必须逐条对上，
 * 否则 Ctrl+Shift+S 会先撞上 Ctrl+S。
 */
export function shortcutFor(event: ShortcutKeyEvent): ShortcutId | null {
  if (!event.ctrlKey && !event.metaKey) return null
  if (event.altKey) return null
  const key = event.key.toLowerCase()
  for (const spec of SPECS) {
    for (const combo of spec.combos) {
      if (combo.key !== key) continue
      if ((combo.shift ?? false) !== event.shiftKey) continue
      return spec.id
    }
  }
  return null
}

/**
 * 摊平成给预览 iframe 的那份键位表（同一张 `SPECS`）。
 *
 * 预览是另一个文档，焦点进去之后宿主的 `window` 收不到键事件，得由帧自己认出来再转回来；
 * 但它只负责「认」——动作仍由宿主按同一个 id 跑，表不会分成两份。
 */
export function previewShortcuts(): PreviewShortcut[] {
  return SPECS.flatMap((spec) =>
    spec.combos.map((combo) => ({ id: spec.id, key: combo.key, shift: combo.shift ?? false })),
  )
}

function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(`${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`)
}

function keyLabel(key: string): string {
  return /^[a-z]$/.test(key) ? key.toUpperCase() : key
}

/** 界面上的写法：Windows / Linux 是 `Ctrl+S`，macOS 是 `⌘S`。 */
export function acceleratorLabel(id: ShortcutId): string {
  const combo = SPECS.find((spec) => spec.id === id)?.combos[0]
  if (!combo) return ''
  const apple = isApplePlatform()
  const modifier = apple ? '⌘' : 'Ctrl+'
  const shift = combo.shift ? (apple ? '⇧' : 'Shift+') : ''
  return `${modifier}${shift}${keyLabel(combo.key)}`
}

/** `aria-keyshortcuts` 的写法要用规范键名，跟给人看的 `⌘` 不是一套（Cmd 在这儿叫 Meta）。 */
export function ariaKeyshortcuts(id: ShortcutId): string {
  const combo = SPECS.find((spec) => spec.id === id)?.combos[0]
  if (!combo) return ''
  const parts = [isApplePlatform() ? 'Meta' : 'Control']
  if (combo.shift) parts.push('Shift')
  parts.push(keyLabel(combo.key))
  return parts.join('+')
}

/**
 * 把快捷键接到动作上。表里没给处理函数的键不管，免得抢下默认行为又什么都不做。
 *
 * 监听挂在 window 上：CodeMirror 只对认得的键 preventDefault，Ctrl+S 这类不认的会照常冒泡上来，
 * 所以光标在编辑器里时一样能按。
 *
 * 返回一个「跑某条快捷键」的函数：预览 iframe 里的按键转过来之后走的是同一条路（见 App.tsx）。
 * 没接处理函数时返回 false，调用方据此决定要不要拦默认行为。
 */
export function useShortcuts(handlers: Partial<Record<ShortcutId, () => void>>): (id: ShortcutId) => boolean {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  const run = useCallback((id: ShortcutId): boolean => {
    const handler = latest.current[id]
    if (!handler) return false
    handler()
    return true
  }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const id = shortcutFor(event)
      if (!id) return
      // 拦掉默认行为：浏览器里 Ctrl+S 会弹「保存网页」、Ctrl+P 会打印整个界面，
      // Ctrl+= / Ctrl+- / Ctrl+0 会缩放整页（桌面壳里也一样）。表里没接处理函数的键不拦。
      if (run(id)) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [run])
  return run
}
