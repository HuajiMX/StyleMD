/**
 * 编辑器配色方案：描述「源码编辑区长什么样」的纯数据。
 *
 * 它和 theme-schema 是两件事：样式包描述文档渲染到纸上的样子（预览 / PDF），
 * 配色方案只描述工作台里那个编辑框的观感。两者不互相导入，也不共用文件。
 * 本包不含 DOM、不含 CSS 声明字符串，只有色值、标签与校验逻辑。
 */

/** 14 个色槽，覆盖编辑区里所有会上色的东西。 */
export interface EditorSchemeTokens {
  /** 编辑区底色。 */
  background: string
  /** 正文与未分类文字。 */
  foreground: string
  /** 标题文字。 */
  heading: string
  /** 强调与加粗。 */
  emphasis: string
  /** 行内代码与代码块文字。 */
  code: string
  /** 代码底色。 */
  codeBg: string
  /** 链接文字。 */
  link: string
  /** 列表符号。 */
  listMarker: string
  /** 结构标记：＃、＞、围栏。 */
  marker: string
  /** 前言、URL、表格竖线。 */
  muted: string
  /** 分隔线。 */
  separator: string
  /** 当前行底色。 */
  activeLine: string
  /** 当前结构块的竖线（画在行号右边）。 */
  activeBlockBar: string
}

export type EditorTokenName = keyof EditorSchemeTokens

export interface EditorScheme {
  /** 小写字母、数字、短横线；内置方案的 id 不允许被自定义方案占用。 */
  id: string
  /** 界面显示名。 */
  name: string
  /** 内置方案不可删除、不可改名，只能「新建副本」。 */
  builtIn?: boolean
  /** 自定义方案是从哪套内置方案复制来的，「恢复初始值」按它还原。 */
  basedOn?: string
  tokens: EditorSchemeTokens
}

export interface EditorSchemeLibrary {
  schemaVersion: 1
  /** 当前生效的方案 id；找不到时回落到 DEFAULT_SCHEME_ID。 */
  activeId: string
  /** 内置方案 + 用户自建方案。 */
  schemes: EditorScheme[]
  /**
   * 最近使用的顺序（最新的在前）。
   *
   * 工具带只摆得下固定几个，所以「谁排前面」必须是一条能存下来的规则，不能靠数组顺序——
   * 数组顺序表达的是「方案怎么建出来的」，跟「我最近在用哪个」是两件事。
   */
  recentIds: string[]
}

/** 对比度门槛的档位：文本按 4.5:1，标记与图形按 3:1，底色本身不设门槛。 */
export type ContrastTier = 'text' | 'graphic' | 'surface'

export const EDITOR_SCHEME_SCHEMA_VERSION = 1
export const DEFAULT_SCHEME_ID = 'paper'
export const MAX_SCHEME_NAME_LENGTH = 24
export const MAX_SCHEME_ID_LENGTH = 40
export const MAX_SCHEME_COUNT = 50
/** 工具带上固定摆几个方案，其余走「更多」。 */
export const SCHEME_RIBBON_LIMIT = 5

export const TOKEN_NAMES: EditorTokenName[] = [
  'background',
  'foreground',
  'heading',
  'emphasis',
  'code',
  'codeBg',
  'link',
  'listMarker',
  'marker',
  'muted',
  'separator',
  'activeLine',
  'activeBlockBar',
]

export const TOKEN_LABELS: Record<EditorTokenName, string> = {
  background: '编辑区底色',
  foreground: '正文文字',
  heading: '标题文字',
  emphasis: '强调 / 加粗',
  code: '代码文字',
  codeBg: '代码底色',
  link: '链接',
  listMarker: '列表符号',
  marker: '结构标记',
  muted: '前言 / URL',
  separator: '分隔线',
  activeLine: '当前行底色',
  activeBlockBar: '当前结构块竖线',
}

export const TOKEN_HINTS: Record<EditorTokenName, string> = {
  background: '编辑器窗格的底色',
  foreground: '正文与未分类文字',
  heading: 'Markdown 标题（# 到 ######）',
  emphasis: '**加粗** 与 *斜体*',
  code: '行内代码与代码块文字',
  codeBg: '代码块的浅底色',
  link: '链接文字',
  listMarker: '- 与 1. 这样的列表符号',
  marker: '#、>、``` 这类结构标记',
  muted: '前言、URL、表格竖线',
  separator: '--- 分隔线',
  activeLine: '光标所在行的底色',
  activeBlockBar: '光标所在结构在行号旁画出的竖线',
}

export const TOKEN_TIERS: Record<EditorTokenName, ContrastTier> = {
  background: 'surface',
  foreground: 'text',
  heading: 'text',
  emphasis: 'text',
  code: 'text',
  codeBg: 'surface',
  link: 'text',
  listMarker: 'text',
  marker: 'graphic',
  muted: 'graphic',
  separator: 'graphic',
  activeLine: 'surface',
  activeBlockBar: 'graphic',
}

/** 每档的最低对比度（WCAG）：正文 4.5:1，标记与图形 3:1。 */
export const CONTRAST_MINIMUM: Record<ContrastTier, number> = {
  text: 4.5,
  graphic: 3,
  surface: 0,
}
