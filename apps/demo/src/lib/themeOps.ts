import type { BorderSpec, DocumentDefaults, PageSetup, RoleStyle, StyleTheme } from '@stylemd/theme-schema'

/** 样式编辑全部走不可变更新：每次改动产出一个新样式包，便于撤销与对比。 */

function withStyles(theme: StyleTheme, styles: RoleStyle[]): StyleTheme {
  return { ...theme, styles }
}

function mergeRole(existing: RoleStyle | undefined, patch: Partial<RoleStyle>): RoleStyle {
  if (!existing) return patch as RoleStyle
  const merged: RoleStyle = { ...existing, ...patch }
  if (existing.font || patch.font) {
    merged.font = { ...existing.font, ...patch.font }
  }
  if (existing.paragraph || patch.paragraph) {
    merged.paragraph = { ...existing.paragraph, ...patch.paragraph }
  }
  if (existing.border || patch.border) {
    merged.border = { ...existing.border, ...patch.border } as BorderSpec
  }
  if (existing.background || patch.background) {
    merged.background = { ...existing.background, ...patch.background }
  }
  if (existing.numbering || patch.numbering) {
    merged.numbering = { ...existing.numbering, ...patch.numbering }
  }
  return merged
}

/** 设置（或新增）某个角色的样式片段。 */
export function upsertRoleStyle(theme: StyleTheme, role: string, patch: Partial<RoleStyle>): StyleTheme {
  const index = theme.styles.findIndex((style) => style.role === role)
  if (index < 0) {
    return withStyles(theme, [...theme.styles, { role, ...patch }])
  }
  const styles = [...theme.styles]
  styles[index] = mergeRole(styles[index], patch)
  return withStyles(theme, styles)
}

/** 删除某个属性分组，让该组回落到"基于"的样式或文档默认值。 */
export function clearRoleGroup(theme: StyleTheme, role: string, group: keyof RoleStyle): StyleTheme {
  const index = theme.styles.findIndex((style) => style.role === role)
  if (index < 0) return theme
  const styles = [...theme.styles]
  const source = styles[index]
  if (!source) return theme
  const current: RoleStyle = { ...source }
  delete (current as unknown as Record<string, unknown>)[group as string]
  styles[index] = current
  return withStyles(theme, styles)
}

/** 整条样式移除：该角色回到完全继承的状态。 */
export function resetRoleStyle(theme: StyleTheme, role: string): StyleTheme {
  return withStyles(
    theme,
    theme.styles.filter((style) => style.role !== role),
  )
}

export function updatePage(theme: StyleTheme, patch: Partial<PageSetup>): StyleTheme {
  return { ...theme, document: { ...theme.document, page: { ...theme.document.page, ...patch } } }
}

export function updateDefaults(theme: StyleTheme, patch: Partial<DocumentDefaults>): StyleTheme {
  return { ...theme, document: { ...theme.document, defaults: { ...theme.document.defaults, ...patch } } }
}
