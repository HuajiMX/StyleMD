import { describe, expect, it } from 'vitest'
import { locateRole } from '@stylemd/core'

/**
 * 用 ‸ 标出光标位置，省得在用例里手算偏移——手算的偏移一旦写错，
 * 测试失败会指向错误的原因。
 */
function roleAtCaret(template: string, options?: { autoDetect?: boolean }): string | undefined {
  const caret = template.indexOf('‸')
  if (caret < 0) throw new Error('用例里缺少光标标记 ‸')
  const source = template.slice(0, caret) + template.slice(caret + 1)
  return locateRole(source, caret, options)
}

describe('locateRole', () => {
  it('光标在标题行上时定位到对应层级的标题', () => {
    expect(roleAtCaret('# 绪论‸\n\n正文段落')).toBe('heading.1')
    expect(roleAtCaret('## 研究‸背景\n\n正文段落')).toBe('heading.2')
  })

  it('光标在普通段落里时定位到正文段落', () => {
    expect(roleAtCaret('# 绪论\n\n这是一段‸正文。')).toBe('body.text')
  })

  it('行内结构比所在段落更深，优先命中行内角色', () => {
    expect(roleAtCaret('正文里的 **加粗‸文字** 结尾')).toBe('inline.strong')
    expect(roleAtCaret('正文里的 `code‸()` 结尾')).toBe('code.inline')
  })

  it('列表项的兜底正文段落不会盖住列表结构', () => {
    expect(roleAtCaret('- 第一‸项\n- 第二项')).toBe('list.item')
    expect(roleAtCaret('1. 有序‸项')).toBe('list.item')
  })

  it('引用块与代码块各自定位到自己', () => {
    expect(roleAtCaret('> 被引‸用的一句话')).toBe('blockquote')
    expect(roleAtCaret('```ts\nconst a‸ = 1\n```')).toBe('code.block')
  })

  it('容器指令内部的段落定位到容器角色', () => {
    expect(roleAtCaret('::: abstract\n摘‸要内容\n:::')).toBe('abstract')
  })

  it('段落之间的空行不会让后面的段落错位', () => {
    expect(roleAtCaret('# 一\n\n第一段\n\n第二段\n\n第三‸段')).toBe('body.text')
  })

  it('前置元数据里的光标没有对应结构', () => {
    expect(roleAtCaret('---\ntit‸le: 示例\n---\n\n# 标题')).toBeUndefined()
  })

  it('关闭启发式识别后，图题回到普通正文', () => {
    const template = '![架构图](a.png)\n\n图 1-1 系‸统架构'
    expect(roleAtCaret(template)).toBe('figure.caption')
    expect(roleAtCaret(template, { autoDetect: false })).toBe('body.text')
  })
})
