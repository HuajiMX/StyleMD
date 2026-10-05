import type { ComputedRoleStyle, FontSlotSpec } from '@stylemd/theme-schema'

/**
 * 字体槽在界面上的读法。
 *
 * 模型里字体现是三个槽（西文 / 中文 / 尾部回退，见 theme-schema 的 `FontSpec`），
 * 值直接存在样式里，不再需要过去那套「从回退链里推导」的换算——
 * 中西文互不干扰正是换槽位换来的。
 */

/** 西文槽用这个文案表示「跟随中文字体」，也就是不单独指定西文。 */
export const FOLLOW_CJK_LABEL = '使用中文字体'

/** 当前生效的三个槽：这一层显式声明过的优先，否则用解析出来的值。 */
export function currentSlots(
  declared: ComputedRoleStyle['declaredFont'] | undefined,
  resolved: ComputedRoleStyle['font'],
): FontSlotSpec {
  return {
    latinFamily: declared?.latinFamily ?? resolved.latinFamily,
    cjkFamily: declared?.cjkFamily ?? resolved.cjkFamily,
    fallbackFamilies: declared?.fallbackFamilies ?? resolved.fallbackFamilies,
  }
}

/** 这一层有没有显式设过字体槽（用来决定表单是否显示成「继承」的灰字态）。 */
export function hasFontSlots(declared: ComputedRoleStyle['declaredFont'] | undefined): boolean {
  if (!declared) return false
  return declared.latinFamily !== undefined || declared.cjkFamily !== undefined || declared.fallbackFamilies !== undefined
}

/**
 * 功能区那个字体框显示什么：优先中文字体；没有中文字体时退回西文，再退回第一个回退家族
 * （代码类角色整条链都是等宽西文，不能显示成空框）。
 */
export function ribbonFontValue(slots: FontSlotSpec): string {
  return slots.cjkFamily || slots.latinFamily || slots.fallbackFamilies[0] || ''
}
