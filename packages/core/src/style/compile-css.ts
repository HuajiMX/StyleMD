import {
  PAGE_SIZES_MM,
  cssRoleName,
  type BorderSide,
  type ComputedRoleStyle,
  type ComputedStyles,
  type PageFurniture,
} from '@stylemd/theme-schema'

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

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[<>\u0000-\u001f\u007f]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)
}

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'emoji', 'math', 'fangsong'])
function fontStack(families: string[]): string {
  return families.map((family) => GENERIC_FAMILIES.has(family) ? family : `"${escapeCssString(family)}"`).join(', ')
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

function fontDeclarations(style: ComputedRoleStyle): string[] {
  const out: string[] = []
  if (style.font.family.length > 0) {
    const stack = fontStack(style.font.family)
    out.push(`font-family: ${stack};`)
  }
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
  out.push(`text-indent: ${round(paragraph.firstLineIndentChars)}em;`)
  if (paragraph.indentLeftPt) out.push(`padding-inline-start: ${pt(paragraph.indentLeftPt)};`)
  if (paragraph.indentRightPt) out.push(`padding-inline-end: ${pt(paragraph.indentRightPt)};`)
  if (paragraph.keepWithNext) out.push('break-after: avoid;')
  if (paragraph.pageBreakBefore) out.push('break-before: page;')
  if (paragraph.widows) out.push(`widows: ${paragraph.widows};`)
  if (paragraph.orphans) out.push(`orphans: ${paragraph.orphans};`)
  if (counterNameish(counterName)) out.push(`counter-increment: ${counterName};`)
  return out
}

function counterNameish(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function boxDeclarations(style: ComputedRoleStyle): string[] {
  const out: string[] = []
  out.push(...borderDeclaration('top', style.border.top))
  out.push(...borderDeclaration('right', style.border.right))
  out.push(...borderDeclaration('bottom', style.border.bottom))
  out.push(...borderDeclaration('left', style.border.left))
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

function counterForRole(role: string): string | undefined {
  return /^heading\.[1-3]$/.test(role) ? `stylemd-${cssRoleName(role)}` : undefined
}

function roleBlock(style: ComputedRoleStyle): string {
  const selector = `[data-role="${escapeCssString(cssRoleName(style.role))}"]`
  const counter = counterForRole(style.role)
  const inline = style.role.startsWith('inline.') || style.role === 'code.inline'
  let fonts = fontDeclarations(style)
  if (inline && style.declaredFont) {
    const fields: Record<string, keyof NonNullable<ComputedRoleStyle['declaredFont']>> = {
      'font-family': 'family', 'font-size': 'sizePt', 'font-weight': 'weight', 'font-style': 'italic',
      'text-decoration': 'underline', color: 'color', 'letter-spacing': 'letterSpacingPt',
    }
    fonts = fonts.filter((line) => style.declaredFont?.[fields[line.split(':')[0]!]!] !== undefined)
  }
  const declarations = [
    ...fonts,
    ...(inline ? [] : paragraphDeclarations(style, style.numbering.enabled ? counter : undefined)),
    ...boxDeclarations(style),
  ]
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
  return blocks.join('\n')
}

function resolvePageSize(styles: ComputedStyles): string {
  const size = styles.page.size ?? 'A4'
  if (typeof size === 'string') {
    const dimensions = PAGE_SIZES_MM[size] ?? PAGE_SIZES_MM['A4']!
    const oriented =
      styles.page.orientation === 'landscape'
        ? { widthMm: dimensions.heightMm, heightMm: dimensions.widthMm }
        : dimensions
    return `${oriented.widthMm}mm ${oriented.heightMm}mm`
  }
  return styles.page.orientation === 'landscape' ? `${size.heightMm}mm ${size.widthMm}mm` : `${size.widthMm}mm ${size.heightMm}mm`
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
  return furnitureAreaSuffixes(furniture).map((suffix) => {
    const content = furniture[suffix] ?? ''
    const fontSizePt = furniture.fontSizePt ?? fallback?.font.sizePt
    const color = furniture.color ?? fallback?.font.color
    const lines = [
      `content: ${furnitureValue(content, options)};`,
      fontSizePt ? `font-size: ${pt(fontSizePt)};` : '',
      color ? `color: ${color};` : '',
      ...borderDeclaration('top', furniture.borderTop ?? fallback?.border.top),
      ...borderDeclaration('bottom', furniture.borderBottom ?? fallback?.border.bottom),
    ].filter(Boolean)
    return `  @${area}-${suffix} {\n    ${lines.join('\n    ')}\n  }`
  })
}

function pageBlock(styles: ComputedStyles, options: CompileCssOptions): string {
  const margin = styles.page.marginMm ?? { top: 25, right: 22, bottom: 25, left: 25 }
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
  const bodyFontStack = fontStack(styles.defaults.fontFamily)
  const bodyLineHeight =
    styles.defaults.lineHeight.mode === 'fixed'
      ? pt(styles.defaults.lineHeight.value)
      : String(styles.defaults.lineHeight.value)
  chunks.push(
    [
      'html, body { margin: 0; padding: 0; }',
      `body {\n  font-family: ${bodyFontStack};\n  font-size: ${pt(styles.defaults.fontSizePt)};\n  line-height: ${bodyLineHeight};\n  color: ${styles.defaults.textColor};\n  background: ${styles.defaults.background ?? '#ffffff'};\n  counter-reset: stylemd-heading-1 stylemd-heading-2 stylemd-heading-3;\n}`,
      '[data-role="heading-1"] { counter-reset: stylemd-heading-2 stylemd-heading-3; }',
      '[data-role="heading-2"] { counter-reset: stylemd-heading-3; }',
      'img[data-role="image"] { max-width: 100%; }',
      'img { height: auto; break-inside: avoid; }',
      'pre { white-space: pre-wrap; overflow-wrap: anywhere; }',
      'pre > code { font: inherit; }',
      'p, li, td, th { overflow-wrap: anywhere; }',
      'blockquote > p[data-role="body-text"] { font: inherit; color: inherit; text-indent: inherit; }',
      'p[data-role="image"] { text-align: center; }',
      'table[data-role="table"] { border-collapse: collapse; max-width: 100%; }',
      '[data-role="table-header"], [data-role="table-cell"] { vertical-align: top; }',
    ].join('\n'),
  )

  if (options.includePage !== false) {
    chunks.push(pageBlock(styles, options))
  }

  for (const role of Object.values(styles.roles)) {
    chunks.push(roleBlock(role))
  }
  return chunks.join('\n\n')
}
