import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, protocol, session, shell } from 'electron'
import { CHANNELS } from './bridge'
import { listFontAliases } from './fonts'

/**
 * 打包态用自定义协议喂渲染产物，而不是 loadFile：Vite 产出的是绝对路径
 * （`/assets/...`），走 `file://` 会 404；自定义协议既保住绝对路径，
 * 又让渲染进程待在安全上下文里——`queryLocalFonts()` 以后要靠这一点。
 */
const APP_SCHEME = 'stylemd'

const DEV_SERVER_URL = process.env.STYLEMD_DEV_SERVER ?? ''
const isDev = DEV_SERVER_URL.length > 0

/** 无头自检开关：见 scripts/smoke.mjs。 */
const isSmoke = process.env.STYLEMD_SMOKE === '1'

/**
 * 只放行桌面版确实用得上的能力，其余（摄像头、定位、通知……）一律拒绝。
 * `local-fonts` 是 Chromium 的字体枚举权限：放行之后渲染进程才能用
 * `window.queryLocalFonts()`，拿到的名字才是 Chromium 真正会匹配的那套。
 */
const ALLOWED_PERMISSIONS = new Set(['local-fonts', 'clipboard-sanitized-write'])

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

/**
 * 仓库内运行时是 apps/desktop → apps/demo/dist；将来打成安装包时产物会随
 * resources 走。两个位置都试一遍，谁先找到 index.html 就用谁。
 */
function resolveRendererRoot(): string {
  const repoLayout = path.join(app.getAppPath(), '..', 'demo', 'dist')
  const packaged = path.join(process.resourcesPath ?? '', 'demo', 'dist')
  for (const candidate of [repoLayout, packaged]) {
    if (existsSync(path.join(candidate, 'index.html'))) return path.resolve(candidate)
  }
  return path.resolve(repoLayout)
}

function toArrayBuffer(data: Buffer): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

function registerAppProtocol(): void {
  const root = resolveRendererRoot()
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url)
    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
    // 自己算 MIME 而不是交给 net.fetch(file:)：ES module 对 Content-Type 挑剔，
    // 声明错会让 React 整包被拒收，白屏且只在控制台留一行错。
    const target = path.resolve(root, `.${relative}`)
    if (target !== root && !target.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 })
    }
    try {
      const data = await readFile(target)
      return new Response(toArrayBuffer(data), {
        headers: { 'content-type': MIME_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream' },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function isInternalUrl(url: string): boolean {
  if (isDev && url.startsWith(DEV_SERVER_URL)) return true
  return url.startsWith(`${APP_SCHEME}://`)
}

/**
 * DevTools 必须等窗口显示之后再开：提前 `openDevTools` 会让 `ready-to-show` 不触发，
 * 窗口就永远停在 `show: false`——用户看到的是「命令跑完了，但什么都没出现」。
 * 另配一个兜底定时器，绝不让窗口有「一直不出现」这种失败方式。
 */
function reveal(win: BrowserWindow): void {
  if (isSmoke || win.isDestroyed() || win.isVisible()) return
  win.show()
  if (isDev) win.webContents.openDevTools({ mode: 'detach' })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#f2f3f5',
    show: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  // 文档里的外链交给系统浏览器，壳里不开新窗口、也不让预览页把主页面导航走
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return
    event.preventDefault()
    if (/^https?:/.test(url)) void shell.openExternal(url)
  })

  win.once('ready-to-show', () => {
    reveal(win)
  })
  const revealFallback = setTimeout(() => reveal(win), 3000)
  win.once('closed', () => clearTimeout(revealFallback))

  return win
}

/**
 * 先挂钩子再开导航：加载事件是异步的，但顺序写反了就是在赌那一帧，
 * 自检一旦漏掉 did-finish-load 会变成「等超时才失败」，比直接报错难查。
 */
function openWindow(beforeLoad?: (win: BrowserWindow) => void): BrowserWindow {
  const win = createWindow()
  beforeLoad?.(win)
  void win.loadURL(isDev ? DEV_SERVER_URL : `${APP_SCHEME}://app/index.html`)
  return win
}

/**
 * 无头自检：把断言跑在渲染进程里，验证的正是真实加载路径
 * （自定义协议出包 + preload 桥 + 字体 IPC），而不是另起一套测试桩。
 */
async function runSmoke(win: BrowserWindow): Promise<void> {
  const report = (await win.webContents.executeJavaScript(`(async () => {
    const waitFor = async (predicate, timeoutMs = 15000) => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (predicate()) return true
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      return false
    }
    const mounted = await waitFor(() => (document.getElementById('root')?.childElementCount ?? 0) > 0)
    const bridge = window.stylemdDesktop
    // 字体列表走渲染进程自己的 queryLocalFonts（桌面壳已放行 local-fonts 权限）
    let fonts = []
    if (typeof window.queryLocalFonts === 'function') {
      try { fonts = (await window.queryLocalFonts()).map((font) => font.family) } catch { fonts = [] }
    }
    let aliasCount = 0
    let aliasSample = {}
    if (bridge?.listFontAliases) {
      try {
        const aliases = await bridge.listFontAliases()
        aliasCount = Object.keys(aliases).length
        aliasSample = Object.fromEntries(
          Object.entries(aliases).filter((pair) => [...String(pair[1])].some((ch) => ch.charCodeAt(0) > 127)),
        )
      } catch { aliasCount = 0 }
    }
    // 打开功能区里的「中文字体」下拉，确认候选真的来自上面的枚举，而不是那份手写清单
    let fontOptionCount = 0
    let fontLabels = []
    const toggle = document.querySelector('.ribbon button[aria-label="字体族候选"]')
    if (toggle && mounted) {
      toggle.click()
      await waitFor(() => document.querySelectorAll('.combo-list [role="option"]').length > fonts.length / 2)
      const options = [...document.querySelectorAll('.combo-list [role="option"] span')]
      fontLabels = options.map((option) => option.textContent ?? '')
      fontOptionCount = options.length
    }
    return {
      mounted,
      hasBridge: Boolean(bridge),
      isDesktop: bridge?.isDesktop === true,
      platform: bridge?.platform ?? null,
      electron: bridge?.versions?.electron ?? null,
      fontCount: Array.isArray(fonts) ? fonts.length : -1,
      fontSample: Array.isArray(fonts) ? fonts.slice(0, 3) : [],
      // 这段脚本要塞进模板字符串再 executeJavaScript：正则里的十六进制/Unicode 转义
      // 会被提前解成真的控制字符，正则就废了（中文样例一直报空就是这么来的）。
      // 一律改用 charCodeAt 比较。
      fontSampleCjk: Array.isArray(fonts)
        ? fonts.filter((name) => [...name].some((ch) => ch.charCodeAt(0) > 127)).slice(0, 5)
        : [],
      hasQueryLocalFonts: typeof window.queryLocalFonts === 'function',
      fontOptionCount,
      fontLabelMojibake: fontLabels.some((label) => label.includes(String.fromCharCode(0xfffd))),
      fontLabelCjk: fontLabels.filter((label) =>
        [...label].some((ch) => ch.charCodeAt(0) >= 0x4e00 && ch.charCodeAt(0) <= 0x9fff),
      ),
      fontAliasCount: aliasCount,
      fontAliasCjk: aliasSample,
      title: document.title,
    }
  })()`)) as Record<string, unknown>

  const checks: [string, boolean][] = [
    ['渲染进程已挂载（自定义协议出的包能被执行）', report.mounted === true],
    ['preload 桥存在', report.hasBridge === true],
    ['桥标记为桌面环境', report.isDesktop === true],
    ['能读到 Electron 版本', typeof report.electron === 'string' && report.electron.length > 0],
    ['能列到系统字体', typeof report.fontCount === 'number' && report.fontCount > 0],
    ['字体下拉用的是系统字体', typeof report.fontOptionCount === 'number' && report.fontOptionCount >= 100],
    ['字体名没有解码乱码', report.fontLabelMojibake !== true],
    ['列表里有中文名字体', Array.isArray(report.fontLabelCjk) && report.fontLabelCjk.length > 0],
    ['能读到字体中文名（DirectWrite）', typeof report.fontAliasCount === 'number' && report.fontAliasCount > 0],
  ]

  const failed = checks.filter(([, ok]) => !ok)
  console.log(JSON.stringify({ ...report, checks: checks.map(([name, ok]) => ({ name, ok })) }, null, 2))
  for (const [name] of failed) console.error(`FAIL: ${name}`)
  console.log(failed.length === 0 ? `SMOKE OK (${checks.length}/${checks.length})` : `SMOKE FAILED (${checks.length - failed.length}/${checks.length})`)
  app.exit(failed.length === 0 ? 0 : 1)
}

function wireSmoke(win: BrowserWindow): void {
  let loadFailed = false
  win.webContents.once('did-fail-load', (_event, code, description) => {
    loadFailed = true
    console.error(`FAIL: 加载失败 ${code} ${description}`)
    app.exit(1)
  })
  win.webContents.once('did-finish-load', () => {
    // 加载失败时 Chromium 也会走到 did-finish-load（错误页也算加载完），
    // 不挡一下就会对着一个正在销毁的 webContents 跑断言，报错反而看不出真因
    if (loadFailed || win.isDestroyed()) return
    void runSmoke(win).catch((error: unknown) => {
      console.error(`FAIL: 自检异常 ${error instanceof Error ? error.message : String(error)}`)
      app.exit(1)
    })
  })
}

async function main(): Promise<void> {
  // 自检可能和开发实例同时在跑：给自检一个独立 userData，
  // 否则两边抢同一份 Chromium 缓存目录，日志里会刷一串「Unable to move the cache」
  if (isSmoke) app.setPath('userData', path.join(app.getPath('temp'), 'stylemd-electron-smoke'))

  await app.whenReady()

  registerAppProtocol()

  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission))

  ipcMain.handle(CHANNELS.listFontAliases, () => listFontAliases())

  openWindow(
    isSmoke ? wireSmoke : undefined,
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || isSmoke) app.quit()
})

void main()
