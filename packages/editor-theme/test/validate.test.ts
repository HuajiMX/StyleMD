import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_SCHEMES,
  getBuiltInScheme,
  isSchemeColor,
  validateScheme,
  validateSchemeLibrary,
  type EditorSchemeLibrary,
} from '@stylemd/editor-theme'

const paper = getBuiltInScheme('paper')!

describe('色值白名单', () => {
  it('只接受 #rrggbb 与 #rrggbbaa', () => {
    expect(isSchemeColor('#1d4ed8')).toBe(true)
    expect(isSchemeColor('#1D4ED8')).toBe(true)
    expect(isSchemeColor('#1d4ed8ff')).toBe(true)
  })

  it('挡住一切可能夹带样式的东西', () => {
    for (const bad of [
      'red',
      '#fff',
      '#12345',
      'rgb(1,2,3)',
      'url(http://evil.example/x.png)',
      '#fff; background-image: url(http://evil.example/x.png)',
      '#ffffff}',
      `${'#'.padEnd(300, 'a')}`,
      '',
    ]) {
      expect(isSchemeColor(bad), bad).toBe(false)
    }
  })

  it('非字符串一律拒绝', () => {
    expect(isSchemeColor(undefined)).toBe(false)
    expect(isSchemeColor(null)).toBe(false)
    expect(isSchemeColor(123)).toBe(false)
    expect(isSchemeColor({ value: '#ffffff' })).toBe(false)
  })
})

describe('方案校验', () => {
  it('内置方案通过', () => {
    for (const scheme of BUILT_IN_SCHEMES) expect(validateScheme(scheme).ok).toBe(true)
  })

  it('缺少色槽要报出来', () => {
    const broken = { id: 'x', name: 'x', tokens: { background: '#ffffff' } }
    const result = validateScheme(broken)
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('缺少色槽'))).toBe(true)
  })

  it('未知色槽要报出来', () => {
    const result = validateScheme({ ...paper, tokens: { ...paper.tokens, rainbow: '#ff00ff' } })
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('未知色槽'))).toBe(true)
  })

  it('非法 id 与超长名字要报出来', () => {
    expect(validateScheme({ ...paper, id: 'Paper Theme' }).ok).toBe(false)
    expect(validateScheme({ ...paper, id: '__proto__' }).ok).toBe(false)
    expect(validateScheme({ ...paper, name: 'x'.repeat(25) }).ok).toBe(false)
  })
})

describe('方案库校验', () => {
  const library: EditorSchemeLibrary = {
    schemaVersion: 1,
    activeId: 'paper',
    schemes: [paper],
    recentIds: ['paper'],
  }

  it('正常库通过', () => {
    expect(validateSchemeLibrary(library).ok).toBe(true)
  })

  it('activeId 指向不存在的方案要报出来', () => {
    const result = validateSchemeLibrary({ ...library, activeId: 'nope' })
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('activeId'))).toBe(true)
  })

  it('重复 id 要报出来', () => {
    const result = validateSchemeLibrary({ ...library, schemes: [paper, paper] })
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('重复'))).toBe(true)
  })

  it('recentIds 指向不存在的方案要报出来', () => {
    const result = validateSchemeLibrary({ ...library, recentIds: ['paper', 'ghost'] })
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('recentIds'))).toBe(true)
  })
})
