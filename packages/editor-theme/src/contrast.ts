/**
 * WCAG 对比度计算。
 *
 * 这套算术存在的意义是：内置配色能不能看清，不该靠肉眼拍板，而该是一条可测试的断言。
 * 只认 #rrggbb / #rrggbbaa（透明度不参与对比度计算，按最坏情况忽略）。
 */

interface Rgb {
  r: number
  g: number
  b: number
}

/** 解析 #rrggbb / #rrggbbaa，非法返回 null。 */
export function parseHexColor(value: string): Rgb | null {
  if (!/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) return null
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  }
}

function channelToLinear(channel: number): number {
  const scaled = channel / 255
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
}

/** WCAG 相对亮度；无法解析的色值返回 null。 */
export function relativeLuminance(value: string): number | null {
  const rgb = parseHexColor(value)
  if (!rgb) return null
  return (
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b)
  )
}

/** 两个色值的对比度（1–21）；任一无法解析返回 null。 */
export function contrastRatio(a: string, b: string): number | null {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  if (first === null || second === null) return null
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/** 面板里展示用：6.70 -> "6.70:1"。 */
export function formatContrast(ratio: number | null): string {
  return ratio === null ? '—' : `${ratio.toFixed(2)}:1`
}
