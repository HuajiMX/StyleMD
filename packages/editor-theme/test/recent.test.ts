import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_SCHEMES,
  DEFAULT_SCHEME_ID,
  getBuiltInScheme,
  markSchemeUsed,
  orderSchemeIds,
  orderSchemesByFrozenIds,
  orderSchemesByRecent,
  type EditorSchemeLibrary,
} from '@stylemd/editor-theme'

function libraryOf(extra: string[] = [], recentIds?: string[]): EditorSchemeLibrary {
  const schemes = [
    ...BUILT_IN_SCHEMES.map((scheme) => ({ ...scheme })),
    ...extra.map((id) => ({
      id,
      name: id,
      builtIn: false,
      basedOn: DEFAULT_SCHEME_ID,
      tokens: { ...getBuiltInScheme(DEFAULT_SCHEME_ID)!.tokens },
    })),
  ]
  return { schemaVersion: 1, activeId: DEFAULT_SCHEME_ID, schemes, recentIds: recentIds ?? schemes.map((scheme) => scheme.id) }
}

describe('配色方案的最近使用顺序', () => {
  it('默认按方案顺序排列', () => {
    const library = libraryOf()
    expect(orderSchemeIds(library)).toEqual(BUILT_IN_SCHEMES.map((scheme) => scheme.id))
  })

  it('最近用过的排到最前，其余保持原顺序', () => {
    const library = markSchemeUsed(libraryOf(), 'night')
    const ordered = orderSchemeIds(library)
    expect(ordered[0]).toBe('night')
    expect(ordered).toHaveLength(BUILT_IN_SCHEMES.length)
  })

  it('连续切换时按最近一次排前', () => {
    let library = libraryOf()
    library = markSchemeUsed(library, 'night')
    library = markSchemeUsed(library, 'quiet')
    library = markSchemeUsed(library, 'night')
    expect(orderSchemeIds(library).slice(0, 3)).toEqual(['night', 'quiet', ...orderSchemeIds(library).slice(2, 3)])
    expect(library.activeId).toBe('night')
  })

  it('排出来的列表覆盖全部方案且不重复', () => {
    const library = markSchemeUsed(libraryOf(['mine-1', 'mine-2']), 'mine-2')
    const ids = orderSchemeIds(library)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(library.schemes.length)
  })

  it('指向已删除方案的记录会被忽略', () => {
    const library = libraryOf([], ['ghost', 'quiet', 'paper'])
    expect(orderSchemeIds(library).slice(0, 2)).toEqual(['quiet', 'paper'])
  })

  it('选中不存在的方案时原样返回', () => {
    const library = libraryOf()
    expect(markSchemeUsed(library, 'nope')).toBe(library)
  })

  it('按最近顺序取前 5 个，就是工具带要展示的那一排', () => {
    let library = libraryOf(['mine-1'])
    library = markSchemeUsed(library, 'mine-1')
    const ribbon = orderSchemesByRecent(library).slice(0, 5)
    expect(ribbon[0]?.id).toBe('mine-1')
    expect(ribbon).toHaveLength(5)
    expect(ribbon.map((scheme) => scheme.id)).not.toContain('contrast')
  })

  it('定住顺序时：老方案位置不动，新方案追加到末尾', () => {
    const frozen = orderSchemeIds(libraryOf())
    const later = libraryOf(['mine-1'])
    const ordered = orderSchemesByFrozenIds(later.schemes, frozen)
    expect(ordered.map((scheme) => scheme.id)).toEqual([...frozen, 'mine-1'])
  })
})
