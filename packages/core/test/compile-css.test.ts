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

  it('悬挂缩进编译成「段落整体左移 + 首行负缩进」', () => {
    const custom = structuredClone(tech)
    custom.styles.push({ role: 'reference.item', paragraph: { hangingIndentChars: 2 } })
    const css = compileCss(resolveStyles(custom))
    expect(css).toContain('[data-role="reference-item"]')
    expect(css).toContain('text-indent: -2em;')
    expect(css).toContain('padding-inline-start: 2em;')
  })

  it('悬挂缩进与左缩进叠加时用 calc 相加', () => {
    const custom = structuredClone(tech)
    custom.styles.push({ role: 'reference.item', paragraph: { hangingIndentChars: 2, indentLeftPt: 12 } })
    const css = compileCss(resolveStyles(custom))
    expect(css).toContain('text-indent: -2em;')
    expect(css).toContain('padding-inline-start: calc(12pt + 2em);')
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

  it('标题自动编号覆盖 1–6 级，父标题把更深的层级清零', () => {
    const custom = structuredClone(tech)
    custom.styles.push({
      role: 'heading.4',
      basedOn: 'body.text',
      numbering: { enabled: true, pattern: '（{n}）', gapPt: 2 },
    })
    const css = compileCss(resolveStyles(custom))
    expect(css).toContain(
      'counter-reset: stylemd-heading-1 stylemd-heading-2 stylemd-heading-3 stylemd-heading-4 stylemd-heading-5 stylemd-heading-6;',
    )
    expect(css).toContain('[data-role="heading-3"] { counter-reset: stylemd-heading-4 stylemd-heading-5 stylemd-heading-6; }')
    expect(css).toContain('[data-role="heading-5"] { counter-reset: stylemd-heading-6; }')
    expect(css).toMatch(/\[data-role="heading-4"\] \{[\s\S]*?counter-increment: stylemd-heading-4;/)
    expect(css).toContain('counter(stylemd-heading-4)')
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

  it('表格版式：宽度模式、最小尺寸、整体对齐、分布列', () => {
    const custom = structuredClone(tech)
    custom.document.table = {
      widthMode: 'full',
      minWidthPercent: 40,
      minHeightPt: 30,
      align: 'center',
      distributeColumns: true,
    }
    const block = compileCss(resolveStyles(custom)).match(/table\[data-role="table"\] \{[^}]*\}/)?.[0] ?? ''
    expect(block).toContain('width: 100%;')
    expect(block).toContain('min-width: 40%;')
    expect(block).toContain('height: 30pt;')
    expect(block).toContain('margin-inline: auto;')
    expect(block).toContain('table-layout: fixed;')
    // 默认（没写 document.table）只有基座那两条，别把宽度写死
    const base = compileCss(resolveStyles(tech)).match(/table\[data-role="table"\] \{[^}]*\}/)?.[0] ?? ''
    expect(base).toContain('border-collapse: collapse;')
    expect(base).toContain('max-width: 100%;')
    expect(base).not.toMatch(/\n {2}width:/)
    expect(base).not.toContain('table-layout')
  })

  it('表格宽度可以按百分比固定，右对齐时左外边距自动撑开', () => {
    const custom = structuredClone(tech)
    custom.document.table = { widthMode: 'full', widthPercent: 72, align: 'right' }
    const block = compileCss(resolveStyles(custom)).match(/table\[data-role="table"\] \{[^}]*\}/)?.[0] ?? ''
    expect(block).toContain('width: 72%;')
    expect(block).not.toMatch(/\n {2}width: 100%;/)
    expect(block).toContain('margin-inline-start: auto;')
  })

  it('单元格垂直对齐：默认 top 不写声明，改成 middle 才写', () => {
    const custom = structuredClone(tech)
    // 只认角色块（行首的 `[data-role="table-header"] {`）：格线块里的表头选择器也带这个属性。
    const headerBlock = (theme: typeof custom) =>
      compileCss(resolveStyles(theme)).match(/(?:^|\n)\[data-role="table-header"\] \{[\s\S]*?\n\}/)?.[0] ?? ''
    // 默认的 top 由基座规则兜住，角色块里不该出现这条声明
    expect(headerBlock(custom)).not.toContain('vertical-align')
    custom.styles.find((style) => style.role === 'table.header')!.paragraph = { verticalAlign: 'middle' }
    expect(headerBlock(custom)).toContain('vertical-align: middle;')
  })

  it('表格格线：单元格只画右边与下边，最后一列 / 最后一行交给外框', () => {
    const custom = structuredClone(tech)
    custom.styles.find((style) => style.role === 'table')!.grid = {
      horizontal: { style: 'dashed', widthPt: 1, color: '#111111' },
      vertical: { style: 'dotted', widthPt: 0.5, color: '#222222' },
    }
    const css = compileCss(resolveStyles(custom))
    const cellRule = css.match(/table\[data-role="table"\] th, table\[data-role="table"\] td \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(cellRule).toContain('border-right: 0.5pt dotted #222222;')
    expect(cellRule).toContain('border-bottom: 1pt dashed #111111;')
    expect(cellRule).not.toContain('border-top')
    expect(cellRule).not.toContain('border-left')
    expect(css).toContain('table[data-role="table"] th:last-child, table[data-role="table"] td:last-child { border-right: none; }')
    expect(css).toContain(
      'table[data-role="table"] > tbody > tr:last-child > *:not([data-role="table-header"]) { border-bottom: none; }',
    )
  })

  it('表格格线：表头下线来自表头角色，单元格角色自己不再输出四边', () => {
    const css = compileCss(resolveStyles(thesis))
    // 三线表预设的表头底线（0.75pt）现在由格线块画在表头单元格的下边
    expect(css).toMatch(/table\[data-role="table"\] \[data-role="table-header"\] \{\n  border-bottom: 0\.75pt solid #000000;/)
    const cellRoleBlock = css.match(/(?:^|\n)\[data-role="table-cell"\] \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(cellRoleBlock).not.toContain('border')
    expect(cellRoleBlock).toContain('padding: 4pt;')
  })

  it('旧样式包把格线写在单元格四边上时，右边框当竖线、下边框当横线', () => {
    const legacy = structuredClone(tech)
    legacy.styles.find((style) => style.role === 'table.cell')!.border = {
      top: { style: 'solid', widthPt: 1, color: '#333333' },
      right: { style: 'solid', widthPt: 1, color: '#333333' },
      bottom: { style: 'solid', widthPt: 1, color: '#333333' },
      left: { style: 'solid', widthPt: 1, color: '#333333' },
    }
    const cellRule = compileCss(resolveStyles(legacy)).match(
      /table\[data-role="table"\] th, table\[data-role="table"\] td \{[\s\S]*?\n\}/,
    )?.[0] ?? ''
    expect(cellRule).toContain('border-right: 1pt solid #333333;')
    expect(cellRule).toContain('border-bottom: 1pt solid #333333;')
  })
})
