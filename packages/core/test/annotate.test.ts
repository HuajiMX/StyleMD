import { describe, expect, it } from 'vitest'
import { annotateRoles, parseMarkdown } from '@stylemd/core'
import type { AnyNode } from '@stylemd/core'

function rolesOf(source: string): string[] {
  const { tree } = parseMarkdown(source)
  const { tree: annotated } = annotateRoles(tree)
  const found: string[] = []
  const visit = (node: unknown) => {
    const typed = node as AnyNode
    if (typed.data?.role) found.push(typed.data.role)
    for (const child of typed.children ?? []) visit(child)
  }
  visit(annotated)
  return found
}

describe('annotateRoles', () => {
  it('把标题按层级映射到角色', () => {
    const roles = rolesOf('# 一级\n\n## 二级\n\n### 三级')
    expect(roles).toContain('heading.1')
    expect(roles).toContain('heading.2')
    expect(roles).toContain('heading.3')
  })

  it('区分有序与无序列表，并标注列表项', () => {
    const roles = rolesOf('- 甲\n- 乙\n\n1. 一\n2. 二')
    expect(roles).toContain('list.unordered')
    expect(roles).toContain('list.ordered')
    expect(roles).toContain('list.item')
  })

  it('表格与其单元格分别角色化', () => {
    const roles = rolesOf('| 列 | 值 |\n|:---|:---|\n| 甲 | 1 |')
    expect(roles).toContain('table')
  })

  it('识别代码块、引用、分割线', () => {
    const roles = rolesOf('```ts\nconst a = 1\n```\n\n> 引用\n\n---')
    expect(roles).toContain('code.block')
    expect(roles).toContain('blockquote')
    expect(roles).toContain('divider')
  })

  it('图片后的段落被识别为图题', () => {
    const roles = rolesOf('![架构图](a.png)\n\n图 1-1 系统架构')
    expect(roles).toContain('image')
    expect(roles).toContain('figure.caption')
  })

  it('「表 1-1」开头的段落被识别为表题', () => {
    const roles = rolesOf('表 1-1 参数对照\n\n| a | b |\n|---|---|\n| 1 | 2 |')
    expect(roles).toContain('table.caption')
  })

  it('参考文献小节之后的条目被识别为参考文献', () => {
    const roles = rolesOf('## 参考文献\n\n[1] 某某. 书名[M]. 2024.')
    expect(roles).toContain('reference.item')
    // 正文小节开始时应当退出参考文献状态
    const roles2 = rolesOf('## 参考文献\n\n[1] 条目\n\n## 致谢\n\n感谢所有帮助过我的人。')
    expect(roles2.filter((role) => role === 'reference.item')).toHaveLength(1)
    expect(roles2).toContain('body.text')
  })

  it('容器指令映射到对应角色，并作用于内部段落', () => {
    const roles = rolesOf('::: abstract\n这里是一段摘要。\n:::\n\n::: keywords\n关键词：甲；乙\n:::')
    expect(roles).toContain('abstract')
    expect(roles).toContain('keywords')
  })

  it('容器指令允许冒号后带空格（::: name）', () => {
    expect(rolesOf(':::abstract\n摘要内容\n:::')).toContain('abstract')
    expect(rolesOf('::: keywords\n关键词\n:::')).toContain('keywords')
  })

  it('关闭启发式识别后，图题回落为正文', () => {
    const { tree } = parseMarkdown('![图](a.png)\n\n图 1-1 说明文字')
    const { stats } = annotateRoles(tree, { autoDetect: false })
    expect(stats.counts['figure.caption']).toBeUndefined()
    expect(stats.counts['body.text']).toBeGreaterThan(0)
  })

  it('每段内容的角色都会计入统计，便于界面展示', () => {
    const { tree } = parseMarkdown('# 标题\n\n正文段落')
    const { stats } = annotateRoles(tree)
    expect(stats.counts['heading.1']).toBe(1)
    expect(stats.counts['body.text']).toBe(1)
  })
})
