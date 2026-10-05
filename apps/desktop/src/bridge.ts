/** 「导出 PDF」的入参：渲染进程把与预览同一份 HTML 交给主进程。 */
export interface PdfExportRequest {
  /** `build()` 产物 + 预览外壳（含 Paged.js 分页脚本）；预览与导出共用同一份，两条路径不会漂移。 */
  html: string
  /** 建议文件名的主名（不含扩展名），只用来填系统保存框。 */
  suggestedName: string
}

export type PdfExportResult =
  | { status: 'saved'; filePath: string; bytes: number }
  /** 用户在系统保存框里点了取消。 */
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

/**
 * 桌面壳与渲染进程之间的唯一契约。
 * 主进程、preload、渲染进程都只认这里定义的名字，避免三处各写一份魔法字符串。
 */
export interface StyleMdDesktopBridge {
  /** 恒定 true，渲染进程用它区分「跑在桌面壳里」与「跑在浏览器里」。 */
  readonly isDesktop: true
  readonly platform: string
  readonly versions: { electron: string; chrome: string; node: string }
  /**
   * 英文家族名 → 本地化（中文）名。
   * 字体列表不在这里：渲染进程自己的 `queryLocalFonts()` 就是系统名册。
   */
  listFontAliases(): Promise<Record<string, string>>
  /**
   * 直接出 PDF：主进程在隐藏窗口里跑同一条分页路径，再 `printToPDF` 落盘，
   * 保存位置由系统保存框决定。浏览器版没有这条通道，只能走打印对话框。
   */
  exportPdf(request: PdfExportRequest): Promise<PdfExportResult>
}

/** 挂在 window 上的属性名。 */
export const BRIDGE_KEY = 'stylemdDesktop'

/** IPC 频道名集中在这里，改名字时两端不会走散。 */
export const CHANNELS = {
  listFontAliases: 'stylemd:fonts:aliases',
  exportPdf: 'stylemd:pdf:export',
} as const
