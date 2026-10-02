import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_SCHEMES,
  DEFAULT_SCHEME_ID,
  getBuiltInScheme,
  migrateSchemeLibrary,
} from '@stylemd/editor-theme'

const paper = getBuiltInScheme('paper')!

describe('配色方案库迁移', () => {
  it('缺色槽按默认值补齐，未知色槽丢弃并记一条说明', () => {
    const { library, notes } = migrateSchemeLibrary({
      schemaVersion: 1,
      activeId: 'mine',
      schemes: [
        {
          id: 'mine',
          name: '我的配色',
          tokens: { background: '#000000', rainbow: '#ff00ff' },
        },
      ],
    })
    const mine = library.schemes.find((scheme) => scheme.id === 'mine')
    expect(mine?.tokens.background).toBe('#000000')
    expect(mine?.tokens.heading).toBe(paper.tokens.heading)
    expect(mine?.tokens).not.toHaveProperty('rainbow')
    expect(notes.some((note) => note.includes('rainbow'))).toBe(true)
  })

  it('内置方案永远补齐到库里', () => {
    const { library } = migrateSchemeLibrary({ schemaVersion: 1, activeId: 'paper', schemes: [] })
    expect(library.schemes.length).toBe(BUILT_IN_SCHEMES.length)
    expect(library.recentIds).toHaveLength(BUILT_IN_SCHEMES.length)
  })

  it('老存档没有 recentIds 时按方案顺序补齐，当前方案排最前', () => {
    const { library } = migrateSchemeLibrary({ schemaVersion: 1, activeId: 'night', schemes: [] })
    expect(library.recentIds[0]).toBe('night')
    expect(new Set(library.recentIds).size).toBe(library.recentIds.length)
    expect(library.recentIds).toHaveLength(library.schemes.length)
  })

  it('存档里回写的内置方案不会被复制成自定义方案', () => {
    const { library } = migrateSchemeLibrary({ schemaVersion: 1, activeId: 'paper', schemes: BUILT_IN_SCHEMES })
    expect(library.schemes).toHaveLength(BUILT_IN_SCHEMES.length)
    expect(library.schemes.every((scheme) => scheme.builtIn === true)).toBe(true)
  })

  it('activeId 失效时回落到默认方案', () => {
    const { library, notes } = migrateSchemeLibrary({ schemaVersion: 1, activeId: 'ghost', schemes: [] })
    expect(library.activeId).toBe(DEFAULT_SCHEME_ID)
    expect(notes.join()).toContain('ghost')
  })

  it('自定义方案不能占用内置 id，会被改名', () => {
    const { library, notes } = migrateSchemeLibrary({
      schemaVersion: 1,
      activeId: 'paper',
      schemes: [{ id: 'paper', name: '冒名顶替', tokens: paper.tokens }],
    })
    expect(library.schemes.filter((scheme) => scheme.id === 'paper')).toHaveLength(1)
    expect(library.schemes.find((scheme) => scheme.name === '冒名顶替')?.id).toBe('paper-2')
    expect(notes.join()).toContain('改名')
  })

  it('色值非法时用默认值补，不抛错', () => {
    const { library } = migrateSchemeLibrary({
      schemaVersion: 1,
      activeId: 'x',
      schemes: [{ id: 'x', name: 'x', tokens: { ...paper.tokens, heading: 'url(http://evil)' } }],
    })
    expect(library.schemes.find((scheme) => scheme.id === 'x')?.tokens.heading).toBe(paper.tokens.heading)
  })

  it('版本高于当前支持时直接拒绝', () => {
    expect(() => migrateSchemeLibrary({ schemaVersion: 99, activeId: 'paper', schemes: [] })).toThrow()
  })

  it('完全不是对象时直接拒绝', () => {
    expect(() => migrateSchemeLibrary(null)).toThrow()
    expect(() => migrateSchemeLibrary('#ffffff')).toThrow()
  })
})
