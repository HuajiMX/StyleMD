import {
  MAX_SCHEME_COUNT,
  MAX_SCHEME_ID_LENGTH,
  MAX_SCHEME_NAME_LENGTH,
  TOKEN_NAMES,
  type EditorTokenName,
} from './types'

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

const COLOR_PATTERN = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 色值白名单：只认 #rrggbb / #rrggbbaa。
 *
 * 这条限制是安全边界，不只是格式洁癖——色值最终会写进 CSS 自定义属性，
 * 一旦允许函数式颜色或任意字符串，`url(...)` 与分号就能夹带进来做样式注入
 * （仓库 2026-10-01 的审查修过同类问题）。
 */
export function isSchemeColor(value: unknown): value is string {
  return typeof value === 'string' && COLOR_PATTERN.test(value)
}

export function isSchemeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_SCHEME_ID_LENGTH && ID_PATTERN.test(value)
}

export function validateScheme(value: unknown): ValidationResult {
  const errors: string[] = []
  if (!isPlainObject(value)) {
    return { ok: false, errors: ['配色方案必须是一个对象'] }
  }

  if (!isSchemeId(value.id)) {
    errors.push(`方案 id 非法：${String(value.id)}（只允许小写字母、数字、短横线，且不超过 ${MAX_SCHEME_ID_LENGTH} 字符）`)
  }
  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    errors.push('方案名不能为空')
  } else if (value.name.length > MAX_SCHEME_NAME_LENGTH) {
    errors.push(`方案名不能超过 ${MAX_SCHEME_NAME_LENGTH} 个字符`)
  }
  if (value.builtIn !== undefined && typeof value.builtIn !== 'boolean') {
    errors.push('builtIn 必须是布尔值')
  }
  if (value.basedOn !== undefined && !isSchemeId(value.basedOn)) {
    errors.push(`basedOn 非法：${String(value.basedOn)}`)
  }

  if (!isPlainObject(value.tokens)) {
    errors.push('配色方案缺少 tokens')
    return { ok: false, errors }
  }

  for (const key of Object.keys(value.tokens)) {
    if (!TOKEN_NAMES.includes(key as EditorTokenName)) errors.push(`未知色槽：${key}`)
  }
  for (const name of TOKEN_NAMES) {
    const color = value.tokens[name]
    if (color === undefined) {
      errors.push(`缺少色槽：${name}`)
      continue
    }
    if (!isSchemeColor(color)) {
      errors.push(`色槽 ${name} 必须是 #rrggbb 或 #rrggbbaa 形式：${String(color)}`)
    }
  }

  return { ok: errors.length === 0, errors }
}

export function validateSchemeLibrary(value: unknown): ValidationResult {
  const errors: string[] = []
  if (!isPlainObject(value)) return { ok: false, errors: ['配色方案库必须是一个对象'] }
  if (value.schemaVersion !== 1) errors.push(`不支持的版本：${String(value.schemaVersion)}`)
  if (typeof value.activeId !== 'string') errors.push('activeId 必须是字符串')
  if (!Array.isArray(value.recentIds)) {
    errors.push('recentIds 必须是数组')
  }
  if (!Array.isArray(value.schemes)) {
    errors.push('schemes 必须是数组')
    return { ok: false, errors }
  }
  if (value.schemes.length > MAX_SCHEME_COUNT) errors.push(`方案数量不能超过 ${MAX_SCHEME_COUNT}`)

  const seen = new Set<string>()
  value.schemes.forEach((scheme, index) => {
    const result = validateScheme(scheme)
    for (const error of result.errors) errors.push(`第 ${index + 1} 个方案：${error}`)
    if (isPlainObject(scheme) && typeof scheme.id === 'string') {
      if (seen.has(scheme.id)) errors.push(`方案 id 重复：${scheme.id}`)
      seen.add(scheme.id)
    }
  })

  if (typeof value.activeId === 'string' && !seen.has(value.activeId)) {
    errors.push(`activeId 指向不存在的方案：${value.activeId}`)
  }

  if (Array.isArray(value.recentIds)) {
    const recentSeen = new Set<string>()
    for (const id of value.recentIds) {
      if (typeof id !== 'string') {
        errors.push('recentIds 里必须是方案 id 字符串')
        continue
      }
      if (!seen.has(id)) errors.push(`recentIds 指向不存在的方案：${id}`)
      if (recentSeen.has(id)) errors.push(`recentIds 里重复出现：${id}`)
      recentSeen.add(id)
    }
  }

  return { ok: errors.length === 0, errors }
}
