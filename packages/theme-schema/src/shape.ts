/** Runtime checks for JSON input. Unknown keys are retained, known keys are checked recursively. */
type Check = (value: unknown, path: string, errors: string[]) => void

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const string: Check = (v, p, e) => { if (typeof v !== 'string') e.push(`${p}：必须是字符串`) }
const boolean: Check = (v, p, e) => { if (typeof v !== 'boolean') e.push(`${p}：必须是布尔值`) }
const number = (min = -Infinity, positive = false, integer = false): Check => (v, p, e) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || (positive && v === 0) || (integer && !Number.isInteger(v))) {
    e.push(`${p}：必须是有效的${positive ? '正' : ''}${integer ? '整数' : '数字'}（最小值 ${min}）`)
  }
}
const choice = (...values: string[]): Check => (v, p, e) => {
  if (typeof v !== 'string' || !values.includes(v)) e.push(`${p}：取值必须是 ${values.join(' / ')}`)
}
const object = (fields: Record<string, Check>, required: string[] = []): Check => (v, p, e) => {
  if (!isRecord(v)) { e.push(`${p}：必须是对象`); return }
  for (const key of required) if (v[key] === undefined) e.push(`${p}.${key}：缺少必填字段`)
  for (const [key, check] of Object.entries(fields)) if (v[key] !== undefined) check(v[key], `${p}.${key}`, e)
}
const array = (check: Check): Check => (v, p, e) => {
  if (!Array.isArray(v)) { e.push(`${p}：必须是数组`); return }
  v.forEach((entry, i) => check(entry, `${p}[${i}]`, e))
}
// Only color values, never declarations, URLs or markup. Functional notation is numeric only.
const color: Check = (v, p, e) => {
  if (typeof v !== 'string' || !/^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|[a-z]+|(?:rgba?|hsla?)\([\d\s.,%+\-/]+\))$/i.test(v.trim())) {
    e.push(`${p}：必须是颜色值，不能包含样式声明、URL 或 HTML`)
  }
}
/** 回退链可以为空（只要其它槽有字体），但不能有空名字。 */
const fallbackFamilies: Check = (v, p, e) => {
  array(string)(v, p, e)
  if (Array.isArray(v) && v.some((f) => typeof f === 'string' && !f.trim())) e.push(`${p}：回退字体名不能为空`)
}
const lineHeight = object({ mode: choice('fixed', 'multiple'), value: number(0, true) }, ['mode', 'value'])
const borderSide = object({ style: choice('none', 'solid', 'dashed', 'dotted', 'double'), widthPt: number(0), color })
const furniture = object({ left: string, center: string, right: string, distanceMm: number(0), fontSizePt: number(0, true), color, borderTop: borderSide, borderBottom: borderSide })
const font = object({
  latinFamily: string, cjkFamily: string, fallbackFamilies,
  sizePt: number(0, true), weight: number(100), italic: boolean, underline: boolean, color, letterSpacingPt: number(),
})
const paragraph = object({
  align: choice('left', 'center', 'right', 'justify'), lineHeight,
  spaceBeforePt: number(0), spaceAfterPt: number(0), firstLineIndentChars: number(0),
  indentLeftPt: number(0), indentRightPt: number(0), keepWithNext: boolean, pageBreakBefore: boolean,
  widows: number(1, false, true), orphans: number(1, false, true),
})
const role: Check = (v, p, e) => {
  string(v, p, e)
  if (typeof v === 'string' && (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(v) || ['constructor', 'prototype'].includes(v))) {
    e.push(`${p}：角色标识必须由小写字母、数字、点号或短横线组成`)
  }
}
const style = object({
  role, label: string, basedOn: role, font, paragraph,
  border: object({ top: borderSide, right: borderSide, bottom: borderSide, left: borderSide, radiusPt: number(0) }),
  background: object({ color }), paddingPt: number(0),
  numbering: object({ enabled: boolean, pattern: string, color, gapPt: number(0) }),
}, ['role'])
const page = object({
  size: (v, p, e) => typeof v === 'string' ? string(v, p, e) : object({ widthMm: number(0, true), heightMm: number(0, true) }, ['widthMm', 'heightMm'])(v, p, e),
  orientation: choice('portrait', 'landscape'),
  marginMm: object({ top: number(0), right: number(0), bottom: number(0), left: number(0) }, ['top', 'right', 'bottom', 'left']),
  header: furniture, footer: furniture, skipFurnitureOnFirstPage: boolean, background: color,
})
const theme = object({
  schemaVersion: number(1, false, true), id: string, name: string, description: string,
  document: object({
    page,
    defaults: object(
      { latinFamily: string, cjkFamily: string, fallbackFamilies, fontSizePt: number(0, true), lineHeight, textColor: color, background: color },
      ['fontSizePt', 'lineHeight', 'textColor'],
    ),
  }, ['page', 'defaults']),
  styles: array(style),
}, ['schemaVersion', 'id', 'name', 'document', 'styles'])

export function validateShape(value: unknown): string[] {
  const errors: string[] = []
  theme(value, 'theme', errors)
  return errors
}
