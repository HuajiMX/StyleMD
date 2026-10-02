import { describe, expect, it } from 'vitest'
import { compileCss, resolveStyles } from '@stylemd/core'
import { getBuiltInTheme } from '@stylemd/presets'

const thesis = getBuiltInTheme('thesis-cn')!
const tech = getBuiltInTheme('tech-document')!

describe('compileCss', () => {
  it('输出 @page 的纸张与页边距', () => {
    const css = compileCss(resolveStyles(thesis), { title: '测试文档' })
    expect(css).toContain('@page {')
    expect(css).toContain('size: 210mm 297mm;')
    expect(css).toContain('margin: 30mm 25mm 25mm 30mm;')
  })

  it('把页眉页脚的域编译成 CSS 计数器', () => {
    const css = compileCss(resolveStyles(thesis), { title: '测试文档' })
    expect(css).toContain('counter(page)')
    expect(css).toContain('"测试文档"')
  })

  it('首页页眉页脚可单独关闭', () => {
    const css = compileCss(resolveStyles(thesis), { title: 'x' })
    expect(css).toContain('@page :first')
    expect(css).toContain('content: none;')
  })

  it('角色样式编译成 data-role 选择器', () => {
    const css = compileCss(resolveStyles(tech))
    expect(css).toContain('[data-role="heading-1"]')
    expect(css).toContain('font-size: 20pt;')
    expect(css).toContain('border-bottom: 1pt solid #d0d7de;')
  })

  it('首行缩进按字符换算成 em，随字号缩放', () => {
    const css = compileCss(resolveStyles(thesis))
    expect(css).toContain('text-indent: 2em;')
  })

  it('固定行距输出 pt，倍数行距输出数字', () => {
    const thesisCss = compileCss(resolveStyles(thesis))
    expect(thesisCss).toContain('line-height: 22pt;')
    const techCss = compileCss(resolveStyles(tech))
    expect(techCss).toContain('line-height: 1.6;')
  })

  it('标题自动编号编译成 CSS 计数器', () => {
    const css = compileCss(resolveStyles(thesis))
    expect(css).toContain('counter-increment: stylemd-heading-1;')
    expect(css).toContain('counter(stylemd-heading-1)')
    expect(css).toContain('"第"')
    expect(css).toContain('"章"')
    expect(css).toContain(':not([data-numbering="off"])::before')
  })

  it('三线表：只有上下框线加表头底线', () => {
    const css = compileCss(resolveStyles(thesis))
    expect(css).toContain('[data-role="table"] {')
    expect(css).toContain('border-top: 1.5pt solid #000000;')
    expect(css).toContain('border-bottom: 1.5pt solid #000000;')
    expect(css).not.toContain('[data-role="table-cell"] {\n  border-left')
  })

  it('includePage=false 时不输出 @page', () => {
    const css = compileCss(resolveStyles(tech), { includePage: false })
    expect(css).not.toContain('@page {')
  })
})
