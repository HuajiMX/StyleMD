import { DEFAULT_DOCUMENT_DEFAULTS, DEFAULT_PAGE } from './defaults'
import { CURRENT_SCHEMA_VERSION, type StyleTheme } from './types'
import { validateTheme } from './validate'

export interface MigrationResult {
  theme: StyleTheme
  /** 迁移过程中的说明，UI 需要原样展示给用户。 */
  notes: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 把任意来源（文件、剪贴板、旧版本）的 JSON 归一化成当前 schema 的样式包。
 *
 * 原则：
 *  - 缺字段补默认值，而不是直接失败（用户不该因为少一个 color 就打不开文件）；
 *  - 版本高于当前支持范围时明确报错，不做猜测；
 *  - 未知字段原样保留在 styles 条目中，保证向前兼容。
 */
export function migrateTheme(raw: unknown): MigrationResult {
  const notes: string[] = []
  if (!isPlainObject(raw)) {
    throw new Error('样式包必须是 JSON 对象')
  }

  const version = raw.schemaVersion === undefined ? CURRENT_SCHEMA_VERSION : raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new Error('schemaVersion 必须是正整数')
  if (raw.schemaVersion === undefined) {
    notes.push(`样式包未声明 schemaVersion，按当前版本 ${CURRENT_SCHEMA_VERSION} 处理`)
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `样式包由更新版本的 StyleMD 创建（schemaVersion=${version}，当前支持 ${CURRENT_SCHEMA_VERSION}）`,
    )
  }

  // 迁移链：未来新增版本时在此逐级升级，例如
  // if (version < 2) { raw = migrateV1ToV2(raw); notes.push('已从 v1 升级到 v2'); version = 2 }

  for (const key of ['document', 'styles']) {
    if (raw[key] !== undefined && (key === 'styles' ? !Array.isArray(raw[key]) : !isPlainObject(raw[key]))) throw new Error(`${key} 格式不正确`)
  }
  const document = isPlainObject(raw.document) ? raw.document : {}
  for (const key of ['page', 'defaults']) {
    if (document[key] !== undefined && !isPlainObject(document[key])) throw new Error(`document.${key} 必须是对象`)
  }
  const page = isPlainObject(document.page) ? document.page : {}
  const defaults = isPlainObject(document.defaults) ? document.defaults : {}
  const styles = Array.isArray(raw.styles) ? raw.styles : []

  if (!Array.isArray(raw.styles)) {
    notes.push('样式包缺少 styles 数组，已按空样式处理')
  }

  const theme: StyleTheme = {
    ...structuredClone(raw),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: typeof raw.id === 'string' && raw.id ? raw.id : 'imported',
    name: typeof raw.name === 'string' && raw.name ? raw.name : '导入的样式包',
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    document: {
      ...document,
      page: {
        ...structuredClone(DEFAULT_PAGE), ...(page as StyleTheme['document']['page']),
        ...(isPlainObject(page.marginMm) ? { marginMm: { ...DEFAULT_PAGE.marginMm!, ...page.marginMm } } : {}),
      },
      defaults: {
        ...structuredClone(DEFAULT_DOCUMENT_DEFAULTS),
        ...(defaults as Partial<StyleTheme['document']['defaults']>),
        ...(isPlainObject(defaults.lineHeight)
          ? { lineHeight: { ...DEFAULT_DOCUMENT_DEFAULTS.lineHeight, ...defaults.lineHeight } }
          : {}),
      },
    },
    styles: structuredClone(styles) as StyleTheme['styles'],
  }

  const validation = validateTheme(theme)
  if (!validation.ok) throw new Error(`样式包校验失败：${validation.errors.join('；')}`)
  return { theme, notes }
}
