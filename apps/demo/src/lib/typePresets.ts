/**
 * 排印用的常识表：中文字号名、常用字体族、字重档位。
 * 这些不是数据模型的一部分（模型只认 pt / 字体名），所以留在界面层。
 */

/** 中文字号名 → pt。「三号」「小四」是写论文时真正会用的说法。 */
export const CHINESE_FONT_SIZES: { label: string; pt: number }[] = [
  { label: '初号', pt: 42 },
  { label: '小初', pt: 36 },
  { label: '一号', pt: 26 },
  { label: '小一', pt: 24 },
  { label: '二号', pt: 22 },
  { label: '小二', pt: 18 },
  { label: '三号', pt: 16 },
  { label: '小三', pt: 15 },
  { label: '四号', pt: 14 },
  { label: '小四', pt: 12 },
  { label: '五号', pt: 10.5 },
  { label: '小五', pt: 9 },
  { label: '六号', pt: 7.5 },
  { label: '小六', pt: 6.5 },
]

/** 常用字体族；输入框仍允许任意字体名与逗号回退链。 */
export const FONT_FAMILIES: string[] = [
  'Source Han Serif SC',
  'Source Han Sans SC',
  'Noto Serif SC',
  'Noto Sans SC',
  'SimSun',
  'SimHei',
  'KaiTi',
  'FangSong',
  'Microsoft YaHei',
  'DengXian',
  'Songti SC',
  'PingFang SC',
  'Times New Roman',
  'Cambria',
  'Georgia',
  'Arial',
]

export const FONT_WEIGHTS: { label: string; value: number }[] = [
  { label: '极细 300', value: 300 },
  { label: '常规 400', value: 400 },
  { label: '中等 500', value: 500 },
  { label: '半粗 600', value: 600 },
  { label: '加粗 700', value: 700 },
  { label: '特粗 800', value: 800 },
  { label: '黑体 900', value: 900 },
]

/** 找到与给定 pt 完全相等的字号名，用于回显下拉框。 */
export function chineseSizeName(pt: number | undefined): string {
  if (pt === undefined) return ''
  return CHINESE_FONT_SIZES.find((size) => Math.abs(size.pt - pt) < 0.01)?.label ?? ''
}

/** 显示用：有中文字号的写中文字号，没有的就写数字，不带单位。 */
export function formatFontSize(pt: number): string {
  return chineseSizeName(pt) || String(Number(pt.toFixed(2)))
}

/**
 * 解析用户输入的字号：中文字号（「小四」「小四号」）和数字（12 / 12pt / 12 磅）都收。
 * 解析不出来就返回 null，调用方据此取消这次修改、保持原值。
 */
export function parseFontSize(input: string): number | null {
  const text = input.trim()
  if (!text) return null

  const withoutSuffix = text.endsWith('号') ? text.slice(0, -1) : text
  const named = CHINESE_FONT_SIZES.find((size) => size.label === withoutSuffix)
  if (named) return named.pt

  const matched = /^(\d+(?:\.\d+)?)\s*(?:pt|磅)?$/i.exec(text)
  if (!matched) return null
  const pt = Number(matched[1])
  if (!Number.isFinite(pt) || pt < 4 || pt > 72) return null
  return pt
}

/** 回退链的首选字体，也就是字体框里显示的那一个。 */
export function primaryFamily(chain: string[]): string {
  return chain[0] ?? ''
}

/** 把某个字体设为首选，其余顺序不变、不重复。 */
export function withPrimaryFamily(chain: string[], family: string): string[] {
  return [family, ...chain.filter((item) => item !== family)]
}
