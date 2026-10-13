import { describe, expect, it } from 'vitest'
import {
  acceleratorLabel,
  ariaKeyshortcuts,
  previewShortcuts,
  shortcutFor,
  type ShortcutKeyEvent,
} from '../src/lib/shortcuts'

/** 造一个键盘事件：只写跟匹配有关的那几个字段。 */
function keyEvent(key: string, modifiers: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers }
}

describe('快捷键的匹配', () => {
  it('Ctrl 与 Cmd 都算主修饰键', () => {
    expect(shortcutFor(keyEvent('s', { ctrlKey: true }))).toBe('save')
    expect(shortcutFor(keyEvent('s', { metaKey: true }))).toBe('save')
  })

  it('Shift 要逐条对上，Ctrl+Shift+S 走另存为而不是保存', () => {
    expect(shortcutFor(keyEvent('S', { ctrlKey: true, shiftKey: true }))).toBe('saveAs')
    expect(shortcutFor(keyEvent('s', { ctrlKey: true }))).toBe('save')
  })

  it('文件与打印命令各归各的', () => {
    expect(shortcutFor(keyEvent('o', { ctrlKey: true }))).toBe('open')
    expect(shortcutFor(keyEvent('n', { ctrlKey: true }))).toBe('newDocument')
    expect(shortcutFor(keyEvent('p', { ctrlKey: true }))).toBe('print')
  })

  it('缩放键三种：Ctrl+= 、Ctrl+Shift+= 与 Ctrl+- 、Ctrl+0', () => {
    expect(shortcutFor(keyEvent('=', { ctrlKey: true }))).toBe('zoomIn')
    expect(shortcutFor(keyEvent('+', { ctrlKey: true, shiftKey: true }))).toBe('zoomIn')
    expect(shortcutFor(keyEvent('-', { ctrlKey: true }))).toBe('zoomOut')
    expect(shortcutFor(keyEvent('0', { ctrlKey: true }))).toBe('zoomReset')
  })

  it('没按修饰键、或带了 Alt 的都不认', () => {
    expect(shortcutFor(keyEvent('s'))).toBeNull()
    expect(shortcutFor(keyEvent('s', { shiftKey: true }))).toBeNull()
    // AltGr 在有些键盘上就报成 Ctrl+Alt，抢下来会吃掉输入法组合键。
    expect(shortcutFor(keyEvent('s', { ctrlKey: true, altKey: true }))).toBeNull()
  })

  it('表里没有的键一律放过', () => {
    expect(shortcutFor(keyEvent('a', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(keyEvent('z', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(keyEvent('p', { ctrlKey: true, shiftKey: true }))).toBeNull()
  })
})

describe('快捷键的显示文案', () => {
  it('牌子不同、写法不同，但都落在同一个键上', () => {
    expect(acceleratorLabel('save')).toMatch(/^(Ctrl\+|⌘)S$/)
    expect(acceleratorLabel('saveAs')).toMatch(/^(Ctrl\+Shift\+|⌘⇧)S$/)
    expect(acceleratorLabel('zoomIn')).toMatch(/^(Ctrl\+|⌘)=$/)
  })

  it('aria-keyshortcuts 用规范键名，不跟显示文案混用', () => {
    expect(ariaKeyshortcuts('save')).toMatch(/^(Control|Meta)\+S$/)
    expect(ariaKeyshortcuts('saveAs')).toMatch(/^(Control\+Shift|Meta\+Shift)\+S$/)
  })
})

describe('交给预览 iframe 的那份键位表', () => {
  it('是同一张表摊开的：id、键、Shift 都在（Shift 一律写成布尔，免得两边一个 undefined 一个 false）', () => {
    const combos = previewShortcuts()
    expect(combos).toContainEqual({ id: 'save', key: 's', shift: false })
    expect(combos).toContainEqual({ id: 'saveAs', key: 's', shift: true })
    expect(combos).toContainEqual({ id: 'open', key: 'o', shift: false })
    expect(combos).toContainEqual({ id: 'newDocument', key: 'n', shift: false })
    expect(combos).toContainEqual({ id: 'print', key: 'p', shift: false })
    expect(combos).toContainEqual({ id: 'zoomIn', key: '=', shift: false })
    expect(combos).toContainEqual({ id: 'zoomIn', key: '+', shift: true })
    expect(combos).toContainEqual({ id: 'zoomOut', key: '-', shift: false })
    expect(combos).toContainEqual({ id: 'zoomReset', key: '0', shift: false })
    expect(combos.every((combo) => typeof combo.shift === 'boolean')).toBe(true)
  })

  it('帧里认出来的组合，在宿主这份匹配逻辑里也是同一条（表不会分成两份）', () => {
    for (const combo of previewShortcuts()) {
      expect(shortcutFor(keyEvent(combo.key, { ctrlKey: true, shiftKey: combo.shift }))).toBe(combo.id)
    }
    // 表里没有的组合不能被帧拦下：预览里的文字要能选中、复制
    expect(shortcutFor(keyEvent('c', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(keyEvent('a', { ctrlKey: true }))).toBeNull()
  })
})
