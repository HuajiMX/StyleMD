import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'

/**
 * 「导出 PDF」的渲染宿主：把待导出的 HTML 交给一个隐藏窗口跑完 Paged.js 分页，
 * 再用 `printToPDF` 出 PDF。
 *
 * 为什么不复用预览那块 iframe 直接打印：`printToPDF` 打的是整个 webContents，
 * 打不出「只打某一个 iframe」，而预览是嵌在宿主文档里的；走隐藏窗口才能拿到
 * 一份干净的、和预览完全同源的分页结果。
 */

/** 待导出文档在自定义协议里的主机名：`stylemd://export/<token>`。 */
export const EXPORT_HOST = 'export'

/**
 * 分页等待上限。Paged.js 每排一页都要等一帧，长文档本来就慢；
 * 宁可让用户多等一会儿，也不要在排到一半时把半成品打进 PDF。
 */
const PAGINATION_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 100

/**
 * token → 待导出 HTML。用自定义协议而不是 `data:` URL 或临时文件：
 * `data:` URL 有几 MB 的长度上限，临时文件又把「离线导出」写进了磁盘；
 * 走协议则沿用出包那套已经验证过的 MIME 与安全上下文。
 */
const documents = new Map<string, string>()

/**
 * 自定义协议里的 export 分支。返回 null 表示这个请求不归它管（交回文件服务）。
 */
export function serveExportDocument(url: URL): Response | null {
  if (url.hostname !== EXPORT_HOST) return null
  const token = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  const html = documents.get(token)
  if (html === undefined) return new Response('Not found', { status: 404 })
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function renderPdf(scheme: string, html: string): Promise<Buffer> {
  const token = randomUUID()
  documents.set(token, html)
  // 窗口不能 show()（否则每次导出都会闪一个白窗），但必须关掉后台节流：
  // 隐藏窗口的 requestAnimationFrame 会被限流，而 Paged.js 每排一页都要等一帧，
  // 十页的文档会从一秒拖到十几秒——预览那边用「压在显示画布上面」解决的是同一个问题。
  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 1400,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  try {
    await win.loadURL(`${scheme}://${EXPORT_HOST}/${token}`)
    await waitForPagination(win)
    return await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      // 纸张与页边距都由主题编译出的 `@page` 决定（Paged.js 的页眉页脚盒也在里面），
      // Chromium 这一层再叠一次默认页边距，整页内容会整体往里缩一圈。
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })
  } finally {
    documents.delete(token)
    if (!win.isDestroyed()) win.destroy()
  }
}

/** 等预览脚本把 `__stylemdPaged` 从 pending 翻成终态。 */
async function waitForPagination(win: BrowserWindow): Promise<void> {
  const deadline = Date.now() + PAGINATION_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (win.isDestroyed()) throw new Error('导出窗口已关闭')
    const status = (await win.webContents.executeJavaScript(
      'window.__stylemdPaged && window.__stylemdPaged.status',
      true,
    )) as string | null | undefined
    if (status === 'paged') return
    if (status === 'error') throw new Error('文档分页失败')
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new Error('文档分页超时')
}
