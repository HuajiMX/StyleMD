import type { RoleStyle } from './types'

/**
 * 结构角色注册表：样式挂在角色上，角色对应 Markdown AST 的语义节点。
 * 这是"样式管理器"里角色树的唯一数据来源。
 */

export type RoleCategory =
  | '标题'
  | '正文'
  | '段落'
  | '列表'
  | '代码'
  | '图片'
  | '表格'
  | '行内'
  | '公式'
  | '页面'

export interface RoleDefinition {
  id: string
  label: string
  category: RoleCategory
  description: string
  /** 样式管理器里用于实时预览的样例文字。 */
  sample: string
  /**
   * 样例的呈现方式。公式角色要用 KaTeX 真渲染，不能把 `$$...$$` 当纯文本摆出来——
   * 那既看不出居中，也看不出字号。默认 'text'。
   */
  sampleKind?: 'text' | 'inline-math' | 'display-math'
  /**
   * 角色自带的兜底样式：与主题里的 RoleStyle 同一套字段，主题声明了这个角色就以主题为准。
   * 只写"这个角色的语义本来就该如此"的属性（例如行间公式居中），别把该由主题决定的排版塞进来。
   */
  defaults?: Omit<RoleStyle, 'role'>
}

export const ROLES: RoleDefinition[] = [
  { id: 'heading.1', label: '一级标题', category: '标题', description: 'Markdown 的 #，通常为章标题', sample: '第一章 绪论' },
  { id: 'heading.2', label: '二级标题', category: '标题', description: 'Markdown 的 ##，通常为节标题', sample: '1.1 研究背景' },
  { id: 'heading.3', label: '三级标题', category: '标题', description: 'Markdown 的 ###', sample: '1.1.1 国内研究现状' },
  { id: 'heading.4', label: '四级标题', category: '标题', description: 'Markdown 的 ####', sample: '（1）技术路线' },
  { id: 'heading.5', label: '五级标题', category: '标题', description: 'Markdown 的 #####', sample: '细节说明' },
  { id: 'heading.6', label: '六级标题', category: '标题', description: 'Markdown 的 ######', sample: '补充说明' },

  { id: 'body.text', label: '正文段落', category: '正文', description: '普通段落，也是多数样式的继承基础', sample: '这是使用当前样式渲染的一段中文正文，用于直观判断字号、行距与首行缩进的效果。StyleMD 让样式调整像 Word 一样直观。' },

  { id: 'abstract', label: '摘要', category: '段落', description: '::: abstract 容器内容', sample: '摘要：本文研究 Markdown 文档的可视化样式管理方法，提出了一种与渲染后端解耦的样式模型。' },
  { id: 'keywords', label: '关键词', category: '段落', description: '::: keywords 容器内容', sample: '关键词：Markdown；样式管理；分页排版；PDF 导出' },
  { id: 'blockquote', label: '引用块', category: '段落', description: 'Markdown 的 >，也用于注释性内容', sample: '> 引用内容：排版工具的差异不在功能多少，而在用户能否精确控制结果。' },
  { id: 'figure.caption', label: '图题', category: '图片', description: '紧跟在图片后的说明段落，或 ::: figure 容器', sample: '图 3-1 系统总体架构图' },
  { id: 'table.caption', label: '表题', category: '表格', description: '以「表 x-x」开头的段落，或 ::: table 容器', sample: '表 3-1 样式属性对照表' },
  { id: 'reference.item', label: '参考文献条目', category: '段落', description: '位于「参考文献 / References」标题之后的条目', sample: '[1] 作者. 文献题名[M]. 出版地: 出版社, 2024.' },
  { id: 'divider', label: '分割线', category: '段落', description: 'Markdown 的 ---', sample: '' },

  { id: 'list.unordered', label: '无序列表', category: '列表', description: 'Markdown 的 - / * 列表', sample: '· 支持自定义项目符号字符与缩进\n· 符号与文本的间距可独立调整' },
  { id: 'list.ordered', label: '有序列表', category: '列表', description: 'Markdown 的 1. 列表', sample: '1. 第一步：导入 Markdown 文档\n2. 第二步：在样式面板中调整版式' },
  { id: 'list.item', label: '列表项', category: '列表', description: '列表中的单个条目', sample: '· 单个列表条目' },

  { id: 'code.block', label: '代码块', category: '代码', description: '围栏代码块', sample: 'const theme = loadTheme("thesis-cn");\nrender(doc, theme);' },
  { id: 'code.inline', label: '行内代码', category: '代码', description: '反引号包裹的内容', sample: 'printToPDF()' },

  {
    id: 'math.inline',
    label: '行内公式',
    category: '公式',
    description: 'Markdown 的 $...$，随正文字号排版',
    sample: 'E = mc^2',
    sampleKind: 'inline-math',
  },
  {
    id: 'math.block',
    label: '行间公式',
    category: '公式',
    description: 'Markdown 的 $$...$$，行间公式，居中（写成一行也算）',
    // 反斜杠要原样保留：普通字符串里的 `\f` 会变成换页符，样例就废了。
    sample: String.raw`\Delta = b^2 - 4ac`,
    sampleKind: 'display-math',
    defaults: { paragraph: { align: 'center' } },
  },

  { id: 'image', label: '图片', category: '图片', description: 'Markdown 图片语法', sample: '' },

  { id: 'table', label: '表格', category: '表格', description: 'GFM 表格整体', sample: '' },
  { id: 'table.header', label: '表头单元格', category: '表格', description: '表头行', sample: '属性 | 取值' },
  { id: 'table.cell', label: '表格单元格', category: '表格', description: '普通单元格', sample: '字号 | 12pt' },

  { id: 'inline.strong', label: '加粗', category: '行内', description: 'Markdown 的 **强调**', sample: '加粗文字' },
  { id: 'inline.emphasis', label: '倾斜', category: '行内', description: 'Markdown 的 *强调*', sample: '倾斜文字' },
  { id: 'inline.link', label: '超链接', category: '行内', description: 'Markdown 的 [文本](url)', sample: '链接文字' },

  { id: 'page.header', label: '页眉', category: '页面', description: '页面顶部区域，支持 {page} {pages} {title} {date} 域', sample: '页眉：文档标题' },
  { id: 'page.footer', label: '页脚', category: '页面', description: '页面底部区域，通常放页码', sample: '页脚：1 / 10' },
]

const ROLE_BY_ID = new Map(ROLES.map((role) => [role.id, role]))

export function getRole(id: string): RoleDefinition | undefined {
  return ROLE_BY_ID.get(id)
}

export function isKnownRole(id: string): boolean {
  return ROLE_BY_ID.has(id)
}

export function roleLabel(id: string): string {
  return ROLE_BY_ID.get(id)?.label ?? id
}

export function roleCategory(id: string): RoleCategory | undefined {
  return ROLE_BY_ID.get(id)?.category
}

/**
 * 角色 id → CSS/data-attribute 名：'heading.1' → 'heading-1'。
 * 保留点号会让 CSS 选择器需要转义，统一用短横线更稳妥。
 */
export function cssRoleName(role: string): string {
  return role.replace(/\./g, '-')
}

/**
 * 行内角色：段落属性（行距、缩进、段前段后）对它们没有意义，CSS 只写字体声明，
 * 没显式声明的字体属性继续从所在段落继承。
 * `code.inline` 与 `math.inline` 是"后缀式"命名，不在 `inline.*` 前缀里，必须一起列出。
 */
const INLINE_ROLE_IDS = new Set(['code.inline', 'math.inline'])

export function isInlineRole(role: string): boolean {
  return role.startsWith('inline.') || INLINE_ROLE_IDS.has(role)
}

/** 无法识别角色时的兜底：一律按正文处理，保证不会丢内容。 */
export const FALLBACK_ROLE = 'body.text'
