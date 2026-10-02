import { DEFAULT_SCHEME_ID, type EditorScheme, type EditorSchemeLibrary } from './types'

/**
 * 最近使用的顺序。
 *
 * 规则：`recentIds` 里最新用过的排最前；不在里面的方案按它们在 schemes 里的顺序接在后面；
 * 指向已删除方案的 id 直接丢掉。这样无论是老存档还是删过方案，排出来的结果都是完整且唯一的。
 */
export function orderSchemeIds(library: EditorSchemeLibrary): string[] {
  const known = new Set(library.schemes.map((scheme) => scheme.id))
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const id of library.recentIds) {
    if (!known.has(id) || seen.has(id)) continue
    ordered.push(id)
    seen.add(id)
  }
  for (const scheme of library.schemes) {
    if (seen.has(scheme.id)) continue
    ordered.push(scheme.id)
    seen.add(scheme.id)
  }
  return ordered
}

/**
 * 按给定 id 顺序排列；不在列表里的方案追加到末尾。
 *
 * 追加而不是丢弃，是为了「面板打开期间定住顺序」这个用法：新建的副本、导入的方案
 * 总得能出现在列表里，但不能插到最前面把用户正在看的卡片挤走。
 */
export function orderSchemesByFrozenIds(schemes: EditorScheme[], frozenIds: string[]): EditorScheme[] {
  const byId = new Map(schemes.map((scheme) => [scheme.id, scheme]))
  const ordered: EditorScheme[] = []
  const seen = new Set<string>()
  for (const id of frozenIds) {
    const scheme = byId.get(id)
    if (!scheme || seen.has(id)) continue
    ordered.push(scheme)
    seen.add(id)
  }
  for (const scheme of schemes) {
    if (seen.has(scheme.id)) continue
    ordered.push(scheme)
    seen.add(scheme.id)
  }
  return ordered
}

/** 按最近使用排序的方案列表：工具带的固定位置和「更多」都用它。 */
export function orderSchemesByRecent(library: EditorSchemeLibrary): EditorScheme[] {
  return orderSchemesByFrozenIds(library.schemes, orderSchemeIds(library))
}

/** 选中某个方案：它成为当前方案，同时挪到最近顺序的最前面。 */
export function markSchemeUsed(library: EditorSchemeLibrary, id: string): EditorSchemeLibrary {
  if (!library.schemes.some((scheme) => scheme.id === id)) return library
  return {
    ...library,
    activeId: id,
    recentIds: [id, ...library.recentIds.filter((entry) => entry !== id)],
  }
}

/** 新建方案时把它插到最前面，并保持当前方案指向它。 */
export function markSchemeAdded(library: EditorSchemeLibrary, id: string): EditorSchemeLibrary {
  return {
    ...library,
    activeId: id,
    recentIds: [id, ...library.recentIds.filter((entry) => entry !== id)],
  }
}

export { DEFAULT_SCHEME_ID }
