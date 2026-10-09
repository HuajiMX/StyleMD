import {
  PAGE_SIZES_MM,
  cssRoleName,
  isInlineRole,
  type BorderSide,
  type ComputedRoleStyle,
  type ComputedStyles,
  type ComputedTableLayout,
  type PageFurniture,
} from '@stylemd/theme-schema'
import { escapeCssString, planFontFamily } from './font-faces'

export interface CompileCssOptions {
  /** 页眉页脚域里 {title} 的替换值。 */
  title?: string
  /** 只输出角色样式，不输出 @page（用于嵌入到已有页面时）。 */
  includePage?: boolean
  /** 页眉页脚替换成实际内容的日期，缺省用今天。 */
  date?: string
}

function pt(value: number): string {
  return `${round(value)}pt`
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'emoji', 'math', 'fangsong'])
function fontStack(families: string[]): string {
  return families.map((family) => GENERIC_FAMILIES.has(family) ? family : `"${escapeCssString(family)}"`).join(', ')
}

interface FontSlots {
  latinFamily: string
  cjkFamily: string
  fallbackFamilies: string[]
}

/**
 * 两个槽不同时，用一对 `@font-face` 按字符区段分派（见 font-faces.ts）；
 * 相同时（含「西文跟随中文字体」）直接给回退链——输出更小，行为与旧版逐字一致。
 */
function fontFamilyDeclaration(slots: FontSlots, faceName: string, faces: string[]): string | null {
  const plan = planFontFamily(slots, faceName)
  faces.push(...plan.faces)
  return plan.families.length > 0 ? `font-family: ${fontStack(plan.families)};` : null
}

function borderDeclaration(side: 'top' | 'right' | 'bottom' | 'left', border: BorderSide | undefined): string[] {
  if (!border || border.style === 'none') {
    return border ? [`border-${side}: none;`] : []
  }
  const width = border.widthPt ?? 1
  const style = border.style ?? 'solid'
  const color = border.color ?? '#000000'
  return [`border-${side}: ${pt(width)} ${style} ${color};`]
}

/** 一个方向是不是画得出线（`none` 与没写都算不画）。 */
function drawsLine(side: BorderSide | undefined): boolean {
  return Boolean(side?.style && side.style !== 'none')
}

export interface TableGridLines {
  /** 内部横线：相邻两行共用的一条。 */
  horizontal: BorderSide | undefined
  /** 内部竖线：相邻两列共用的一条。 */
  vertical: BorderSide | undefined
  /** 表头下面那条线（表头行与第一行数据共用）。 */
  headerBottom: BorderSide | undefined
}

/**
 * 表格格线的唯一读法：先看 `table` 角色的 `grid`，没有再回落到旧样式包写在单元格四边上的值
 * （`table.cell` 的右边框当内部竖线、下边框当内部横线；左 / 上两条由邻居的线代表）。
 * 编译器与宿主 UI 都走这里，别在两处各读一遍。
 */
export function tableGridOf(styles: ComputedStyles): TableGridLines {
  const grid = styles.roles['table']?.grid ?? {}
  const cell = styles.roles['table.cell']?.border
  const header = styles.roles['table.header']?.border
  const horizontal = grid.horizontal ?? (drawsLine(cell?.bottom) ? cell?.bottom : undefined)
  const vertical = grid.vertical ?? (drawsLine(cell?.right) ? cell?.right : undefined)
  return {
    horizontal,
    vertical,
    headerBottom: drawsLine(header?.bottom) ? header?.bottom : horizontal,
  }
}

/**
 * 表格的格线块。
 *
 * 普通结构的边框是四条各自独立的边，一个个盒子各画各的；表格单元格是紧密堆积的，相邻单元格
 * **共用**一条边——左边单元格的右边框和右边单元格的左边框在视觉上是同一条线，散着写就会在
 * 折叠边框模型里按"样式优先级 → 比粗细"打架，「给某一条边单独设个虚线」根本落不了地。
 * 所以这里让每个单元格只画自己的右边和下边，最后一行 / 最后一列不画（那两条交给外框），
 * 每条共用边只声明一次：竖线、横线、表头线各是一套样式，互不干扰。
 */
function tableGridBlock(lines: TableGridLines): string {
  const cells = 'table[data-role="table"] th, table[data-role="table"] td'
  // 选择器要逐个写全：`${cells}:last-child` 只会把伪类接到最后一个选择器上（th 就漏了）
  const lastCells = 'table[data-role="table"] th:last-child, table[data-role="table"] td:last-child'
  const grid = [
    borderDeclaration('right', lines.vertical).join(' ') || 'border-right: none;',
    borderDeclaration('bottom', lines.horizontal).join(' ') || 'border-bottom: none;',
  ]
  const header = borderDeclaration('bottom', lines.headerBottom).join(' ') || 'border-bottom: none;'
  return [
    `${cells} {\n  ${grid.join('\n  ')}\n}`,
    // 最后一列 / 最后一行不画格线：它们的外侧就是外框，画了会和框线叠成两条
    `${lastCells} { border-right: none; }`,
    'table[data-role="table"] > tbody > tr:last-child > *:not([data-role="table-header"]) { border-bottom: none; }',
    // 表头下面那条线：认 data-role（关掉跨页重复标题行时首行落在 tbody 里，照样要画）
    `table[data-role="table"] [data-role="table-header"] {\n  ${header}\n}`,
  ].join('\n')
}

function fontDeclarations(style: ComputedRoleStyle, faceName: string, faces: string[]): string[] {
  const out: string[] = []
  const declaredFamily = fontFamilyDeclaration(style.font, faceName, faces)
  if (declaredFamily) out.push(declaredFamily)
  out.push(`font-size: ${pt(style.font.sizePt)};`)
  out.push(`font-weight: ${style.font.weight};`)
  out.push(`font-style: ${style.font.italic ? 'italic' : 'normal'};`)
  out.push(`text-decoration: ${style.font.underline ? 'underline' : 'none'};`)
  if (style.font.color) out.push(`color: ${style.font.color};`)
  out.push(`letter-spacing: ${pt(style.font.letterSpacingPt)};`)
  return out
}

function paragraphDeclarations(style: ComputedRoleStyle, counterName?: string): string[] {
  const out: string[] = []
  const paragraph = style.paragraph
  out.push(`text-align: ${paragraph.align};`)
  out.push(
    `line-height: ${paragraph.lineHeight.mode === 'fixed' ? pt(paragraph.lineHeight.value) : paragraph.lineHeight.value};`,
  )
  out.push(`margin-block-start: ${pt(paragraph.spaceBeforePt)};`)
  out.push(`margin-block-end: ${pt(paragraph.spaceAfterPt)};`)
  out.push(...indentDeclarations(paragraph))
  if (paragraph.indentRightPt) out.push(`padding-inline-end: ${pt(paragraph.indentRightPt)};`)
  if (paragraph.keepWithNext) out.push('break-after: avoid;')
  if (paragraph.pageBreakBefore) out.push('break-before: page;')
  if (paragraph.widows) out.push(`widows: ${paragraph.widows};`)
  if (paragraph.orphans) out.push(`orphans: ${paragraph.orphans};`)
  // 单元格垂直对齐：默认的 top 由基座规则兜住（见 tableLayoutBlock），换了值才写声明。
  if (paragraph.verticalAlign !== 'top') out.push(`vertical-align: ${paragraph.verticalAlign};`)
  if (counterNameish(counterName)) out.push(`counter-increment: ${counterName};`)
  return out
}

/**
 * 表格这个盒子自己的版式：宽度模式、最小尺寸、整体对齐、分布列。
 *
 * 宽度一律相对纸张内容区。整体对齐靠 auto 外边距：`width: auto` 的表格是 shrink-to-fit 的，
 * 左右外边距吃到 auto 就能把它推到中间或右边——不能靠 `text-align`，那是给单元格内容用的。
 */
function tableLayoutBlock(table: ComputedTableLayout): string {
  const lines = ['border-collapse: collapse;', 'max-width: 100%;']
  if (typeof table.widthPercent === 'number') lines.push(`width: ${round(table.widthPercent)}%;`)
  else if (table.widthMode === 'full') lines.push('width: 100%;')
  if (table.minWidthPercent > 0) lines.push(`min-width: ${round(table.minWidthPercent)}%;`)
  if (table.minHeightPt > 0) lines.push(`height: ${pt(table.minHeightPt)};`)
  if (table.align === 'center') lines.push('margin-inline: auto;')
  else if (table.align === 'right') lines.push('margin-inline-start: auto;', 'margin-inline-end: 0;')
  // 分布列：定列宽 + 各列等宽（等宽由渲染器给每个单元格的宽度决定，见 html.ts）
  if (table.distributeColumns) lines.push('table-layout: fixed;')
  return `table[data-role="table"] {\n  ${lines.join('\n  ')}\n}`
}

/**
 * 首行缩进 / 悬挂缩进的落法。
 *  - 首行缩进 N 字符：`text-indent: Nem`，段落左边界不动。
 *  - 悬挂缩进 N 字符：段落整体右移 N 字符（`padding-inline-start` 加上 Nem），首行再用负的
 *    `text-indent` 拉回内容左边界——首行顶格、其余行缩进 N 字符，参考文献条目就是这个样子。
 * 两者互斥（`validate` 会拦），真同时出现时按悬挂处理。
 */
function indentDeclarations(paragraph: ComputedRoleStyle['paragraph']): string[] {
  const hanging = round(paragraph.hangingIndentChars)
  if (hanging > 0) {
    const left = paragraph.indentLeftPt
      ? `calc(${pt(paragraph.indentLeftPt)} + ${hanging}em)`
      : `${hanging}em`
    return [`text-indent: -${hanging}em;`, `padding-inline-start: ${left};`]
  }
  const out = [`text-indent: ${round(paragraph.firstLineIndentChars)}em;`]
  if (paragraph.indentLeftPt) out.push(`padding-inline-start: ${pt(paragraph.indentLeftPt)};`)
  return out
}

function counterNameish(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

/** 表格单元格角色的边框走格线块（相邻单元格共用一条边），这里不再单独画四边。 */
const GRID_BORDER_ROLES = new Set(['table.header', 'table.cell'])

function boxDeclarations(style: ComputedRoleStyle): string[] {
  const out: string[] = []
  if (!GRID_BORDER_ROLES.has(style.role)) {
    out.push(...borderDeclaration('top', style.border.top))
    out.push(...borderDeclaration('right', style.border.right))
    out.push(...borderDeclaration('bottom', style.border.bottom))
    out.push(...borderDeclaration('left', style.border.left))
  }
  if (style.border.radiusPt) out.push(`border-radius: ${pt(style.border.radiusPt)};`)
  if (style.background.color) out.push(`background: ${style.background.color};`)
  if (style.paddingPt) out.push(`padding: ${pt(style.paddingPt)};`)
  return out
}

/** {n} → counter()，「第{n}章」→ "第" counter(x) "章" */
function numberingContent(pattern: string, counter: string): string {
  const segments = pattern.split('{n}')
  const parts: string[] = []
  for (const [index, segment] of segments.entries()) {
    if (segment) parts.push(`"${escapeCssString(segment)}"`)
    if (index < segments.length - 1) parts.push(`counter(${counter})`)
  }
  return parts.join(' ') || `counter(${counter})`
}

/** 支持自动编号的标题层级：1–6 级（样式窗口的「编号」页也只给这六级开放）。 */
const HEADING_COUNTERS = [1, 2, 3, 4, 5, 6].map((level) => `stylemd-heading-${level}`)

function counterForRole(role: string): string | undefined {
  return HEADING_COUNTERS.some((name) => name === `stylemd-${cssRoleName(role)}`) ? `stylemd-${cssRoleName(role)}` : undefined
}

/**
 * 标题计数器的重置规则：正文把 1–6 级全部清零；标题 N 把它之后的层级清零，
 * 子标题才会重新从 1 开始编号。
 */
function headingCounterResets(): string[] {
  return [1, 2, 3, 4, 5].map(
    (level) => `[data-role="heading-${level}"] { counter-reset: ${HEADING_COUNTERS.slice(level).join(' ')}; }`,
  )
}

/** 角色块 + 它用到的 @font-face；块为空（行内角色没声明任何字体）时不带出没用的 face。 */
function roleBlock(style: ComputedRoleStyle): { css: string; faces: string[] } {
  const selector = `[data-role="${escapeCssString(cssRoleName(style.role))}"]`
  const counter = counterForRole(style.role)
  const inline = isInlineRole(style.role)
  const faces: string[] = []
  let fonts = fontDeclarations(style, `stylemd-font-${cssRoleName(style.role)}`, faces)
  if (inline && style.declaredFont) {
    const declared = style.declaredFont
    const fields: Record<string, keyof NonNullable<ComputedRoleStyle['declaredFont']>> = {
      'font-size': 'sizePt', 'font-weight': 'weight', 'font-style': 'italic',
      'text-decoration': 'underline', color: 'color', 'letter-spacing': 'letterSpacingPt',
    }
    fonts = fonts.filter((line) => {
      const property = line.split(':')[0]!
      // 字体族只要三个槽里声明过任意一个就算声明过
      if (property === 'font-family') {
        return declared.latinFamily !== undefined || declared.cjkFamily !== undefined || declared.fallbackFamilies !== undefined
      }
      return declared[fields[property]!] !== undefined
    })
  }
  const declarations = [
    ...fonts,
    ...(inline ? [] : paragraphDeclarations(style, style.numbering.enabled ? counter : undefined)),
    ...boxDeclarations(style),
  ]
  // 行内角色未显式声明任何字体属性时，本就没有可写的东西；输出空规则只会让 CSS 变脏。
  if (declarations.length === 0) return { css: '', faces: [] }
  const blocks = [`${selector} {\n  ${declarations.join('\n  ')}\n}`]

  if (style.numbering.enabled && style.numbering.pattern && counter) {
    const before = [
      `content: ${numberingContent(style.numbering.pattern, counter)};`,
      style.numbering.color ? `color: ${style.numbering.color};` : '',
      style.numbering.gapPt ? `margin-inline-end: ${pt(style.numbering.gapPt)};` : '',
    ].filter(Boolean)
    // 标题本身已经带编号时，渲染器会打上 data-numbering="off"，这里就不再加编号。
    blocks.push(`${selector}:not([data-numbering="off"])::before {\n  ${before.join('\n  ')}\n}`)
  }
  return { css: blocks.join('\n'), faces }
}

/** 默认页边距；页边距盒与内容宽度都按它兜底，别在别处另写一份。 */
const DEFAULT_PAGE_MARGIN_MM = { top: 25, right: 22, bottom: 25, left: 25 }

function resolvePageDimensionsMm(styles: ComputedStyles): { widthMm: number; heightMm: number } {
  const size = styles.page.size ?? 'A4'
  if (typeof size === 'string') {
    const dimensions = PAGE_SIZES_MM[size] ?? PAGE_SIZES_MM['A4']!
    return styles.page.orientation === 'landscape'
      ? { widthMm: dimensions.heightMm, heightMm: dimensions.widthMm }
      : dimensions
  }
  return styles.page.orientation === 'landscape'
    ? { widthMm: size.heightMm, heightMm: size.widthMm }
    : { widthMm: size.widthMm, heightMm: size.heightMm }
}

function resolvePageSize(styles: ComputedStyles): string {
  const page = resolvePageDimensionsMm(styles)
  return `${page.widthMm}mm ${page.heightMm}mm`
}

/**
 * 页面内容宽度（页宽减左右页边距），以 CSS 变量暴露。
 * Paged.js 按页把表格切成多个 <table>，每片只按自己那部分内容算列宽，跨页就会对不齐；
 * 分页层要在分页前用它把列宽定死，所以这里必须给一个可测量的值，不能让宿主去猜。
 */
function pageContentWidth(styles: ComputedStyles): string {
  const margin = styles.page.marginMm ?? DEFAULT_PAGE_MARGIN_MM
  const page = resolvePageDimensionsMm(styles)
  return `calc(${page.widthMm}mm - ${margin.left}mm - ${margin.right}mm)`
}

function furnitureValue(text: string, options: CompileCssOptions): string {
  const parts: string[] = []
  const pattern = /(\{page\}|\{pages\}|\{title\}|\{date\})/g
  let lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    const literal = text.slice(lastIndex, index)
    if (literal) parts.push(`"${escapeCssString(literal)}"`)
    const token = match[0]
    if (token === '{page}') parts.push('counter(page)')
    else if (token === '{pages}') parts.push('counter(pages)')
    else if (token === '{title}') parts.push(`"${escapeCssString(options.title ?? '')}"`)
    else parts.push(`"${escapeCssString(options.date ?? new Date().toLocaleDateString('zh-CN'))}"`)
    lastIndex = index + token.length
  }
  const tail = text.slice(lastIndex)
  if (tail) parts.push(`"${escapeCssString(tail)}"`)
  return parts.join(' ') || '""'
}

function furnitureAreaSuffixes(furniture: PageFurniture | undefined): ('left' | 'center' | 'right')[] {
  if (!furniture) return []
  const suffixes: ('left' | 'center' | 'right')[] = []
  if (furniture.left) suffixes.push('left')
  if (furniture.center) suffixes.push('center')
  if (furniture.right) suffixes.push('right')
  return suffixes
}

function furnitureBlock(
  area: 'top' | 'bottom',
  furniture: PageFurniture | undefined,
  options: CompileCssOptions,
  fallback?: ComputedRoleStyle,
): string[] {
  if (!furniture) return []
  const blocks = furnitureAreaSuffixes(furniture).map((suffix) => {
    const content = furniture[suffix] ?? ''
    const fontSizePt = furniture.fontSizePt ?? fallback?.font.sizePt
    const color = furniture.color ?? fallback?.font.color
    const lines = [
      `content: ${furnitureValue(content, options)};`,
      fontSizePt ? `font-size: ${pt(fontSizePt)};` : '',
      color ? `color: ${color};` : '',
      // distanceMm 是页眉距页面顶部 / 页脚距页面底部的距离，用「贴边对齐 + 内边距」实现；
      // 不设距离时保持 Paged.js 默认的边距区居中。
      typeof furniture.distanceMm === 'number'
        ? area === 'top'
          ? `align-items: flex-start;\n    padding-top: ${round(furniture.distanceMm)}mm;`
          : `align-items: flex-end;\n    padding-bottom: ${round(furniture.distanceMm)}mm;`
        : '',
    ].filter(Boolean)
    return `  @${area}-${suffix} {\n    ${lines.join('\n    ')}\n  }`
  })
  // 横线画在页眉/页脚的内容元素上，不画在 Paged.js 的容器上：
  // 内容元素挂的是 page.header / page.footer 角色，用户改角色样式（含边框）即可改这条线。
  const selector = `[data-role="${area === 'top' ? 'page-header' : 'page-footer'}"]`
  const contentBorders = [
    ...borderDeclaration('top', furniture.borderTop),
    ...borderDeclaration('bottom', furniture.borderBottom),
  ]
  if (contentBorders.length > 0) blocks.push(`${selector} {\n  ${contentBorders.join('\n  ')}\n}`)
  return blocks
}

function pageBlock(styles: ComputedStyles, options: CompileCssOptions): string {
  const margin = styles.page.marginMm ?? DEFAULT_PAGE_MARGIN_MM
  const lines = [
    `size: ${resolvePageSize(styles)};`,
    `margin: ${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm;`,
    ...furnitureBlock('top', styles.page.header, options, styles.roles['page.header']),
    ...furnitureBlock('bottom', styles.page.footer, options, styles.roles['page.footer']),
  ]
  const blocks = [`@page {\n${lines.join('\n')}\n}`]

  if (styles.page.skipFurnitureOnFirstPage) {
    const areaNames = [
      ...furnitureAreaSuffixes(styles.page.header).map((suffix) => `@top-${suffix}`),
      ...furnitureAreaSuffixes(styles.page.footer).map((suffix) => `@bottom-${suffix}`),
    ]
    if (areaNames.length > 0) {
      blocks.push(`@page :first {\n${areaNames.map((name) => `  ${name} { content: none; }`).join('\n')}\n}`)
    }
  }
  return blocks.join('\n')
}

export function compileCss(styles: ComputedStyles, options: CompileCssOptions = {}): string {
  const chunks: string[] = []
  const faces: string[] = []
  const bodyFamily = fontFamilyDeclaration(
    {
      latinFamily: styles.defaults.latinFamily ?? '',
      cjkFamily: styles.defaults.cjkFamily ?? '',
      fallbackFamilies: styles.defaults.fallbackFamilies ?? [],
    },
    'stylemd-font-body',
    faces,
  )
  const bodyLineHeight =
    styles.defaults.lineHeight.mode === 'fixed'
      ? pt(styles.defaults.lineHeight.value)
      : String(styles.defaults.lineHeight.value)
  chunks.push(
    [
      'html, body { margin: 0; padding: 0; }',
      `body {\n${bodyFamily ? `  ${bodyFamily}\n` : ''}  font-size: ${pt(styles.defaults.fontSizePt)};\n  line-height: ${bodyLineHeight};\n  color: ${styles.defaults.textColor};\n  background: ${styles.defaults.background ?? '#ffffff'};\n  counter-reset: ${HEADING_COUNTERS.join(' ')};\n}`,
      ...headingCounterResets(),
      'img[data-role="image"] { max-width: 100%; }',
      'img { height: auto; break-inside: avoid; }',
      'pre { white-space: pre-wrap; overflow-wrap: anywhere; }',
      'pre > code { font: inherit; }',
      'p, li, td, th { overflow-wrap: anywhere; }',
      'blockquote > p[data-role="body-text"] { font: inherit; color: inherit; text-indent: inherit; }',
      'p[data-role="image"] { text-align: center; }',
      tableLayoutBlock(styles.table),
      // 表头是本行的最后一行时 Paged.js 会把它单独留在上一页页脚，下一行又整片挪到下一页，
      // 只有表头的分片没有表体撑宽，列宽会和续页对不上。宁可整张表换页，也不留孤行表头。
      'table[data-role="table"] thead { break-after: avoid; }',
      '[data-role="table-header"], [data-role="table-cell"] { vertical-align: top; }',
      tableGridBlock(tableGridOf(styles)),
    ].join('\n'),
  )

  if (options.includePage !== false) {
    chunks.push(`:root { --stylemd-page-content-width: ${pageContentWidth(styles)}; }`)
    chunks.push(pageBlock(styles, options))
  }

  for (const role of Object.values(styles.roles)) {
    const block = roleBlock(role)
    faces.push(...block.faces)
    chunks.push(block.css)
  }
  // @font-face 必须在使用它的规则之前，统一放到最前面
  if (faces.length > 0) chunks.unshift(faces.join('\n'))
  return chunks.join('\n\n')
}
