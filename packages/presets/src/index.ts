import {
  DEFAULT_FONT_STACK,
  DEFAULT_MONO_STACK,
  DEFAULT_SANS_STACK,
  type StyleTheme,
} from '@stylemd/theme-schema'

const SANS = DEFAULT_SANS_STACK
const SERIF = DEFAULT_FONT_STACK
const MONO = DEFAULT_MONO_STACK

/**
 * 内置预设：既是开箱可用的模板，也是"样式包长什么样"的活文档。
 * 每个预设都必须能被 validateTheme 判为 ok（有单测守着）。
 */

export const techDocumentTheme: StyleTheme = {
  schemaVersion: 1,
  id: 'tech-document',
  name: '技术文档',
  description: '无衬线、紧凑、代码友好，适合接口文档与说明手册。',
  document: {
    page: {
      size: 'A4',
      orientation: 'portrait',
      marginMm: { top: 20, right: 18, bottom: 20, left: 18 },
      header: { center: '{title}', fontSizePt: 9, color: '#8a94a0' },
      footer: { right: '{page} / {pages}', fontSizePt: 9, color: '#8a94a0' },
      skipFurnitureOnFirstPage: true,
    },
    defaults: {
      fontFamily: SANS,
      fontSizePt: 11,
      lineHeight: { mode: 'multiple', value: 1.6 },
      textColor: '#1f2328',
      background: '#ffffff',
    },
  },
  styles: [
    { role: 'body.text', paragraph: { spaceAfterPt: 8, align: 'left' } },
    {
      role: 'heading.1',
      basedOn: 'body.text',
      font: { family: SANS, sizePt: 20, weight: 700, color: '#0b3d91' },
      paragraph: { spaceBeforePt: 22, spaceAfterPt: 12, keepWithNext: true },
      border: { bottom: { style: 'solid', widthPt: 1, color: '#d0d7de' } },
    },
    {
      role: 'heading.2',
      basedOn: 'body.text',
      font: { family: SANS, sizePt: 16, weight: 600, color: '#0b3d91' },
      paragraph: { spaceBeforePt: 16, spaceAfterPt: 8, keepWithNext: true },
    },
    {
      role: 'heading.3',
      basedOn: 'body.text',
      font: { family: SANS, sizePt: 13.5, weight: 600 },
      paragraph: { spaceBeforePt: 14, spaceAfterPt: 6, keepWithNext: true },
    },
    {
      role: 'heading.4',
      basedOn: 'body.text',
      font: { family: SANS, sizePt: 12, weight: 600 },
      paragraph: { spaceBeforePt: 12, spaceAfterPt: 4, keepWithNext: true },
    },
    { role: 'heading.5', basedOn: 'body.text', font: { family: SANS, sizePt: 11, weight: 600 }, paragraph: { spaceBeforePt: 10, spaceAfterPt: 4, keepWithNext: true } },
    { role: 'heading.6', basedOn: 'body.text', font: { family: SANS, sizePt: 11, weight: 600, color: '#57606a' }, paragraph: { spaceBeforePt: 10, spaceAfterPt: 4, keepWithNext: true } },
    {
      role: 'code.block',
      basedOn: 'body.text',
      font: { family: MONO, sizePt: 9.5, color: '#24292f' },
      paragraph: { lineHeight: { mode: 'fixed', value: 14 }, spaceAfterPt: 10 },
      background: { color: '#f6f8fa' },
      border: {
        top: { style: 'solid', widthPt: 1, color: '#d0d7de' },
        right: { style: 'solid', widthPt: 1, color: '#d0d7de' },
        bottom: { style: 'solid', widthPt: 1, color: '#d0d7de' },
        left: { style: 'solid', widthPt: 1, color: '#d0d7de' },
        radiusPt: 4,
      },
      paddingPt: 8,
    },
    { role: 'code.inline', font: { family: MONO, sizePt: 9.5, color: '#a40e26' }, background: { color: '#f0f2f5' }, paddingPt: 1 },
    {
      role: 'blockquote',
      basedOn: 'body.text',
      font: { color: '#57606a' },
      paragraph: { indentLeftPt: 12, spaceAfterPt: 10 },
      border: { left: { style: 'solid', widthPt: 3, color: '#d0d7de' } },
    },
    { role: 'list.unordered', basedOn: 'body.text', paragraph: { indentLeftPt: 18, spaceAfterPt: 6, lineHeight: { mode: 'multiple', value: 1.5 } } },
    { role: 'list.ordered', basedOn: 'body.text', paragraph: { indentLeftPt: 18, spaceAfterPt: 6, lineHeight: { mode: 'multiple', value: 1.5 } } },
    { role: 'list.item', basedOn: 'body.text', paragraph: { spaceAfterPt: 4 } },
    {
      role: 'table',
      paragraph: { spaceAfterPt: 12, lineHeight: { mode: 'multiple', value: 1.4 } },
      border: {
        top: { style: 'solid', widthPt: 0.75, color: '#d8dee4' },
        right: { style: 'solid', widthPt: 0.75, color: '#d8dee4' },
        bottom: { style: 'solid', widthPt: 0.75, color: '#d8dee4' },
        left: { style: 'solid', widthPt: 0.75, color: '#d8dee4' },
      },
    },
    {
      role: 'table.header',
      font: { sizePt: 10, weight: 600 },
      background: { color: '#f6f8fa' },
      paragraph: { align: 'left' },
      paddingPt: 6,
      border: { bottom: { style: 'solid', widthPt: 1, color: '#d0d7de' } },
    },
    { role: 'table.cell', font: { sizePt: 10 }, paragraph: { align: 'left' }, paddingPt: 6 },
    { role: 'table.caption', font: { sizePt: 10, weight: 600, color: '#57606a' }, paragraph: { align: 'left', spaceAfterPt: 6 } },
    { role: 'figure.caption', font: { sizePt: 9.5, color: '#57606a' }, paragraph: { align: 'center', spaceBeforePt: 4, spaceAfterPt: 12 } },
    { role: 'divider', border: { bottom: { style: 'solid', widthPt: 1, color: '#d8dee4' } }, paragraph: { spaceBeforePt: 12, spaceAfterPt: 12 } },
    { role: 'inline.link', font: { color: '#0969da', underline: true } },
    { role: 'inline.strong', font: { weight: 600, color: '#0f1b2d' } },
    { role: 'inline.emphasis', font: { italic: true } },
    {
      role: 'abstract',
      font: { sizePt: 10.5, color: '#3d4753' },
      paragraph: { indentLeftPt: 10, spaceAfterPt: 8 },
      background: { color: '#f6f8fa' },
      border: { left: { style: 'solid', widthPt: 3, color: '#0969da' } },
      paddingPt: 10,
    },
    { role: 'keywords', font: { sizePt: 10.5, color: '#3d4753' }, paragraph: { indentLeftPt: 10, spaceAfterPt: 12 } },
    { role: 'reference.item', font: { sizePt: 10 }, paragraph: { spaceAfterPt: 6, lineHeight: { mode: 'multiple', value: 1.45 } } },
    { role: 'image', paragraph: { align: 'center', spaceBeforePt: 6, spaceAfterPt: 2 } },
    { role: 'page.header', font: { sizePt: 9, color: '#8a94a0' }, paragraph: { align: 'center' } },
    { role: 'page.footer', font: { sizePt: 9, color: '#8a94a0' }, paragraph: { align: 'right' } },
  ],
}

export const thesisTheme: StyleTheme = {
  schemaVersion: 1,
  id: 'thesis-cn',
  name: '中文学位论文',
  description: '宋体正文、黑体标题、首行缩进 2 字符、三线表、固定行距 22 磅。',
  document: {
    page: {
      size: 'A4',
      orientation: 'portrait',
      marginMm: { top: 30, right: 25, bottom: 25, left: 30 },
      header: { center: '{title}', fontSizePt: 9, color: '#333333', borderBottom: { style: 'solid', widthPt: 0.5, color: '#999999' } },
      footer: { center: '{page}', fontSizePt: 10, color: '#333333' },
      skipFurnitureOnFirstPage: true,
    },
    defaults: {
      fontFamily: SERIF,
      fontSizePt: 12,
      lineHeight: { mode: 'fixed', value: 22 },
      textColor: '#000000',
      background: '#ffffff',
    },
  },
  styles: [
    { role: 'body.text', paragraph: { firstLineIndentChars: 2, align: 'justify', spaceAfterPt: 0 } },
    {
      role: 'heading.1',
      basedOn: 'body.text',
      font: { family: SANS, sizePt: 18, weight: 700, color: '#000000' },
      paragraph: { align: 'center', spaceBeforePt: 24, spaceAfterPt: 18, keepWithNext: true, pageBreakBefore: true, firstLineIndentChars: 0 },
      numbering: { enabled: true, pattern: '第{n}章', gapPt: 6 },
    },
    {
      role: 'heading.2',
      basedOn: 'body.text',
      font: { family: SANS, sizePt: 16, weight: 700 },
      paragraph: { align: 'left', spaceBeforePt: 18, spaceAfterPt: 12, keepWithNext: true, firstLineIndentChars: 0 },
      numbering: { enabled: true, pattern: '{n}.', gapPt: 6 },
    },
    {
      role: 'heading.3',
      basedOn: 'body.text',
      font: { family: SANS, sizePt: 14, weight: 700 },
      paragraph: { align: 'left', spaceBeforePt: 12, spaceAfterPt: 6, keepWithNext: true, firstLineIndentChars: 0 },
      numbering: { enabled: true, pattern: '{n}.', gapPt: 6 },
    },
    { role: 'heading.4', basedOn: 'body.text', font: { family: SANS, sizePt: 12, weight: 700 }, paragraph: { align: 'left', spaceBeforePt: 6, spaceAfterPt: 6, keepWithNext: true, firstLineIndentChars: 0 } },
    { role: 'heading.5', basedOn: 'body.text', font: { family: SANS, sizePt: 12, weight: 700 }, paragraph: { firstLineIndentChars: 0, keepWithNext: true } },
    { role: 'heading.6', basedOn: 'body.text', font: { family: SANS, sizePt: 10.5, weight: 700 }, paragraph: { firstLineIndentChars: 0, keepWithNext: true } },
    {
      role: 'table',
      paragraph: { spaceBeforePt: 6, spaceAfterPt: 12, lineHeight: { mode: 'multiple', value: 1.3 } },
      border: {
        top: { style: 'solid', widthPt: 1.5, color: '#000000' },
        bottom: { style: 'solid', widthPt: 1.5, color: '#000000' },
      },
    },
    {
      role: 'table.header',
      font: { sizePt: 10.5, weight: 600 },
      paragraph: { align: 'center' },
      paddingPt: 4,
      border: { bottom: { style: 'solid', widthPt: 0.75, color: '#000000' } },
    },
    { role: 'table.cell', font: { sizePt: 10.5 }, paragraph: { align: 'center' }, paddingPt: 4 },
    { role: 'table.caption', font: { sizePt: 10.5, weight: 600 }, paragraph: { align: 'center', spaceAfterPt: 6, firstLineIndentChars: 0 } },
    { role: 'figure.caption', font: { sizePt: 10.5 }, paragraph: { align: 'center', spaceBeforePt: 6, spaceAfterPt: 12, firstLineIndentChars: 0 } },
    {
      role: 'code.block',
      basedOn: 'body.text',
      font: { family: MONO, sizePt: 9 },
      paragraph: { lineHeight: { mode: 'fixed', value: 13 }, spaceAfterPt: 8, firstLineIndentChars: 0 },
      background: { color: '#f7f7f7' },
      border: { left: { style: 'solid', widthPt: 2, color: '#cccccc' } },
      paddingPt: 6,
    },
    { role: 'code.inline', font: { family: MONO, sizePt: 10.5 } },
    { role: 'blockquote', basedOn: 'body.text', font: { sizePt: 10.5, color: '#333333' }, paragraph: { indentLeftPt: 24, spaceAfterPt: 8, firstLineIndentChars: 0 } },
    { role: 'list.unordered', basedOn: 'body.text', paragraph: { indentLeftPt: 24, spaceAfterPt: 0, firstLineIndentChars: 0 } },
    { role: 'list.ordered', basedOn: 'body.text', paragraph: { indentLeftPt: 24, spaceAfterPt: 0, firstLineIndentChars: 0 } },
    { role: 'list.item', basedOn: 'body.text', paragraph: { firstLineIndentChars: 0 } },
    { role: 'abstract', font: { sizePt: 10.5 }, paragraph: { firstLineIndentChars: 2, align: 'justify' }, paddingPt: 0 },
    { role: 'keywords', font: { sizePt: 10.5 }, paragraph: { firstLineIndentChars: 2, spaceAfterPt: 12 } },
    { role: 'reference.item', font: { sizePt: 10.5 }, paragraph: { firstLineIndentChars: 0, spaceAfterPt: 4, lineHeight: { mode: 'fixed', value: 18 } } },
    { role: 'divider', border: { bottom: { style: 'solid', widthPt: 0.5, color: '#999999' } }, paragraph: { spaceBeforePt: 12, spaceAfterPt: 12 } },
    { role: 'inline.link', font: { color: '#000000', underline: true } },
    { role: 'inline.strong', font: { weight: 700 } },
    { role: 'inline.emphasis', font: { italic: true } },
    { role: 'image', paragraph: { align: 'center', spaceBeforePt: 6, spaceAfterPt: 2 } },
    { role: 'page.header', font: { sizePt: 9, color: '#333333' }, paragraph: { align: 'center' } },
    { role: 'page.footer', font: { sizePt: 10, color: '#333333' }, paragraph: { align: 'center' } },
  ],
}

export const BUILT_IN_THEMES: StyleTheme[] = [techDocumentTheme, thesisTheme]

export function getBuiltInTheme(id: string): StyleTheme | undefined {
  const theme = BUILT_IN_THEMES.find((candidate) => candidate.id === id)
  return theme ? structuredClone(theme) : undefined
}
