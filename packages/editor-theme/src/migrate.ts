import { BUILT_IN_SCHEMES, defaultToken, isBuiltInSchemeId } from './presets'
import {
  DEFAULT_SCHEME_ID,
  EDITOR_SCHEME_SCHEMA_VERSION,
  TOKEN_NAMES,
  type EditorScheme,
  type EditorSchemeLibrary,
  type EditorSchemeTokens,
  type EditorTokenName,
} from './types'
import { isSchemeColor, isSchemeId } from './validate'

export interface MigrateResult {
  library: EditorSchemeLibrary
  /** 迁移过程中做过的调整，供调用方提示或打日志。 */
  notes: string[]
}

/**
 * 把「可能是旧版本、可能被手改坏」的存档整形成当前版本。
 *
 * 与 theme-schema 的策略一致：能救的救（补缺色槽、修 id），救不了的直接抛错交给调用方回落，
 * 不做「猜一份默认值硬顶上」的静默兜底。坏档由调用方当成「没有存档」处理。
 */
export function migrateSchemeLibrary(raw: unknown): MigrateResult {
  const notes: string[] = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('配色方案库不是一个对象')
  }
  const input = raw as Record<string, unknown>

  const version = input.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new Error('配色方案库缺少合法的 schemaVersion')
  }
  if (version > EDITOR_SCHEME_SCHEMA_VERSION) {
    throw new Error(`配色方案库版本 ${version} 高于当前支持的 ${EDITOR_SCHEME_SCHEMA_VERSION}`)
  }

  if (!Array.isArray(input.schemes)) throw new Error('配色方案库缺少 schemes 数组')

  const schemes: EditorScheme[] = []
  const taken = new Set<string>()
  for (const entry of input.schemes) {
    const scheme = migrateScheme(entry, taken, notes)
    if (scheme) {
      schemes.push(scheme)
      taken.add(scheme.id)
    }
  }

  // 内置方案永远在库里，即使存档里一个都没有——否则用户会把界面调成「没有配色可选」。
  for (const builtIn of BUILT_IN_SCHEMES) {
    if (!taken.has(builtIn.id)) {
      schemes.push({ ...builtIn, tokens: { ...builtIn.tokens } })
      taken.add(builtIn.id)
    }
  }

  const requestedActive = typeof input.activeId === 'string' ? input.activeId : ''
  const activeId = taken.has(requestedActive) ? requestedActive : DEFAULT_SCHEME_ID
  if (requestedActive && requestedActive !== activeId) {
    notes.push(`当前配色方案 ${requestedActive} 不存在，已回落到 ${DEFAULT_SCHEME_ID}`)
  }

  // 最近顺序：先按存档里记的排，剩下的按方案顺序补齐。老存档没有这个字段时，
  // 就等于「按方案顺序」，不会因为升级丢提示。
  const recentIds: string[] = []
  const known = new Set(schemes.map((scheme) => scheme.id))
  const recorded = Array.isArray(input.recentIds) ? input.recentIds : []
  for (const id of recorded) {
    if (typeof id !== 'string' || !known.has(id) || recentIds.includes(id)) continue
    recentIds.push(id)
  }
  // 当前在用的方案就是「最近用过的那一个」，排到最前面。
  for (const id of [activeId, ...schemes.map((scheme) => scheme.id)]) {
    if (known.has(id) && !recentIds.includes(id)) recentIds.push(id)
  }

  return { library: { schemaVersion: EDITOR_SCHEME_SCHEMA_VERSION, activeId, schemes, recentIds }, notes }
}

function migrateScheme(value: unknown, taken: Set<string>, notes: string[]): EditorScheme | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    notes.push('丢弃了一个不是对象的配色方案')
    return null
  }
  const input = value as Record<string, unknown>

  let id = isSchemeId(input.id) ? input.id : ''
  if (!id) {
    notes.push('丢弃了一个 id 非法的配色方案')
    return null
  }
  // 内置方案由代码里的 BUILT_IN_SCHEMES 提供，存档里那份只是镜像。
  // 不忽略的话，每次「读出来再存回去」都会把它复制成一个同名的自定义方案，越滚越多。
  if (input.builtIn === true && isBuiltInSchemeId(id)) return null
  if (isBuiltInSchemeId(id) || taken.has(id)) {
    const renamed = nextFreeId(id, taken)
    notes.push(`配色方案 ${id} 的 id 与已有方案冲突，已改名为 ${renamed}`)
    id = renamed
  }

  const rawTokens = typeof input.tokens === 'object' && input.tokens !== null ? (input.tokens as Record<string, unknown>) : {}
  const tokens = {} as EditorSchemeTokens
  for (const name of TOKEN_NAMES) {
    const color = rawTokens[name]
    if (isSchemeColor(color)) {
      tokens[name] = color.toLowerCase()
    } else {
      if (color !== undefined) notes.push(`配色方案 ${id} 的 ${name} 色值非法，已用默认值补齐`)
      tokens[name as EditorTokenName] = defaultToken(name)
    }
  }
  for (const key of Object.keys(rawTokens)) {
    if (!TOKEN_NAMES.includes(key as EditorTokenName)) notes.push(`配色方案 ${id} 丢弃了未知色槽 ${key}`)
  }

  const rawName = typeof input.name === 'string' ? input.name.trim() : ''
  const basedOn = typeof input.basedOn === 'string' && isSchemeId(input.basedOn) ? input.basedOn : undefined
  return {
    id,
    name: (rawName || '未命名配色').slice(0, 24),
    builtIn: false,
    basedOn,
    tokens,
  }
}

function nextFreeId(base: string, taken: Set<string>): string {
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`
    if (!taken.has(candidate) && !isBuiltInSchemeId(candidate) && isSchemeId(candidate)) return candidate
  }
  return `scheme-${Date.now()}`
}
