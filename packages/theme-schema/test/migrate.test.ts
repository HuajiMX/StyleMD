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

  it('非对象输入抛错', () => {
    expect(() => migrateTheme('not a theme')).toThrow(/JSON 对象/)
  })
})
