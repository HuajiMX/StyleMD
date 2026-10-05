import { describe, expect, it } from 'vitest'
import {
  dedupeFamilies,
  fontLabel,
  fontOptionHint,
  fontOptions,
  mergeFamilies,
  resolveFontInput,
  type FontCatalog,
} from '../src/lib/fontCatalog'

describe('字体候选清单', () => {
  it('去掉空白项与重复项，并保持原有顺序', () => {
    expect(dedupeFamilies(['SimSun', ' SimSun ', '', '  ', 'KaiTi'])).toEqual(['SimSun', 'KaiTi'])
  })

  it('常用名单排在最前且保持手写顺序，本机其余字体按名称排后面', () => {
    const merged = mergeFamilies(['Noto Serif SC', 'SimSun'], ['Zapf', 'Arial', 'KaiTi', 'SimSun'])
    expect(merged).toEqual(['Noto Serif SC', 'SimSun', 'Arial', 'KaiTi', 'Zapf'])
  })

  it('既是常用又装在本机时不重复出现', () => {
    const merged = mergeFamilies(['SimSun'], ['SimSun', 'SimSun'])
    expect(merged).toEqual(['SimSun'])
  })

  it('常用名单里的字体标「常用」，其余本机字体标「本机」', () => {
    expect(fontOptionHint('SimSun')).toBe('常用')
    expect(fontOptionHint('Zapf', 'browser')).toBe('本机')
    expect(fontOptionHint('Zapf', 'desktop')).toBe('本机')
  })

  it('退回常用清单时不会把不认识的字体说成本机字体', () => {
    expect(fontOptionHint('Zapf', 'curated')).toBe('常用')
  })

})

describe('字体中文名', () => {
  const catalog: FontCatalog = {
    families: ['SimSun', 'SimHei', 'Arial'],
    source: 'desktop',
    note: '',
    systemCount: 3,
    aliases: { SimSun: '宋体', SimHei: '黑体' },
  }

  it('有中文名显示中文名，没有就显示家族名', () => {
    expect(fontLabel('SimSun', catalog.aliases)).toBe('宋体')
    expect(fontLabel('Arial', catalog.aliases)).toBe('Arial')
    expect(fontLabel('', catalog.aliases)).toBe('')
  })

  it('敲中文名或家族名都认，写进样式的始终是家族名', () => {
    expect(resolveFontInput('宋体', catalog)).toBe('SimSun')
    expect(resolveFontInput('SimSun', catalog)).toBe('SimSun')
    expect(resolveFontInput('  黑体 ', catalog)).toBe('SimHei')
    // 没见过的名字（例如注册表里登记成中文的第三方字体）原样收下
    expect(resolveFontInput('方正舒体', catalog)).toBe('方正舒体')
    expect(resolveFontInput('   ', catalog)).toBe('')
  })

  it('候选用中文名做标签、家族名做值，两个名字都能搜到', () => {
    const options = fontOptions(catalog)
    expect(options[0]).toMatchObject({ value: 'SimSun', label: '宋体', hint: '常用' })
    expect(options[0]?.keywords).toContain('SimSun')
    expect(options[0]?.keywords).toContain('宋体')
  })

  it('排序按屏幕上显示的名字来，而不是隐藏的家族名', () => {
    const merged = mergeFamilies([], ['Bfont', 'Afont'], (family) => (family === 'Afont' ? 'Zlabel' : 'Alabel'))
    expect(merged).toEqual(['Bfont', 'Afont'])
  })

})
