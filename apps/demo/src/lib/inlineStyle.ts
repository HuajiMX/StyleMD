import type { ComputedRoleStyle } from '@stylemd/theme-schema'
import type { CSSProperties } from 'react'

function pt(value: number): string {
  return `${Math.round(value * 1000) / 1000}pt`
}

function borderSide(side: { style?: string; widthPt?: number; color?: string } | undefined): string | undefined {
  if (!side || side.style === 'none') return undefined
  return `${pt(side.widthPt ?? 1)} ${side.style ?? 'solid'} ${side.color ?? '#000000'}`
}

/**
 * 把计算样式转成 React 内联样式，用于样式管理器里的"实时样本"。
 * 这是刻意的重复实现：样本必须走独立于 CSS 编译器的路径，
 * 否则编译器出问题时样本会跟着一起错，用户就失去了对照。
 */
export function computedToInlineStyle(style: ComputedRoleStyle): CSSProperties {
  const css: CSSProperties = {
    fontFamily: style.font.family.join(', '),
    fontSize: pt(style.font.sizePt),
    fontWeight: style.font.weight,
    fontStyle: style.font.italic ? 'italic' : 'normal',
    color: style.font.color,
    textAlign: style.paragraph.align,
    lineHeight: style.paragraph.lineHeight.mode === 'fixed' ? pt(style.paragraph.lineHeight.value) : style.paragraph.lineHeight.value,
    marginBlockStart: pt(style.paragraph.spaceBeforePt),
    marginBlockEnd: pt(style.paragraph.spaceAfterPt),
    textIndent: `${style.paragraph.firstLineIndentChars}em`,
    paddingInlineStart: pt(style.paragraph.indentLeftPt),
    padding: style.paddingPt ? pt(style.paddingPt) : undefined,
    backgroundColor: style.background.color,
  }
  const top = borderSide(style.border.top)
  const right = borderSide(style.border.right)
  const bottom = borderSide(style.border.bottom)
  const left = borderSide(style.border.left)
  if (top) css.borderTop = top
  if (right) css.borderRight = right
  if (bottom) css.borderBottom = bottom
  if (left) css.borderLeft = left
  if (style.border.radiusPt) css.borderRadius = pt(style.border.radiusPt)
  if (style.font.underline) css.textDecoration = 'underline'
  return css
}

/**
 * 样式画廊里的字形样本：只取「看得出差别」的字体属性，并把字号收敛到卡片放得下的范围。
 * 段落的缩进、边框、底色一律不带进来，否则卡片会被撑开；对齐要带，否则「行间公式」这类
 * 靠居中表达自己的角色在卡片里看不出特征。
 */
export function specimenStyle(style: ComputedRoleStyle, maxSizePt = 13): CSSProperties {
  return {
    fontFamily: style.font.family.join(', '),
    fontSize: pt(Math.min(style.font.sizePt, maxSizePt)),
    fontWeight: style.font.weight,
    fontStyle: style.font.italic ? 'italic' : 'normal',
    color: style.font.color,
    letterSpacing: style.font.letterSpacingPt ? pt(style.font.letterSpacingPt) : undefined,
    textDecoration: style.font.underline ? 'underline' : undefined,
    textAlign: style.paragraph.align,
    lineHeight: 1.4,
  }
}

/** 样本文字里的换行在卡片和标题栏里需要压成一行。 */
export function singleLineSample(sample: string): string {
  const flattened = sample.replace(/\s*\n\s*/g, ' · ').trim()
  return flattened.length > 0 ? flattened : '样式样本'
}
