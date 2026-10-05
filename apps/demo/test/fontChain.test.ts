import { describe, expect, it } from 'vitest'
import type { ComputedRoleStyle } from '@stylemd/theme-schema'
import { FOLLOW_CJK_LABEL, currentSlots, hasFontSlots, ribbonFontValue } from '../src/lib/fontChain'

const resolved = {
  latinFamily: 'Arial',
  cjkFamily: 'SimSun',
  fallbackFamilies: ['serif'],
  sizePt: 12,
  weight: 400,
  italic: false,
  color: '#000',
  underline: false,
  letterSpacingPt: 0,
} satisfies ComputedRoleStyle['font']

describe('字体槽在界面上的读法', () => {
  it('角色显式声明过的槽优先，否则用解析值', () => {
    expect(currentSlots(undefined, resolved)).toEqual({ latinFamily: 'Arial', cjkFamily: 'SimSun', fallbackFamilies: ['serif'] })
    expect(currentSlots({ cjkFamily: 'KaiTi' }, resolved).cjkFamily).toBe('KaiTi')
    expect(currentSlots({ latinFamily: '' }, resolved).latinFamily).toBe('')
  })

  it('只有设过槽才算显式声明', () => {
    expect(hasFontSlots(undefined)).toBe(false)
    expect(hasFontSlots({ sizePt: 14 })).toBe(false)
    expect(hasFontSlots({ cjkFamily: 'SimSun' })).toBe(true)
    expect(hasFontSlots({ latinFamily: '' })).toBe(true)
  })

  it('功能区那个框优先显示中文字体，没有就退回西文与回退家族', () => {
    expect(ribbonFontValue({ latinFamily: 'Arial', cjkFamily: 'SimSun', fallbackFamilies: ['serif'] })).toBe('SimSun')
    expect(ribbonFontValue({ latinFamily: 'Cascadia Mono', cjkFamily: '', fallbackFamilies: ['monospace'] })).toBe('Cascadia Mono')
    expect(ribbonFontValue({ latinFamily: '', cjkFamily: '', fallbackFamilies: ['serif'] })).toBe('serif')
    expect(ribbonFontValue({ latinFamily: '', cjkFamily: '', fallbackFamilies: [] })).toBe('')
    expect(FOLLOW_CJK_LABEL).toBe('使用中文字体')
  })
})
