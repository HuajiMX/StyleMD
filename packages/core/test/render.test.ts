import { describe, expect, it } from 'vitest'
import { build, parseMarkdown, renderBody } from '@stylemd/core'
import { getBuiltInTheme } from '@stylemd/presets'

const theme = getBuiltInTheme('tech-document')!

describe('renderBody', () => {
  it('给每个块级元素打上 data-role', () => {
    const { tree } = parseMarkdown('# 标题\n\n正文\n\n- 项目一\n- 项目二')
    const { html } = renderBody(tree)
    expect(html).toContain('<h1 data-role="heading-1"')
    expect(html).toContain('<p data-role="body-text">')
    expect(html).toContain('<ul data-role="list-unordered">')
    expect(html).toContain('<li data-role="list-item">')
  })

  it('表格输出 thead/tbody 并区分表头与单元格', () => {
    const { tree } = parseMarkdown('| 列 | 值 |\n|:---|:---|\n| 甲 | 1 |')
    const { html } = renderBody(tree)
    expect(html).toContain('<table data-role="table">')
    expect(html).toContain('<thead>')
    expect(html).toContain('<th data-role="table-header"')
    expect(html).toContain('<td data-role="table-cell"')
  })

  it('默认转义原始 HTML，避免注入', () => {
    const { tree } = parseMarkdown('<script>alert(1)</script>\n\n正文')
    const { html, warnings } = renderBody(tree)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(warnings.join()).toContain('原始 HTML')
  })

  it('显式开启后才直出原始 HTML', () => {
    const { tree } = parseMarkdown('<div class="x">内容</div>')
    const { html } = renderBody(tree, { allowRawHtml: true })
    expect(html).toContain('<div class="x">内容</div>')
  })

  it('代码块保留原文并带上语言信息', () => {
    const { tree } = parseMarkdown('```ts\nconst a = 1 < 2\n```')
    const { html } = renderBody(tree)
    expect(html).toContain('data-language="ts"')
    expect(html).toContain('const a = 1 &lt; 2')
  })

  it('标题自带编号时关闭自动编号，避免重复', () => {
    const { tree } = parseMarkdown('# 第一章 绪论\n\n## 关键判断')
    const { html } = renderBody(tree)
    expect(html).toContain('data-role="heading-1" data-numbering="off"')
    expect(html).toContain('<h2 data-role="heading-2" id=')
  })
})

describe('build', () => {
  it('产出自带样式的完整 HTML 文档', () => {
    const result = build('# 标题\n\n正文段落', theme)
    expect(result.html).toContain('<!doctype html>')
    expect(result.html).toContain('<style>')
    expect(result.html).toContain('[data-role="heading-1"]')
    expect(result.html).toContain('data-role="body-text"')
  })

  it('把 frontmatter 的 title 用在页眉域上', () => {
    const result = build('---\ntitle: 我的文档\n---\n\n正文', theme)
    expect(result.frontmatter.title).toBe('我的文档')
    expect(result.css).toContain('"我的文档"')
  })

  it('同一输入两次构建结果完全一致（确定性输出）', () => {
    const first = build('# 标题\n\n正文', theme)
    const second = build('# 标题\n\n正文', theme)
    expect(first.html).toBe(second.html)
    expect(first.css).toBe(second.css)
  })
})
