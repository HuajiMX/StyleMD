import type { ComputedTableLayout, DocumentDefaults, PageSetup, StyleTheme, TableSpec } from './types'
import { CURRENT_SCHEMA_VERSION } from './types'
import { fontSlotsFromChain } from './fonts'

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
  header: { center: '{title}', distanceMm: 10, fontSizePt: 9, color: '#666666' },
  footer: { center: '{page} / {pages}', distanceMm: 12, fontSizePt: 9, color: '#666666' },
  skipFurnitureOnFirstPage: true,
}

export const DEFAULT_DOCUMENT_DEFAULTS: DocumentDefaults = {
  ...fontSlotsFromChain(DEFAULT_FONT_STACK),
  fontSizePt: 12,
  lineHeight: { mode: 'multiple', value: 1.5 },
  textColor: '#1a1a1a',
  background: '#ffffff',
}

/**
 * 表格版式的默认值：按内容自适应、左对齐、跨页重复标题行，不设最小尺寸、不均分行列。
 * 与旧版渲染结果一致——样式包没写 `document.table` 时，编译器就按这一份来。
 */
export const DEFAULT_TABLE: ComputedTableLayout = {
  widthMode: 'auto',
  minWidthPercent: 0,
  minHeightPt: 0,
  distributeColumns: false,
  distributeRows: false,
  repeatHeaderRow: true,
  align: 'left',
}

/** 把样式包里的残缺表格版式补成一份完整设置（缺省值见 DEFAULT_TABLE）。 */
export function fillTableSpec(spec: TableSpec | undefined): ComputedTableLayout {
  return { ...DEFAULT_TABLE, ...(spec ?? {}) }
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
