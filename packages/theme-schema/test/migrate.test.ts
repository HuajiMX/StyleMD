import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, migrateTheme } from '@stylemd/theme-schema'

describe('migrateTheme', () => {
  it('补齐缺失的 document 字段，而不是直接失败', () => {
    const { theme, notes } = migrateTheme({ id: 'x', name: 'X', styles: [{ role: 'body.text' }] })
    expect(theme.document.defaults.fontSizePt).toBeGreaterThan(0)
    expect(theme.document.page.marginMm).toBeDefined()
    expect(theme.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(notes.join()).toContain('schemaVersion')
  })

  it('未知字段原样保留，保证向前兼容', () => {
    const { theme } = migrateTheme({
      schemaVersion: 1,
      id: 'x',
      name: 'X',
      styles: [{ role: 'body.text', futureFeature: { hello: 'world' } }],
    })
    expect((theme.styles[0] as unknown as Record<string, unknown>).futureFeature).toEqual({ hello: 'world' })
  })

  it('版本高于当前支持时抛错', () => {
    expect(() => migrateTheme({ schemaVersion: 99, id: 'x', name: 'X' })).toThrow(/更新版本/)
  })

  it('v1 样式包补上页眉页脚的默认距边距离', () => {
    const { theme } = migrateTheme({
      schemaVersion: 1,
      id: 'x',
      name: 'X',
      document: { page: { header: { center: '{title}' }, footer: { center: '{page}' } } },
      styles: [],
    })
    expect(theme.document.page.header?.distanceMm).toBeGreaterThan(0)
    expect(theme.document.page.footer?.distanceMm).toBeGreaterThan(0)
  })

  it('样式包里写死的距边距离（含 0）不被迁移覆盖', () => {
    const { theme } = migrateTheme({
      schemaVersion: 1,
      id: 'x',
      name: 'X',
      document: { page: { header: { center: '{title}', distanceMm: 0 } } },
      styles: [],
    })
    expect(theme.document.page.header?.distanceMm).toBe(0)
  })

  it('非对象输入抛错', () => {
    expect(() => migrateTheme('not a theme')).toThrow(/JSON 对象/)
  })

  it('v2 的字体回退链折成西文 / 中文 / 回退三个槽', () => {
    const { theme } = migrateTheme({
      schemaVersion: 2,
      id: 'x',
      name: 'X',
      document: { defaults: { fontFamily: ['Arial', 'SimSun', 'serif'] } },
      styles: [{ role: 'body.text', font: { family: ['Times New Roman', 'Microsoft YaHei', 'serif'], sizePt: 12 } }],
    })
    expect(theme.document.defaults.latinFamily).toBe('Arial')
    expect(theme.document.defaults.cjkFamily).toBe('SimSun')
    expect(theme.document.defaults.fallbackFamilies).toEqual(['serif'])
    const font = theme.styles[0]?.font
    expect(font?.latinFamily).toBe('Times New Roman')
    expect(font?.cjkFamily).toBe('Microsoft YaHei')
    expect(font?.fallbackFamilies).toEqual(['serif'])
    expect(font?.sizePt).toBe(12)
    // 旧字段不能留下，否则派生出的两套值会打架
    expect((font as unknown as Record<string, unknown>).family).toBeUndefined()
  })

  it('没声明版本号但还带着旧回退链的样式包同样会被折算', () => {
    const { theme } = migrateTheme({ id: 'x', name: 'X', styles: [{ role: 'body.text', font: { family: ['SimSun'] } }] })
    expect(theme.styles[0]?.font?.cjkFamily).toBe('SimSun')
  })
})
