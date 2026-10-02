import { describe, expect, it } from 'vitest'
import { getBuiltInTheme } from '@stylemd/presets'
import { resolveStyles } from '@stylemd/core'

const theme = getBuiltInTheme('tech-document')!

describe('resolveStyles', () => {
  it('叶子样式继承链根部的属性', () => {
    const computed = resolveStyles(theme)
    // heading.1 只声明了 font.sizePt，字体族应当来自文档默认值
    expect(computed.roles['heading.1']!.font.family).toEqual(theme.document.defaults.fontFamily)
    expect(computed.roles['heading.1']!.font.sizePt).toBe(20)
  })

  it('基于正文的样式会继承正文的段落设置', () => {
    const computed = resolveStyles(theme)
    expect(computed.roles['heading.2']!.paragraph.spaceAfterPt).toBe(8)
  })

  it('显式属性覆盖继承值', () => {
    const custom = structuredClone(theme)
    custom.styles.push({ role: 'heading.5', basedOn: 'body.text', font: { sizePt: 13 } })
    const computed = resolveStyles(custom)
    expect(computed.roles['heading.5']!.font.sizePt).toBe(13)
    expect(computed.roles['heading.5']!.paragraph.spaceAfterPt).toBe(8)
  })

  it('未定义的属性回落到文档默认值', () => {
    const computed = resolveStyles(theme)
    expect(computed.roles['divider']!.font.sizePt).toBe(theme.document.defaults.fontSizePt)
    expect(computed.roles['divider']!.paragraph.align).toBe('left')
  })

  it('返回从自身到根的继承链', () => {
    const computed = resolveStyles(theme)
    expect(computed.roles['heading.1']!.inheritanceChain).toEqual(['heading.1', 'body.text'])
    expect(computed.roles['body.text']!.inheritanceChain).toEqual(['body.text'])
  })

  it('注册表里没有的角色也能解析（向前兼容）', () => {
    const custom = structuredClone(theme)
    custom.styles.push({ role: 'future.role', font: { sizePt: 9 } })
    const computed = resolveStyles(custom)
    expect(computed.roles['future.role']?.font.sizePt).toBe(9)
  })
})
