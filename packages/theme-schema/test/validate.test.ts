import { describe, expect, it } from 'vitest'
import { createEmptyTheme, validateTheme, type RoleStyle } from '@stylemd/theme-schema'

function withStyles(styles: RoleStyle[]) {
  return { ...createEmptyTheme(), styles }
}

describe('validateTheme', () => {
  it('空样式包是合法的', () => {
    expect(validateTheme(createEmptyTheme()).ok).toBe(true)
  })

  it('重复定义同一角色是错误', () => {
    const result = validateTheme(withStyles([{ role: 'body.text' }, { role: 'body.text' }]))
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('定义了多次')
  })

  it('继承成环是错误，并在报错里给出链路', () => {
    const result = validateTheme(
      withStyles([
        { role: 'heading.1', basedOn: 'heading.2' },
        { role: 'heading.2', basedOn: 'heading.1' },
      ]),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('成环')
    expect(result.errors.join()).toContain('heading.1')
  })

  it('跨类别继承是错误，但允许基于「正文段落」', () => {
    const crossCategory = validateTheme(withStyles([{ role: 'heading.1', basedOn: 'table.cell' }]))
    expect(crossCategory.ok).toBe(false)
    expect(crossCategory.errors.join()).toContain('跨类别继承')

    const basedOnBody = validateTheme(withStyles([{ role: 'heading.1', basedOn: 'body.text' }]))
    expect(basedOnBody.ok).toBe(true)
  })

  it('未知角色只警告不报错（向前兼容）', () => {
    const result = validateTheme(withStyles([{ role: 'future.role' }]))
    expect(result.ok).toBe(true)
    expect(result.warnings.join()).toContain('未知角色')
  })

  it('负数间距与非法字号会被拦下', () => {
    const result = validateTheme(
      withStyles([
        { role: 'body.text', font: { sizePt: 0 }, paragraph: { spaceBeforePt: -4 } },
      ]),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('font.sizePt')
    expect(result.errors.join()).toContain('paragraph.spaceBeforePt')
  })

  it('来自更新版本的样式包会被拒绝', () => {
    const theme = { ...createEmptyTheme(), schemaVersion: 99 }
    const result = validateTheme(theme)
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('更新版本')
  })
})
