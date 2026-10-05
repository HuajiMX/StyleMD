import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT_STACK, DEFAULT_MONO_STACK } from '@stylemd/theme-schema'
import {
  FOLLOW_CJK_LABEL,
  isCjkFamily,
  isGenericFamily,
  readFontSlots,
  ribbonFontValue,
  writeFontCjk,
  writeFontWestern,
} from '../src/lib/fontChain'

describe('中西文字体槽位', () => {
  it('认出常见中文字体，且不把 CSS 通用族当成中文字体', () => {
    expect(isCjkFamily('SimSun')).toBe(true)
    expect(isCjkFamily('Source Han Serif SC')).toBe(true)
    expect(isCjkFamily('Microsoft YaHei')).toBe(true)
    expect(isCjkFamily('Times New Roman')).toBe(false)
    // 通用族 `fangsong` 与 Windows 的 `FangSong` 不是一回事
    expect(isGenericFamily('fangsong')).toBe(true)
    expect(isCjkFamily('fangsong')).toBe(false)
    expect(isCjkFamily('FangSong')).toBe(true)
  })

  it('默认主题的链读出来就是「西文跟随中文字体」', () => {
    // 中文字体排在最前，Times New Roman 在它后面只是中文缺失时的兜底
    expect(readFontSlots(DEFAULT_FONT_STACK)).toEqual({ western: '', cjk: 'Source Han Serif SC' })
  })

  it('链里没有中文字体时，第一个非通用家族算西文，中文槽为空', () => {
    expect(readFontSlots(DEFAULT_MONO_STACK)).toEqual({ western: 'Cascadia Mono', cjk: '' })
    expect(readFontSlots(['serif'])).toEqual({ western: '', cjk: '' })
  })

  it('设了西文就写在第一个中文字体前面', () => {
    const chain = writeFontWestern(DEFAULT_FONT_STACK, 'Arial')
    expect(chain[0]).toBe('Arial')
    expect(chain.slice(1)).toEqual([...DEFAULT_FONT_STACK])
    expect(readFontSlots(chain)).toEqual({ western: 'Arial', cjk: 'Source Han Serif SC' })
  })

  it('西文回到「使用中文字体」时，链里不再留西文家族', () => {
    const chain = writeFontWestern(writeFontWestern(DEFAULT_FONT_STACK, 'Arial'), '')
    expect(chain).toEqual([...DEFAULT_FONT_STACK])
    expect(readFontSlots(chain).western).toBe('')
    expect(FOLLOW_CJK_LABEL).toBe('使用中文字体')
  })

  it('把中文字体填进西文槽等于「使用中文字体」，不会偷偷改掉中文字体', () => {
    const chain = writeFontWestern(DEFAULT_FONT_STACK, 'SimSun')
    expect(chain).toEqual([...DEFAULT_FONT_STACK])
    expect(readFontSlots(chain)).toEqual({ western: '', cjk: 'Source Han Serif SC' })
    // 已经设了西文时，填一个中文字体等于把它撤掉
    const cleared = writeFontWestern(writeFontWestern(DEFAULT_FONT_STACK, 'Arial'), 'SimHei')
    expect(cleared).toEqual([...DEFAULT_FONT_STACK])
  })

  it('换中文字体是就地替换，不动西文与其余回退', () => {
    const withWestern = writeFontWestern(DEFAULT_FONT_STACK, 'Arial')
    const chain = writeFontCjk(withWestern, 'SimHei')
    expect(chain[0]).toBe('Arial')
    expect(chain[1]).toBe('SimHei')
    expect(chain.slice(2)).toEqual(DEFAULT_FONT_STACK.slice(1))
  })

  it('链里没有中文字体时，选中的中文字体插在西文字体之后', () => {
    const chain = writeFontCjk(DEFAULT_MONO_STACK, 'SimSun')
    expect(chain[0]).toBe('Cascadia Mono')
    expect(chain[1]).toBe('SimSun')
    expect(readFontSlots(chain)).toEqual({ western: 'Cascadia Mono', cjk: 'SimSun' })
  })

  it('两个槽位来回设置后，读出来还是设置的值', () => {
    const once = writeFontWestern(writeFontCjk(DEFAULT_FONT_STACK, 'KaiTi'), 'Georgia')
    expect(readFontSlots(once)).toEqual({ western: 'Georgia', cjk: 'KaiTi' })
    const twice = writeFontCjk(once, 'SimHei')
    expect(readFontSlots(twice)).toEqual({ western: 'Georgia', cjk: 'SimHei' })
  })

  it('功能区那个框显示中文字体；整条链没有中文字体时退回主字体，不显示空框', () => {
    expect(ribbonFontValue(DEFAULT_FONT_STACK)).toBe('Source Han Serif SC')
    // 代码角色只有等宽西文，框里得显示点什么
    expect(ribbonFontValue(DEFAULT_MONO_STACK)).toBe('Cascadia Mono')
    expect(ribbonFontValue([])).toBe('')
  })
})
