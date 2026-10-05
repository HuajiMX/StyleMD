import { DEFAULT_DOCUMENT_DEFAULTS, DEFAULT_PAGE, PAGE_SIZES_MM } from './defaults'
import { isKnownRole, roleCategory } from './roles'
import { CURRENT_SCHEMA_VERSION, type RoleStyle, type StyleTheme } from './types'
import { validateShape } from './shape'

export interface ThemeValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|transparent|rgb\(|rgba\(|hsl\(|hsla\(|[a-z]+)$/

function checkColor(color: string | undefined, where: string, out: ThemeValidationResult): void {
  if (color === undefined) return
  if (typeof color !== 'string' || !COLOR_PATTERN.test(color.trim())) {
    out.warnings.push(`${where}：颜色值「${String(color)}」不是可识别的颜色，将原样输出到 CSS`)
  }
}

function checkNonNegative(value: number | undefined, where: string, out: ThemeValidationResult): void {
  if (value === undefined) return
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    out.errors.push(`${where}：必须是不小于 0 的数字，当前为 ${String(value)}`)
  }
}

/** 找出样式之间的循环继承链，例如 a → b → a。 */
function findInheritanceCycle(styles: Map<string, RoleStyle>): string[] | null {
  for (const start of styles.keys()) {
    const seen: string[] = []
    let current: string | undefined = start
    while (current !== undefined) {
      if (seen.includes(current)) return [...seen, current]
      seen.push(current)
      current = styles.get(current)?.basedOn
    }
  }
  return null
}

/**
 * 校验样式包。errors 会阻止加载，warnings 仅提示。
 * 规则来自规划 §8「样式生效优先级」与 §12 风险清单。
 */
export function validateTheme(raw: unknown): ThemeValidationResult {
  const out: ThemeValidationResult = { ok: true, errors: [], warnings: [] }
  const shapeErrors = validateShape(raw)
  if (shapeErrors.length) return { ok: false, errors: shapeErrors, warnings: [] }
  const theme = raw as StyleTheme

  if (typeof theme !== 'object' || theme === null) {
    out.errors.push('样式包必须是 JSON 对象')
    out.ok = false
    return out
  }

  if (typeof theme.schemaVersion !== 'number' || !Number.isInteger(theme.schemaVersion)) {
    out.errors.push('schemaVersion 必须是整数')
  } else if (theme.schemaVersion > CURRENT_SCHEMA_VERSION) {
    out.errors.push(
      `样式包由更新版本的 StyleMD 创建（schemaVersion=${theme.schemaVersion}，当前支持 ${CURRENT_SCHEMA_VERSION}），请升级后再打开`,
    )
  }

  if (!theme.id) out.errors.push('缺少样式包 id')
  if (!theme.name) out.errors.push('缺少样式包 name')

  const page = theme.document?.page ?? DEFAULT_PAGE
  const defaults = theme.document?.defaults ?? DEFAULT_DOCUMENT_DEFAULTS

  if (typeof page.size === 'string' && !Object.hasOwn(PAGE_SIZES_MM, page.size)) {
    out.warnings.push(`未知纸张规格「${page.size}」，将回退到 A4`)
  }
  if (page.marginMm) {
    for (const [side, value] of Object.entries(page.marginMm)) {
      checkNonNegative(value, `页边距 ${side}`, out)
    }
    const size = typeof page.size === 'object' ? page.size : PAGE_SIZES_MM[typeof page.size === 'string' && Object.hasOwn(PAGE_SIZES_MM, page.size) ? page.size : 'A4']!
    const width = page.orientation === 'landscape' ? size.heightMm : size.widthMm
    const height = page.orientation === 'landscape' ? size.widthMm : size.heightMm
    if (page.marginMm.left + page.marginMm.right >= width || page.marginMm.top + page.marginMm.bottom >= height) {
      out.errors.push('页边距总和必须小于纸张尺寸，正文区域不能为空')
    }
  }

  if (!defaults.latinFamily && !defaults.cjkFamily && (defaults.fallbackFamilies?.length ?? 0) === 0) {
    out.errors.push('document.defaults 至少要有一个字体槽（latinFamily / cjkFamily / fallbackFamilies）')
  }
  if (typeof defaults.fontSizePt !== 'number' || defaults.fontSizePt <= 0) {
    out.errors.push('document.defaults.fontSizePt 必须大于 0')
  }
  if (!defaults.lineHeight || typeof defaults.lineHeight.value !== 'number' || defaults.lineHeight.value <= 0) {
    out.errors.push('document.defaults.lineHeight.value 必须大于 0')
  }
  checkColor(defaults.textColor, 'document.defaults.textColor', out)

  const styles = Array.isArray(theme.styles) ? theme.styles : []
  if (!Array.isArray(theme.styles)) {
    out.errors.push('styles 必须是数组')
  }

  const byRole = new Map<string, RoleStyle>()
  for (const [index, style] of styles.entries()) {
    const where = `styles[${index}]`
    if (!style || typeof style !== 'object') {
      out.errors.push(`${where} 不是对象`)
      continue
    }
    if (!style.role || typeof style.role !== 'string') {
      out.errors.push(`${where} 缺少 role`)
      continue
    }
    if (byRole.has(style.role)) {
      out.errors.push(`角色「${style.role}」被定义了多次，请合并后再导入`)
      continue
    }
    byRole.set(style.role, style)

    if (!isKnownRole(style.role)) {
      out.warnings.push(`未知角色「${style.role}」，这部分样式不会生效（保留原样以便向前兼容）`)
    }
    if (style.basedOn === style.role) {
      out.errors.push(`角色「${style.role}」不能继承自己`)
    } else if (style.basedOn && !isKnownRole(style.basedOn)) {
      out.warnings.push(`角色「${style.role}」继承自未知角色「${style.basedOn}」，将退回文档默认值`)
    } else if (style.basedOn && style.basedOn !== 'body.text') {
      const from = roleCategory(style.role)
      const to = roleCategory(style.basedOn)
      if (from && to && from !== to) {
        out.errors.push(`不支持跨类别继承：「${style.role}」(${from}) 不能基于「${style.basedOn}」(${to})`)
      }
    }

    if (style.font?.sizePt !== undefined && style.font.sizePt <= 0) {
      out.errors.push(`角色「${style.role}」字号必须大于 0`)
    }
    if (style.font?.weight !== undefined && (style.font.weight < 100 || style.font.weight > 900)) {
      out.errors.push(`角色「${style.role}」字重必须在 100–900 之间`)
    }
    checkColor(style.font?.color, `角色「${style.role}」文字颜色`, out)
    checkColor(style.background?.color, `角色「${style.role}」底纹颜色`, out)
    checkNonNegative(style.paragraph?.spaceBeforePt, `角色「${style.role}」段前间距`, out)
    checkNonNegative(style.paragraph?.spaceAfterPt, `角色「${style.role}」段后间距`, out)
    checkNonNegative(style.paragraph?.firstLineIndentChars, `角色「${style.role}」首行缩进`, out)
    checkNonNegative(style.paragraph?.hangingIndentChars, `角色「${style.role}」悬挂缩进`, out)
    if ((style.paragraph?.firstLineIndentChars ?? 0) > 0 && (style.paragraph?.hangingIndentChars ?? 0) > 0) {
      out.errors.push(`角色「${style.role}」不能同时设置首行缩进与悬挂缩进`)
    }
    checkNonNegative(style.paddingPt, `角色「${style.role}」内边距`, out)
    if (style.paragraph?.lineHeight && style.paragraph.lineHeight.value <= 0) {
      out.errors.push(`角色「${style.role}」行距必须大于 0`)
    }
    for (const [side, border] of Object.entries(style.border ?? {})) {
      if (side === 'radiusPt' || !border) continue
      checkNonNegative((border as { widthPt?: number }).widthPt, `角色「${style.role}」${side} 边框线宽`, out)
      checkColor((border as { color?: string }).color, `角色「${style.role}」${side} 边框颜色`, out)
    }
  }

  const cycle = findInheritanceCycle(byRole)
  if (cycle) {
    out.errors.push(`样式继承成环：${cycle.join(' → ')}`)
  }

  out.ok = out.errors.length === 0
  return out
}
