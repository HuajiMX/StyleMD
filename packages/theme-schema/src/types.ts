/**
 * 样式模型：纯数据，不含任何 CSS 字符串、DOM 或引擎概念。
 *
 * 设计约束（来自 docs/plans/2026-09-30-stylemd-development-plan.html §5 D2）：
 *  - 渲染后端只消费本模型，模型不反向依赖后端；
 *  - 新增后端（DOCX / Typst）时，本文件不应发生破坏性修改；
 *  - 所有长度以 pt / mm 等显式单位表达，不做隐式换算。
 */

/** 样式包当前 schema 版本。修改模型结构时必须递增，并在 migrate.ts 中补一段迁移。 */
export const CURRENT_SCHEMA_VERSION = 3

export type LengthUnit = 'pt' | 'mm' | 'em' | 'ch' | 'px'

export type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted' | 'double'

export interface BorderSide {
  style?: BorderStyle
  widthPt?: number
  color?: string
}

export interface BorderSpec {
  top?: BorderSide
  right?: BorderSide
  bottom?: BorderSide
  left?: BorderSide
  radiusPt?: number
}

export interface FontSpec {
  /**
   * 西文字体：拉丁字母与半角标点用它。空串表示「跟随中文字体」，缺省表示继承。
   */
  latinFamily?: string
  /** 中文字体：中日韩字符与全角标点用它。空串表示这一层不指定中文字体。 */
  cjkFamily?: string
  /** 上面两个槽都没字体可用时的尾部回退（serif / sans-serif 等），按顺序生效。 */
  fallbackFamilies?: string[]
  sizePt?: number
  weight?: number
  italic?: boolean
  color?: string
  underline?: boolean
  letterSpacingPt?: number
}

export interface LineHeight {
  /** multiple = 倍数（1.5 倍行距）；fixed = 固定值（单位 pt）。 */
  mode: 'multiple' | 'fixed'
  value: number
}

export interface ParagraphSpec {
  align?: 'left' | 'center' | 'right' | 'justify'
  lineHeight?: LineHeight
  spaceBeforePt?: number
  spaceAfterPt?: number
  /** "首行缩进 2 字符"：按当前字号换算为 em，随字号正确缩放。 */
  firstLineIndentChars?: number
  indentLeftPt?: number
  indentRightPt?: number
  keepWithNext?: boolean
  pageBreakBefore?: boolean
  /** 分页器支持度有限，UI 需标注"尽力而为"。 */
  widows?: number
  orphans?: number
}

export interface NumberingSpec {
  enabled?: boolean
  /** 标题编号模板，{n} 为当前序号，例如「第{n}章」「{n}.」。 */
  pattern?: string
  color?: string
  gapPt?: number
}

export interface RoleStyle {
  role: string
  /** 显示名，仅用于 UI；缺省时取角色注册表里的名称。 */
  label?: string
  /** 继承来源，等价于 Word 的「样式基于」。 */
  basedOn?: string
  font?: FontSpec
  paragraph?: ParagraphSpec
  border?: BorderSpec
  background?: { color?: string }
  /** 内边距（四边相同），与 border/background 配合形成段落框。 */
  paddingPt?: number
  numbering?: NumberingSpec
}

/** 页眉页脚中的域，渲染时替换：{page} {pages} {title} {date} */
export interface PageFurniture {
  left?: string
  center?: string
  right?: string
  /** 距页面边缘的距离（mm）：页眉算到页面顶部，页脚算到页面底部；留空则在该边距区里居中。 */
  distanceMm?: number
  fontSizePt?: number
  color?: string
  borderTop?: BorderSide
  borderBottom?: BorderSide
}

export type PageSizeName = 'A4' | 'A3' | 'A5' | 'B5' | 'Letter'

export interface PageSize {
  widthMm: number
  heightMm: number
}

export interface PageSetup {
  size?: PageSizeName | PageSize
  orientation?: 'portrait' | 'landscape'
  marginMm?: { top: number; right: number; bottom: number; left: number }
  header?: PageFurniture
  footer?: PageFurniture
  /** 首页（封面）不显示页眉页脚。 */
  skipFurnitureOnFirstPage?: boolean
  background?: string
}

export interface DocumentDefaults {
  /** 正文的西文字体槽；空串表示跟随中文字体 */
  latinFamily?: string
  /** 正文的中文字体槽 */
  cjkFamily?: string
  /** 正文的尾部回退 */
  fallbackFamilies?: string[]
  fontSizePt: number
  lineHeight: LineHeight
  textColor: string
  background?: string
}

export interface StyleTheme {
  schemaVersion: number
  id: string
  name: string
  description?: string
  document: {
    page: PageSetup
    defaults: DocumentDefaults
  }
  styles: RoleStyle[]
}

/** 解析后的"计算样式"：继承链已展开，缺省值已填满。 */
export interface ComputedRoleStyle {
  role: string
  /** 运行期来源信息（不写入样式包），行内元素未声明的字体属性应继承所在段落。 */
  declaredFont?: FontSpec
  font: Required<
    Pick<FontSpec, 'latinFamily' | 'cjkFamily' | 'fallbackFamilies' | 'sizePt' | 'weight' | 'italic' | 'color' | 'underline' | 'letterSpacingPt'>
  >
  paragraph: Required<Pick<ParagraphSpec, 'align' | 'lineHeight' | 'spaceBeforePt' | 'spaceAfterPt' | 'firstLineIndentChars' | 'indentLeftPt' | 'indentRightPt' | 'keepWithNext' | 'pageBreakBefore' | 'widows' | 'orphans'>>
  border: BorderSpec
  background: { color?: string }
  paddingPt: number
  numbering: NumberingSpec
  /** 继承链，从自身到根，用于 UI 展示「基于」关系。 */
  inheritanceChain: string[]
}

export interface ComputedStyles {
  themeId: string
  page: PageSetup
  defaults: DocumentDefaults
  roles: Record<string, ComputedRoleStyle>
}
