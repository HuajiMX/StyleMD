import { describe, expect, it } from 'vitest'
import { getBuiltInTheme } from '@stylemd/presets'
import { PARAGRAPH_CONVENTION_FIELDS } from '@stylemd/theme-schema'
import { resolveStyles } from '@stylemd/core'

const theme = getBuiltInTheme('tech-document')!

/** 取角色的显式样式（找不到就报错，省得测试里到处写非空断言）。 */
function styleOf(target: typeof theme, role: string) {
  const style = target.styles.find((entry) => entry.role === role)
  if (!style) throw new Error(`样式包里没有 ${role}`)
  return style
}

describe('resolveStyles', () => {
  it('叶子样式继承链根部的属性', () => {
    const computed = resolveStyles(theme)
    // heading.1 只声明了 font.sizePt，字体槽应当来自文档默认值
    expect(computed.roles['heading.1']!.font.cjkFamily).toBe(theme.document.defaults.cjkFamily)
    expect(computed.roles['heading.1']!.font.fallbackFamilies).toEqual(theme.document.defaults.fallbackFamilies)
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

  it('版式约定不随 basedOn 传下去，家族属性照旧继承', () => {
    const custom = structuredClone(theme)
    const body = styleOf(custom, 'body.text')
    body.paragraph = {
      ...body.paragraph,
      align: 'justify',
      firstLineIndentChars: 2,
      indentLeftPt: 12,
      lineHeight: { mode: 'fixed' as const, value: 20 },
    }
    const computed = resolveStyles(custom)
    const heading = computed.roles['heading.2']!.paragraph
    // 约定：标题自己没声明，就用默认（左对齐、不缩进），不会跟着正文一起被推开
    expect(heading.align).toBe('left')
    expect(heading.firstLineIndentChars).toBe(0)
    expect(heading.indentLeftPt).toBe(0)
    // 家族属性：照旧从正文继承（heading.2 自己没声明行距）
    expect(heading.lineHeight).toEqual({ mode: 'fixed', value: 20 })
    // 自己声明过的家族属性仍然是自己的
    expect(heading.spaceAfterPt).toBe(8)
    expect(computed.roles['heading.2']!.font.sizePt).toBe(16)
  })

  it('角色自己声明的约定字段仍然生效', () => {
    const custom = structuredClone(theme)
    styleOf(custom, 'body.text').paragraph = { ...styleOf(custom, 'body.text').paragraph, firstLineIndentChars: 2 }
    custom.styles.push({ role: 'heading.3', basedOn: 'body.text', paragraph: { align: 'center', indentLeftPt: 6 } })
    const computed = resolveStyles(custom)
    expect(computed.roles['heading.3']!.paragraph).toMatchObject({
      align: 'center',
      firstLineIndentChars: 0,
      indentLeftPt: 6,
    })
  })

  it('约定字段清单里的每一项都不参与继承', () => {
    // 这条是"清单即规格"的守卫：往 PARAGRAPH_CONVENTION_FIELDS 里加字段、却忘了在 mergeRoleStyle 里
    // 接上，就会在这里露出来。
    const custom = structuredClone(theme)
    styleOf(custom, 'body.text').paragraph = {
      ...styleOf(custom, 'body.text').paragraph,
      align: 'justify',
      firstLineIndentChars: 2,
      indentLeftPt: 12,
      indentRightPt: 8,
    }
    custom.styles = custom.styles.filter((style) => style.role !== 'heading.2')
    custom.styles.push({ role: 'heading.2', basedOn: 'body.text', font: { sizePt: 16 } })
    const computed = resolveStyles(custom)
    for (const field of PARAGRAPH_CONVENTION_FIELDS) {
      expect(computed.roles['heading.2']!.paragraph[field], `${field} 不该继承`).toBe(field === 'align' ? 'left' : 0)
    }
  })

  it('角色注册表里的兜底不受影响（行间公式仍然居中）', () => {
    const computed = resolveStyles(theme)
    expect(computed.roles['math.block']!.paragraph.align).toBe('center')
  })
})
