import type { DocumentDefaults, PageSetup, StyleTheme } from './types'
import { CURRENT_SCHEMA_VERSION } from './types'

/** 默认字体链：优先使用可再分发的开源中文字体，再回退到系统字体。 */
export const DEFAULT_FONT_STACK = [
  'Source Han Serif SC',
  'Noto Serif SC',
  'SimSun',
  'Songti SC',
  'Times New Roman',
  'serif',
]

export const DEFAULT_SANS_STACK = [
  'Source Han Sans SC',
  'Noto Sans SC',
  'Microsoft YaHei',
  'PingFang SC',
  'Segoe UI',
  'sans-serif',
]

export const DEFAULT_MONO_STACK = [
  'Cascadia Mono',
  'Consolas',
  'JetBrains Mono',
  'Courier New',
  'monospace',
]

export const DEFAULT_PAGE: PageSetup = {
  size: 'A4',
  orientation: 'portrait',
  marginMm: { top: 25, right: 22, bottom: 25, left: 25 },
  header: { center: '{title}', fontSizePt: 9, color: '#666666' },
  footer: { center: '{page} / {pages}', fontSizePt: 9, color: '#666666' },
  skipFurnitureOnFirstPage: true,
}

export const DEFAULT_DOCUMENT_DEFAULTS: DocumentDefaults = {
  fontFamily: DEFAULT_FONT_STACK,
  fontSizePt: 12,
  lineHeight: { mode: 'multiple', value: 1.5 },
  textColor: '#1a1a1a',
  background: '#ffffff',
}

/**
 * 常用纸张尺寸（mm）。自定义尺寸由 PageSetup.size 直接给出 {widthMm, heightMm}。
 */
export const PAGE_SIZES_MM: Record<string, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  A5: { widthMm: 148, heightMm: 210 },
  B5: { widthMm: 176, heightMm: 250 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
}

export function createEmptyTheme(id = 'untitled', name = '未命名样式包'): StyleTheme {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    name,
    document: {
      page: structuredClone(DEFAULT_PAGE),
      defaults: structuredClone(DEFAULT_DOCUMENT_DEFAULTS),
    },
    styles: [],
  }
}
