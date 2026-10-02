import type { ComputedRoleStyle, ComputedStyles, RoleStyle, StyleTheme } from '@stylemd/theme-schema'

/** 角色在样式包里的显式声明（没有就是纯继承）。 */
export function explicitStyle(theme: StyleTheme, role: string): RoleStyle | undefined {
  return theme.styles.find((style) => style.role === role)
}

export function resolvedStyle(computed: ComputedStyles, role: string): ComputedRoleStyle | undefined {
  return computed.roles[role]
}

/** 该角色显式声明了几组属性，用于列表上的小圆点。 */
export function explicitGroupCount(theme: StyleTheme, role: string): number {
  const style = explicitStyle(theme, role)
  if (!style) return 0
  const groups: (keyof RoleStyle)[] = ['font', 'paragraph', 'border', 'background', 'paddingPt', 'numbering', 'basedOn']
  return groups.filter((group) => style[group] !== undefined).length
}
