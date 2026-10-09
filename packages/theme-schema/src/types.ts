/**
 * 样式模型：纯数据，不含任何 CSS 字符串、DOM 或引擎概念。
 *
 * 设计约束（来自 docs/plans/2026-09-30-stylemd-development-plan.html §5 D2）：
 *  - 渲染后端只消费本模型，模型不反向依赖后端；
 *  - 新增后端（DOCX / Typst）时，本文件不应发生破坏性修改；
 *  - 所有长度以 pt / mm 等显式单位表达，不做隐式换算。
 */

/** 样式包当前 schema 版本。修改模型结构时必须递增，并在 migrate.ts 中补一段迁移。 */
export const CURRENT_SCHEMA_VERSION = 4

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

/**
 * 表格格线：相邻单元格**共用**的那两条线。
 *
 * 普通结构的边框是四条各自独立的边；表格不一样——单元格紧密堆积，左边单元格的右边框与
 * 右边单元格的左边框在视觉上是同一条线（`border-collapse: collapse` 下还会按"样式优先级
 * 然后比粗细"打一架）。所以表格的格线单独一组数据：内部横线、内部竖线各只有一条，
 * 由渲染器只画一次（见 core 的 `tableGridOf` 与 `compile-css` 的格线块）。
 *
 * 外框仍旧是 `table` 角色的 `border`（表格这个盒子自己的四条边，可以各自不同），
 * 表头下面那条线是 `table.header` 的 `border.bottom`。
 */
export interface TableGridSpec {
  /** 内部横线：相邻两行之间共用的那条线（不含表头下面那条）。 */
  horizontal?: BorderSide
  /** 内部竖线：相邻两列之间共用的那条线。 */
  vertical?: BorderSide
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
  /**
   * 悬挂缩进 N 字符：首行顶格，其余行缩进 N 字符（参考文献条目、术语表常用）。
   * 与 `firstLineIndentChars` 互斥——Word / OOXML 里也是 `firstLine` 与 `hanging` 这样一对属性，
   * 同时设两个属于无效数据，校验会报错。
   */
  hangingIndentChars?: number
  indentLeftPt?: number
  indentRightPt?: number
  keepWithNext?: boolean
  pageBreakBefore?: boolean
  /** 分页器支持度有限，UI 需标注"尽力而为"。 */
  widows?: number
  orphans?: number
  /**
   * 表格单元格的垂直对齐（九宫格对齐方式的竖轴）：上 / 中 / 下。
   * 只对表格单元格这类 `display: table-cell` 的盒子有意义，普通块级段落上 vertical-align 不生效，
   * 所以编译器在值为默认的 `top` 时不写声明（基座规则里已经给单元格兜了 top）。
   */
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

/**
 * 段落属性分成两组，`basedOn` 继承只传前一组：
 *
 *  - **家族属性**（其余字段）：沿 `basedOn` 继承。这是"样式基于"的价值所在——改正文的行距、段间距、
 *    字体，基于它的标题/列表跟着变。
 *  - **版式约定**（下面这些）：**不随 `basedOn` 传递**，只认角色自己写的值，没写就用默认（对齐左、
 *    缩进 0）。「正文首行缩进 2 字符、两端对齐」是一篇文档的排版约定，不是家族属性：标题、列表、
 *    题注、代码块基于正文，图的是字体基线，不该跟着一起缩进、一起两端对齐。谁要缩进谁自己声明。
 *
 * 判定是"字段"而不是"角色"：`body.text` 照样可以声明约定（正文自己当然缩进 2 字符），只是这份声明
 * 不再顺着继承边漏出去。
 */
export const PARAGRAPH_CONVENTION_FIELDS = [
  'align',
  'firstLineIndentChars',
  'hangingIndentChars',
  'indentLeftPt',
  'indentRightPt',
] as const

export type ParagraphConventionField = (typeof PARAGRAPH_CONVENTION_FIELDS)[number]

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
  /** 表格格线；只有 `table` 角色用得上（见 TableGridSpec）。 */
  grid?: TableGridSpec
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

/**
 * 表格整体版式（文档级）。
 *
 * 它是"表格这个对象"的几何属性（宽度、最小尺寸、均分行列、跨页重复标题行、整体对齐），
 * 不是文字样式，所以挂在 `document` 上而不是某个角色的 RoleStyle 里——Word 的表格属性也是
 * 独立于段落样式的一层，将来 DOCX 后端能 1:1 映射。单元格级别的样式（内边距、九宫格对齐、
 * 边框、底纹）仍旧归 `table.header` / `table.cell` 角色。
 */
export interface TableSpec {
  /** 宽度：按内容自适应 / 撑满纸张内容区；设置了 widthPercent 时以百分比为准。 */
  widthMode?: 'auto' | 'full'
  /** 表格宽度占纸张内容区的百分比（1–100）。 */
  widthPercent?: number
  /** 最小宽度占纸张内容区的百分比（0–100）。 */
  minWidthPercent?: number
  /** 最小高度（pt）：整张表至少这么高，多出来的高度由浏览器分给各行。 */
  minHeightPt?: number
  /** 分布列：各列等宽。 */
  distributeColumns?: boolean
  /** 分布行：各行等高（按最高的一行；分页渲染里量得到行高，静态 HTML 输出里量不到）。 */
  distributeRows?: boolean
  /** 跨页重复标题行：首行渲染成 `<thead>`，分页时每页补一遍。 */
  repeatHeaderRow?: boolean
  /** 表格整体在内容区里的对齐。 */
  align?: 'left' | 'center' | 'right'
}

/** 填满默认值之后的表格版式，编译与宿主 UI 共用同一份。 */
export interface ComputedTableLayout {
  widthMode: 'auto' | 'full'
  widthPercent?: number
  minWidthPercent: number
  minHeightPt: number
  distributeColumns: boolean
  distributeRows: boolean
  repeatHeaderRow: boolean
  align: 'left' | 'center' | 'right'
}

export interface StyleTheme {
  schemaVersion: number
  id: string
  name: string
  description?: string
  document: {
    page: PageSetup
    defaults: DocumentDefaults
    table?: TableSpec
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
  paragraph: Required<Pick<ParagraphSpec, 'align' | 'lineHeight' | 'spaceBeforePt' | 'spaceAfterPt' | 'firstLineIndentChars' | 'hangingIndentChars' | 'indentLeftPt' | 'indentRightPt' | 'keepWithNext' | 'pageBreakBefore' | 'widows' | 'orphans' | 'verticalAlign'>>
  border: BorderSpec
  /** 表格格线（`table` 角色）；其它角色是空对象。 */
  grid: TableGridSpec
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
  /** 表格整体版式（已填默认值）。 */
  table: ComputedTableLayout
  roles: Record<string, ComputedRoleStyle>
}
