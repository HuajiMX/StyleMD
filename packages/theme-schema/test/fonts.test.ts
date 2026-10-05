import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT_STACK, DEFAULT_MONO_STACK } from '../src/defaults'
import { fontSlotsFromChain, fontSlotsToChain, isCjkFamily, isGenericFamily } from '../src/fonts'

describe('字体槽位', () => {
  it('认出常见中文字体，且不把 CSS 通用族当成中文字体', () => {
    expect(isCjkFamily('SimSun')).toBe(true)
    expect(isCjkFamily('Source Han Serif SC')).toBe(true)
    expect(isCjkFamily('Microsoft YaHei')).toBe(true)
    expect(isCjkFamily('FZShuTi')).toBe(true)
    expect(isCjkFamily('STCaiyun')).toBe(true)
    expect(isCjkFamily('Times New Roman')).toBe(false)
    // 通用族 `fangsong` 与 Windows 的 `FangSong` 不是一回事
    expect(isGenericFamily('fangsong')).toBe(true)
    expect(isCjkFamily('fangsong')).toBe(false)
    expect(isCjkFamily('FangSong')).toBe(true)
  })

  it('默认正文栈折成槽后是「西文跟随中文」', () => {
    const slots = fontSlotsFromChain(DEFAULT_FONT_STACK)
    expect(slots.latinFamily).toBe('')
    expect(slots.cjkFamily).toBe('Source Han Serif SC')
    expect(slots.fallbackFamilies).toEqual(DEFAULT_FONT_STACK.slice(1))
  })

  it('没有中文字体的栈：第一个非通用家族当西文，中文槽留空', () => {
    expect(fontSlotsFromChain(DEFAULT_MONO_STACK)).toEqual({
      latinFamily: 'Cascadia Mono',
      cjkFamily: '',
      fallbackFamilies: DEFAULT_MONO_STACK.slice(1),
    })
  })

  it('西文写在中文前面的链按位置归槽', () => {
    expect(fontSlotsFromChain(['Arial', 'SimSun', 'serif'])).toEqual({
      latinFamily: 'Arial',
      cjkFamily: 'SimSun',
      fallbackFamilies: ['serif'],
    })
  })

  it('折回去能得到原链（迁移不改变渲染结果）', () => {
    for (const chain of [DEFAULT_FONT_STACK, DEFAULT_MONO_STACK, ['Arial', 'SimSun', 'serif'], ['serif']]) {
      expect(fontSlotsToChain(fontSlotsFromChain(chain))).toEqual(chain)
    }
  })
})
