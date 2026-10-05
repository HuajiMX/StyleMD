import {
  ROLES,
  getRole,
  type ComputedRoleStyle,
  type ComputedStyles,
  type DocumentDefaults,
  type RoleStyle,
  type StyleTheme,
} from '@stylemd/theme-schema'

/**
 * 样式解析：把「样式包 + 继承链」展开成每个角色的计算样式。
 *
 * 优先级（规划 §8）：局部覆盖 > 角色显式属性 > 继承链 > 文档默认值 > 引擎兜底。
 * 本函数负责后四层中的中间三层；局部覆盖属于渲染期注入，不在样式包里持久化。
 */

export const BASE_ROLE = 'body.text'

type ResolvedPart = Omit<ComputedRoleStyle, 'role' | 'inheritanceChain'>

function baseFromDefaults(defaults: DocumentDefaults): ResolvedPart {
  return {
    font: {
      latinFamily: defaults.latinFamily ?? '',
      cjkFamily: defaults.cjkFamily ?? '',
      fallbackFamilies: [...(defaults.fallbackFamilies ?? [])],
      sizePt: defaults.fontSizePt,
      weight: 400,
      italic: false,
      color: defaults.textColor,
      underline: false,
      letterSpacingPt: 0,
    },
    paragraph: {
      align: 'left',
      lineHeight: { ...defaults.lineHeight },
      spaceBeforePt: 0,
      spaceAfterPt: 0,
      firstLineIndentChars: 0,
      indentLeftPt: 0,
      indentRightPt: 0,
      keepWithNext: false,
      pageBreakBefore: false,
      widows: 2,
      orphans: 2,
    },
    border: {},
    background: {},
    paddingPt: 0,
    numbering: { enabled: false },
  }
}

function defined<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value
}

/** 把一条角色样式叠加到已有结果上：只覆盖显式声明过的属性。 */
export function mergeRoleStyle(base: ResolvedPart, style: RoleStyle): ResolvedPart {
  const font = style.font ?? {}
  const paragraph = style.paragraph ?? {}
  return {
    font: {
      latinFamily: defined(font.latinFamily, base.font.latinFamily),
      cjkFamily: defined(font.cjkFamily, base.font.cjkFamily),
      fallbackFamilies: defined(font.fallbackFamilies ? [...font.fallbackFamilies] : undefined, base.font.fallbackFamilies),
      sizePt: defined(font.sizePt, base.font.sizePt),
      weight: defined(font.weight, base.font.weight),
      italic: defined(font.italic, base.font.italic),
      color: defined(font.color, base.font.color),
      underline: defined(font.underline, base.font.underline),
      letterSpacingPt: defined(font.letterSpacingPt, base.font.letterSpacingPt),
    },
    paragraph: {
      align: defined(paragraph.align, base.paragraph.align),
      lineHeight: defined(paragraph.lineHeight ? { ...paragraph.lineHeight } : undefined, base.paragraph.lineHeight),
      spaceBeforePt: defined(paragraph.spaceBeforePt, base.paragraph.spaceBeforePt),
      spaceAfterPt: defined(paragraph.spaceAfterPt, base.paragraph.spaceAfterPt),
      firstLineIndentChars: defined(paragraph.firstLineIndentChars, base.paragraph.firstLineIndentChars),
      indentLeftPt: defined(paragraph.indentLeftPt, base.paragraph.indentLeftPt),
      indentRightPt: defined(paragraph.indentRightPt, base.paragraph.indentRightPt),
      keepWithNext: defined(paragraph.keepWithNext, base.paragraph.keepWithNext),
      pageBreakBefore: defined(paragraph.pageBreakBefore, base.paragraph.pageBreakBefore),
      widows: defined(paragraph.widows, base.paragraph.widows),
      orphans: defined(paragraph.orphans, base.paragraph.orphans),
    },
    border: {
      top: style.border?.top ? { ...base.border.top, ...style.border.top } : base.border.top,
      right: style.border?.right ? { ...base.border.right, ...style.border.right } : base.border.right,
      bottom: style.border?.bottom ? { ...base.border.bottom, ...style.border.bottom } : base.border.bottom,
      left: style.border?.left ? { ...base.border.left, ...style.border.left } : base.border.left,
      radiusPt: defined(style.border?.radiusPt, base.border.radiusPt),
    },
    background: { color: defined(style.background?.color, base.background.color) },
    paddingPt: defined(style.paddingPt, base.paddingPt),
    numbering: {
      enabled: defined(style.numbering?.enabled, base.numbering.enabled),
      pattern: defined(style.numbering?.pattern, base.numbering.pattern),
      color: defined(style.numbering?.color, base.numbering.color),
      gapPt: defined(style.numbering?.gapPt, base.numbering.gapPt),
    },
  }
}

/** 返回从自身到根节点的继承链，例如 [heading.1, body.text]。 */
export function inheritanceChain(role: string, byRole: Map<string, RoleStyle>): string[] {
  const chain: string[] = []
  const visited = new Set<string>()
  let current: string | undefined = role
  while (current && !visited.has(current)) {
    chain.push(current)
    visited.add(current)
    current = byRole.get(current)?.basedOn
  }
  return chain
}

function computeRole(role: string, byRole: Map<string, RoleStyle>, defaults: DocumentDefaults): ComputedRoleStyle {
  const chain = inheritanceChain(role, byRole)
  let resolved = baseFromDefaults(defaults)
  // 角色自带的兜底（例如行间公式居中）夹在文档默认值与主题声明之间：主题一声明就盖过它。
  const roleDefaults = getRole(role)?.defaults
  if (roleDefaults) resolved = mergeRoleStyle(resolved, { role, ...roleDefaults })
  const declaredFont: NonNullable<ComputedRoleStyle['declaredFont']> = {}
  // 角色兜底里的字体同样算"声明过"：否则行内角色的兜底字体会被当成继承值而丢掉。
  for (const [key, value] of Object.entries(roleDefaults?.font ?? {})) {
    if (value !== undefined) Object.assign(declaredFont, { [key]: value })
  }
  // 从继承链的根部向叶子叠加，保证叶子的显式属性最终生效。
  for (const id of [...chain].reverse()) {
    const style = byRole.get(id)
    if (style) {
      resolved = mergeRoleStyle(resolved, style)
      for (const [key, value] of Object.entries(style.font ?? {})) {
        if (value !== undefined) Object.assign(declaredFont, { [key]: value })
      }
    }
  }
  return { role, ...resolved, declaredFont, inheritanceChain: chain }
}

export function resolveStyles(theme: StyleTheme): ComputedStyles {
  const byRole = new Map<string, RoleStyle>()
  for (const style of theme.styles) byRole.set(style.role, style)

  const defaults = theme.document.defaults
  const roles: Record<string, ComputedRoleStyle> = Object.create(null) as Record<string, ComputedRoleStyle>
  for (const definition of ROLES) {
    roles[definition.id] = computeRole(definition.id, byRole, defaults)
  }
  // 样式包里出现、但注册表还没有的角色照样解析，保证向前兼容。
  for (const style of theme.styles) {
    if (!roles[style.role]) roles[style.role] = computeRole(style.role, byRole, defaults)
  }

  return { themeId: theme.id, page: theme.document.page, defaults, roles }
}
