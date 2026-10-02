import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_SCHEMES,
  CONTRAST_MINIMUM,
  DEFAULT_SCHEME_ID,
  TOKEN_NAMES,
  TOKEN_TIERS,
  contrastRatio,
  getBuiltInScheme,
  validateScheme,
} from '@stylemd/editor-theme'

describe('内置编辑器配色方案', () => {
  it('每个预设都必须通过校验', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      const result = validateScheme(scheme)
      expect(result.errors, `${scheme.id} 校验失败：${result.errors.join('; ')}`).toEqual([])
      expect(result.ok).toBe(true)
    }
  })

  it('id 唯一且都标记为内置', () => {
    const ids = BUILT_IN_SCHEMES.map((scheme) => scheme.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const scheme of BUILT_IN_SCHEMES) expect(scheme.builtIn).toBe(true)
    expect(getBuiltInScheme(DEFAULT_SCHEME_ID)).toBeDefined()
  })

  it('对比度必须过线：文本 4.5:1，标记与图形 3:1', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      for (const name of TOKEN_NAMES) {
        const tier = TOKEN_TIERS[name]
        const minimum = CONTRAST_MINIMUM[tier]
        if (minimum === 0) continue
        const ratio = contrastRatio(scheme.tokens[name], scheme.tokens.background)
        expect(ratio, `${scheme.id} 的 ${name} 无法解析`).not.toBeNull()
        expect(
          ratio as number,
          `${scheme.id} 的 ${name} 对比度 ${(ratio as number).toFixed(2)}:1 低于 ${minimum}:1`,
        ).toBeGreaterThanOrEqual(minimum)
      }
    }
  })

  it('代码底色必须与编辑区底色可分辨', () => {
    for (const scheme of BUILT_IN_SCHEMES) {
      expect(scheme.tokens.codeBg).not.toBe(scheme.tokens.background)
    }
  })
})
