/**
 * 「西文字体 + 中文字体」两个槽落到 CSS 的桥。
 *
 * 只用回退链表达不了「西文用宋体、中文用微软雅黑」——宋体自带中文字形，
 * 排在最前面会把中文一起接管。所以两个槽不同时改用一对 `@font-face`：
 * 同一个家族名、各自 `src: local(...)` 加不同 `unicode-range`，按字符区段分派。
 *
 * `local()` 引用的是**本机已装字体**，不需要打包字体文件；那台机器没装时该 `@font-face`
 * 整体失效，浏览器自然落到 `font-family` 列表里的下一个家族——与普通回退链的行为一致。
 * 预览 iframe 的 CSP（`font-src data:`）不会拦 `local()`，实测过。
 */

/** 转义成 CSS 字符串字面量里的内容（字体名可能带引号或反斜杠）。 */
export function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[<>\u0000-\u001f\u007f]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)
}

/**
 * 拉丁字母、半角标点与常见西文符号。
 * 刻意挖掉 `—`(U+2014) 与 `…`(U+2026)：中文里这两个按习惯走中文字体（Word 也是如此），
 * 它们落在中日韩区段里。
 */
export const LATIN_RANGES = [
  'U+0000-024F',
  'U+1E00-1EFF',
  'U+2000-2013',
  'U+2015-2025',
  'U+2027-206F',
  'U+20A0-20CF',
  'U+2100-214F',
].join(', ')

/** 中日韩字符与全角标点，外加按中文习惯处理的破折号与省略号。 */
export const CJK_RANGES = [
  'U+2014',
  'U+2026',
  'U+2E80-303F',
  'U+3040-30FF',
  'U+31C0-31EF',
  'U+3400-4DBF',
  'U+4E00-9FFF',
  'U+AC00-D7AF',
  'U+F900-FAFF',
  'U+FE30-FE4F',
  'U+FF00-FFEF',
].join(', ')

/** 一条引用本机字体的 @font-face；不给 unicode-range 就覆盖全部字符。 */
export function localFontFace(familyName: string, source: string, unicodeRange?: string): string {
  const range = unicodeRange ? ` unicode-range: ${unicodeRange};` : ''
  return `@font-face { font-family: "${escapeCssString(familyName)}"; src: local("${escapeCssString(source)}");${range} }`
}

export interface FontFamilyPlan {
  /** 需要注入的 @font-face 规则；两个槽相同（或只有一个有效）时为空 */
  faces: string[]
  /** 该写进 font-family 的家族列表，空数组表示这一层没有字体可写 */
  families: string[]
}

/**
 * 两个槽不同时给出「一对 @font-face + 生成家族名」，相同时就是一条普通回退链。
 *
 * 编译产物（`compileCss`）与样式窗口里的字形样本共用它——样本走的是内联样式，
 * 没有编译产物可用，只能自己把这对 `@font-face` 注入宿主文档，
 * 否则样本里的中文会被西文槽那个中文字体接管，和真实预览对不上（踩过）。
 */
export function planFontFamily(slots: FontSlotSpec, faceName: string): FontFamilyPlan {
  const { latinFamily, cjkFamily, fallbackFamilies } = slots
  if (latinFamily && cjkFamily && latinFamily !== cjkFamily) {
    return {
      faces: [localFontFace(faceName, latinFamily, LATIN_RANGES), localFontFace(faceName, cjkFamily, CJK_RANGES)],
      families: [faceName, ...fallbackFamilies],
    }
  }
  return {
    faces: [],
    families: [latinFamily || cjkFamily, ...fallbackFamilies].filter((family) => family.length > 0),
  }
}
import type { FontSlotSpec } from '@stylemd/theme-schema'
