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

  it('中西文两个槽相同时走普通回退链，不生成 @font-face', () => {
    const css = compileCss(resolveStyles(tech))
    expect(css).not.toContain('@font-face')
    expect(css).toContain('font-family: "Source Han Sans SC"')
  })

  it('两个槽不同时生成一对带 unicode-range 的 @font-face 并按区段分派', () => {
    const custom = structuredClone(tech)
    custom.document.defaults.latinFamily = 'Arial'
    custom.document.defaults.cjkFamily = 'SimSun'
    const css = compileCss(resolveStyles(custom))
    expect(css).toContain('@font-face')
    expect(css).toContain('src: local("Arial")')
    expect(css).toContain('src: local("SimSun")')
    expect(css).toContain('unicode-range: U+0000-024F')
    expect(css).toContain('unicode-range: U+2014, U+2026')
    // 生成的家族名要排在 body 的回退链最前面
    expect(css).toContain('font-family: "stylemd-font-body"')
    // @font-face 必须在使用它的规则之前
    expect(css.indexOf('@font-face')).toBeLessThan(css.indexOf('font-family: "stylemd-font-body"'))
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

  it('表头禁止单独留在上一页页脚', () => {
    const css = compileCss(resolveStyles(thesis))
    expect(css).toContain('table[data-role="table"] thead { break-after: avoid; }')
  })

  it('页面内容宽度暴露成 CSS 变量（分页层要在分页前按它定列宽）', () => {
    const css = compileCss(resolveStyles(thesis))
    expect(css).toContain('--stylemd-page-content-width: calc(210mm - 30mm - 25mm);')
  })

  it('页眉页脚：距页面边缘的距离写进边距盒', () => {
    const css = compileCss(resolveStyles(thesis), { title: 'x' })
    const topCenter = css.match(/@top-center \{[^}]*\}/)?.[0] ?? ''
    const bottomCenter = css.match(/@bottom-center \{[^}]*\}/)?.[0] ?? ''
    expect(topCenter).toContain('padding-top: 12mm;')
    expect(topCenter).toContain('align-items: flex-start;')
    expect(bottomCenter).toContain('padding-bottom: 12mm;')
    expect(bottomCenter).toContain('align-items: flex-end;')
  })

  it('页眉横线挂在页眉段落（page.header 角色）上，不画在边距盒容器上', () => {
    const css = compileCss(resolveStyles(thesis), { title: 'x' })
    const topCenter = css.match(/@top-center \{[^}]*\}/)?.[0] ?? ''
    expect(topCenter).not.toContain('border-bottom')
    expect(css).toMatch(/\[data-role="page-header"\] \{[^}]*border-bottom: 0\.5pt solid #999999;/)
  })

  it('旧样式包把横线写在 furniture.borderBottom 上也照样落到页眉段落上', () => {
    const legacy = structuredClone(thesis)
    legacy.document.page.header = { center: 'x', borderBottom: { style: 'solid', widthPt: 1, color: '#123456' } }
    const css = compileCss(resolveStyles(legacy))
    expect(css).toContain('[data-role="page-header"] {\n  border-bottom: 1pt solid #123456;\n}')
  })
})
