/**
 * 桌面壳（Electron）的宿主能力入口。
 *
 * 浏览器里 `window.stylemdDesktop` 不存在，取到的就是 undefined——界面靠这一点
 * 决定「导出 PDF 是直接存文件还是走打印对话框」。契约的真身在
 * `apps/desktop/src/bridge.ts`，这里只声明渲染进程用得到的那部分，不引 electron 类型。
 */

export interface PdfExportRequest {
  /** `build()` 产物 + 预览外壳（与预览同一份 HTML），导出因此不会和预览漂移。 */
  html: string
  /** 建议文件名的主名（不含扩展名）。 */
  suggestedName: string
}

export type PdfExportResult =
  | { status: 'saved'; filePath: string; bytes: number }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

export interface StyleMdDesktopBridge {
  readonly isDesktop: true
  readonly platform: string
  readonly versions: { electron: string; chrome: string; node: string }
  listFontAliases?: () => Promise<Record<string, string>>
  exportPdf?: (request: PdfExportRequest) => Promise<PdfExportResult>
}

interface DesktopWindow {
  stylemdDesktop?: StyleMdDesktopBridge
}

export function desktopBridge(): StyleMdDesktopBridge | undefined {
  return (window as DesktopWindow).stylemdDesktop
}

/** 桌面壳能直接出 PDF（点一下弹系统保存框）；浏览器里没有这条通道。 */
export function canExportPdfDirectly(): boolean {
  return typeof desktopBridge()?.exportPdf === 'function'
}
