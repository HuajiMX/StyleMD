import { describe, expect, it } from 'vitest'
import { BUILT_IN_THEMES } from '@stylemd/presets'
import { validateTheme } from '@stylemd/theme-schema'

describe('内置样式包', () => {
  it('每个预设都必须通过校验', () => {
    for (const theme of BUILT_IN_THEMES) {
      const result = validateTheme(theme)
      expect(result.errors, `${theme.id} 校验失败：${result.errors.join('; ')}`).toEqual([])
      expect(result.ok).toBe(true)
    }
  })

  it('预设里的 basedOn 都必须指向存在的角色', () => {
    for (const theme of BUILT_IN_THEMES) {
      const roles = new Set(theme.styles.map((style) => style.role))
      for (const style of theme.styles) {
        if (style.basedOn) {
          expect(roles.has(style.basedOn), `${theme.id}: ${style.role} → ${style.basedOn} 不存在`).toBe(true)
        }
      }
    }
  })
})
