/**
 * 原型端到端冒烟测试：用本机已装好的 Chromium 打开构建产物，验证主链路真的能跑通。
 *
 * 覆盖的链路：
 *   光标定位 → 功能区字体/段落跟随 → 点开样式窗口 → 窗口内改字号 → 预览即时刷新
 *   → 切换样式包（编号与首行缩进生效）→ 页面设置 → 预览缩放到 iframe
 *   公式：行内/行间 KaTeX 排版、字体内联生效、行间公式居中且不跨页
 *
 * 运行：node e2e/smoke.mjs
 * 可选：STYLEMD_CHROME 指定 chromium 可执行文件路径
 */
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(here, '../apps/demo/dist')
const artifactDir = path.resolve(here, 'artifacts')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function findChromium() {
  if (process.env.STYLEMD_CHROME && existsSync(process.env.STYLEMD_CHROME)) return process.env.STYLEMD_CHROME
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) throw new Error('未找到 LOCALAPPDATA，无法定位 ms-playwright 里的 Chromium')
  const base = path.join(localAppData, 'ms-playwright')
  if (!existsSync(base)) throw new Error(`未找到 ${base}`)
  const candidates = []
  for (const entry of readdirSync(base)) {
    if (!entry.startsWith('chromium-')) continue
    candidates.push(path.join(base, entry, 'chrome-win64', 'chrome.exe'))
    candidates.push(path.join(base, entry, 'chrome-win', 'chrome.exe'))
    candidates.push(path.join(base, entry, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'))
  }
  const found = candidates.filter((candidate) => existsSync(candidate))
  if (found.length === 0) throw new Error('ms-playwright 下没有可用的 Chromium')
  return found.sort().reverse()[0]
}

function startServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    let filePath = path.join(distDir, decodeURIComponent(url.pathname))
    try {
      const info = await stat(filePath)
      if (info.isDirectory()) filePath = path.join(filePath, 'index.html')
    } catch {
      filePath = path.join(distDir, 'index.html')
    }
    try {
      const body = await readFile(filePath)
      response.writeHead(200, { 'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream' })
      response.end(body)
    } catch (error) {
      response.writeHead(404)
      response.end(String(error))
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

const results = []
function check(name, passed, detail = '') {
  results.push({ name, passed, detail })
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `   — ${detail}` : ''}`)
}

async function until(fn, { timeout = 20000, interval = 200, label = '条件满足' } = {}) {
  const started = Date.now()
  let lastError
  while (Date.now() - started < timeout) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  throw new Error(`等待超时：${label}${lastError ? `（最后错误：${lastError.message}）` : ''}`)
}

const readFontSizePt = (locator) =>
  locator.evaluate((element) => (Number.parseFloat(getComputedStyle(element).fontSize) * 72) / 96)

/**
 * 弹窗标题在标题栏里的上下留白（文字盒到标题栏内容区上下边）。
 * 标题栏用 `align-items: baseline` 时，单个基线对齐的行会被贴到交叉轴起点上
 * （行高由右边那颗 26px 关闭按钮撑着），标题就浮在顶部、下面白留 7px（实测过）。
 */
const headPadding = (page, selector) =>
  page.locator(selector).evaluate((dialog) => {
    const head = dialog.querySelector('.dialog-head')
    const title = head.querySelector('.dialog-title')
    const range = document.createRange()
    range.selectNodeContents(title)
    const text = range.getBoundingClientRect()
    const box = head.getBoundingClientRect()
    const style = getComputedStyle(head)
    const top = box.top + Number.parseFloat(style.paddingTop)
    const bottom = box.bottom - Number.parseFloat(style.paddingBottom) - Number.parseFloat(style.borderBottomWidth)
    return { above: Math.round(text.top - top), below: Math.round(bottom - text.bottom) }
  })

/**
 * 编辑器辅助：源码区是 CodeMirror 6，没有 textarea 的 value / selectionStart / scrollTop，
 * 一律通过 ?e2e=1 挂上的调试句柄读写，避免断言绑死在编辑器的内部 DOM 上。
 */
const editorValue = (page) => page.evaluate(() => window.__stylemdEditor.getValue())
const editorCaret = (page) => page.evaluate(() => window.__stylemdEditor.getCursor())
const setCaret = (page, offset) => page.evaluate((value) => window.__stylemdEditor.setCursor(value), offset)
const setScrollTop = (page, top) => page.evaluate((value) => window.__stylemdEditor.setScrollTop(value), top)
const editorScrollTop = (page) => page.evaluate(() => Math.round(window.__stylemdEditor.getScrollTop()))
const readEditor = (page) =>
  page.evaluate(() => {
    const scroller = document.querySelector('.source-input .cm-scroller')
    return {
      scrollTop: Math.round(scroller.scrollTop),
      maxScroll: Math.round(scroller.scrollHeight - scroller.clientHeight),
      caret: window.__stylemdEditor.getCursor(),
    }
  })

/** 找第一处以 prefix 开头的行，返回行首偏移；找不到返回 -1。 */
async function lineStartOffset(page, prefix) {
  const value = await editorValue(page)
  let offset = 0
  for (const line of value.split('\n')) {
    if (line.startsWith(prefix)) return offset
    offset += line.length + 1
  }
  return -1
}

/** 同上，但从文末往前找。 */
async function lastLineStartOffset(page, prefix) {
  const value = await editorValue(page)
  const lines = value.split('\n')
  let offset = value.length
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    offset -= lines[index].length
    if (lines[index].startsWith(prefix)) return offset
    offset -= 1
  }
  return -1
}

/** 把光标放到文中第一处 `# ` 标题的文字里，用来验证功能区会跟随光标定位。 */
async function putCaretInFirstHeading(page) {
  const offset = await lineStartOffset(page, '# ')
  if (offset < 0) throw new Error('示例文档里没有一级标题')
  await setCaret(page, offset + 3)
}

async function main() {
  if (!existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('缺少构建产物，请先运行 npm run build')
  }
  await mkdir(artifactDir, { recursive: true })

  const { server, port } = await startServer()
  const executablePath = findChromium()
  console.log(`Chromium: ${executablePath}`)
  console.log(`预览服务: http://127.0.0.1:${port}\n`)

  const browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(String(error)))

  try {
    // ?e2e=1 才会挂上编辑器调试句柄，正常使用时没有这个全局对象。
    await page.goto(`http://127.0.0.1:${port}/?e2e=1`, { waitUntil: 'load' })
    const preview = page.frameLocator('iframe.preview-iframe')

    // 1. 底部栏提示（页数、字数、缩放都在全局底部栏上）；分页完成的信号以状态栏为准，
    //    直接数页面元素会在分页途中读到中间状态。
    const statusText = await until(async () => {
      const text = await page.locator('.statusbar .page-status').innerText()
      return /第 1 页，共 \d+ 页/.test(text) ? text : ''
    }, { label: '底部栏显示页数' })
    check('底部栏显示页数', true, statusText.trim())

    // 浏览器里没有宿主通道，导出 PDF 仍旧只能走打印对话框——文案与行为都别被桌面壳那条路顺带改掉。
    const browserPrintLabel = (await page.locator('.ribbon .titlebar-actions button.primary').innerText()).trim()
    check('浏览器版导出按钮仍是「打印 / 导出 PDF」', browserPrintLabel === '打印 / 导出 PDF', browserPrintLabel)

    // 无边框标题栏（拖拽区 + 给系统窗口按钮留位）只是桌面壳的事，浏览器里不该跟着变
    const browserChrome = await page.evaluate(() => {
      const bar = document.querySelector('.ribbon-titlebar')
      return {
        isDesktop: document.documentElement.classList.contains('is-desktop'),
        rightPadding: Number.parseFloat(getComputedStyle(bar).paddingRight),
        appRegion: getComputedStyle(bar).getPropertyValue('-webkit-app-region').trim(),
      }
    })
    check(
      '浏览器版不会套用桌面壳的标题栏规则',
      !browserChrome.isDesktop && browserChrome.rightPadding <= 20 && browserChrome.appRegion !== 'drag',
      `is-desktop=${browserChrome.isDesktop} / padding-right=${browserChrome.rightPadding} / app-region=${browserChrome.appRegion}`,
    )

    // 1.4 滚动条：细、默认透明，指针移进滚动容器才染色。用的是标准属性 scrollbar-width /
    //     scrollbar-color——`::-webkit-scrollbar` 那套在容器 :hover 变化时 Chromium 不重绘，做不出「移入才显现」。
    // 断言期间先关掉过渡：滑块颜色带 200ms 渐隐，读到中间态会让比较飘。
    const noTransition = await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; }',
    })
    const scrollbarIdle = await page.locator('.cm-scroller').evaluate((node) => {
      const style = getComputedStyle(node)
      return { width: style.scrollbarWidth, color: style.scrollbarColor }
    })
    await page.hover('.cm-scroller')
    await page.waitForTimeout(300)
    const scrollbarHover = await page
      .locator('.cm-scroller')
      .evaluate((node) => getComputedStyle(node).scrollbarColor)
    // 深色方案（夜读）下滑块要换更亮的一档，否则灰滑块压在深底上看不见。
    // applyScheme 给的是 --ed-scroll-thumb，这里照它换一次，验证 CSS 这条链真的跟着走。
    const { light, dark } = await page.evaluate(() => {
      const node = document.querySelector('.cm-scroller')
      const root = document.documentElement
      const previous = root.style.getPropertyValue('--ed-scroll-thumb')
      const read = () => getComputedStyle(node).scrollbarColor
      const lightColor = read()
      root.style.setProperty('--ed-scroll-thumb', 'var(--scroll-thumb-dark)')
      const darkColor = read()
      root.style.setProperty('--ed-scroll-thumb', previous)
      return { light: lightColor, dark: darkColor }
    })
    // 构建产物会把颜色压成 #rrggbbaa，运行时又能给出 rgba(…)，两种都得分得清
    const rgbSum = (color) => {
      const hex = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(color.trim())
      if (hex) {
        return [0, 2, 4].reduce((sum, index) => sum + Number.parseInt(hex[1].slice(index, index + 2), 16), 0)
      }
      return (color.match(/[\d.]+/g) ?? [])
        .slice(0, 3)
        .map(Number)
        .reduce((sum, value) => sum + value, 0)
    }
    const lighter = rgbSum(dark)
    await noTransition.evaluate((node) => node.remove())
    check(
      '宿主滚动条是细的、默认透明、移入才染色，深色方案里更亮',
      scrollbarIdle.width === 'thin' &&
        scrollbarIdle.color === 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)' &&
        scrollbarHover !== scrollbarIdle.color &&
        dark !== light &&
        lighter > rgbSum(light),
      `${scrollbarIdle.width} / 静止 ${scrollbarIdle.color} → 移入 ${scrollbarHover} → 深色 ${dark}`,
    )

    // 预览是另一份文档：它的滚动条规则写在 renderer-paged 的屏幕外壳里，同样要「移入才显现」
    let previewFrame = null
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue
      const element = await frame.frameElement()
      if (element && (await element.getAttribute('class')) === 'preview-iframe') previewFrame = frame
    }
    const previewScrollbarIdle = previewFrame
      ? await previewFrame.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor)
      : ''
    await page.hover('iframe.preview-iframe')
    await page.waitForTimeout(300)
    const previewScrollbarHover = previewFrame
      ? await previewFrame.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor)
      : ''
    check(
      '预览 iframe 的滚动条同样默认透明、移入才染色',
      previewFrame !== null &&
        previewScrollbarIdle === 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)' &&
        previewScrollbarHover !== previewScrollbarIdle,
      `静止 ${previewScrollbarIdle || '读不到预览文档'} → 移入 ${previewScrollbarHover}`,
    )

    // 1.5 表单控件的焦点环：浏览器默认那圈（`-webkit-focus-ring-color` 的 auto 描边）已经换成统一的
    //     强调色实线：1px 粗细 + 向内收 1px，跟控件自己的描边一样粗、不往外溢出。文本框按规范
    //     「聚焦即 :focus-visible」，鼠标点进去也有环；按钮用鼠标点不匹配 :focus-visible，
    //     只剩 `:focus { outline: none }`——所以是「点击不留痕、键盘 Tab 看得见」。
    const comboInput = page.locator('.ribbon .combo input[type="text"]').first()
    await comboInput.click()
    const inputRing = await comboInput.evaluate((node) => {
      const style = getComputedStyle(node)
      return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} / ${style.outlineOffset}`
    })
    check(
      '文本框的焦点环是 1px 强调色实线且向内收（不再是浏览器默认那圈、也不外溢）',
      inputRing === 'solid 1px rgb(47, 111, 237) / -1px',
      inputRing,
    )

    const fileTabForAudit = page.getByRole('button', { name: '文件', exact: true })
    await fileTabForAudit.click()
    await page.waitForSelector('.file-panel', { timeout: 5000 })
    const clickedButton = await page.evaluate(() => {
      const node = document.activeElement
      const style = node ? getComputedStyle(node) : null
      return {
        element: node instanceof HTMLElement ? `${node.tagName}.${node.className}` : String(node),
        outline: style ? style.outlineStyle : '',
      }
    })
    await page.keyboard.press('Escape')
    check(
      '鼠标点按钮不再画默认焦点环',
      clickedButton.element.startsWith('BUTTON') && clickedButton.outline === 'none',
      `${clickedButton.element} → outline-style: ${clickedButton.outline}`,
    )

    // 2. Paged.js 是否真的把内容切成了纸页
    const pageCount = await preview.locator('.pagedjs_page').count()
    check('Paged.js 在预览中完成分页', pageCount >= 2, `${pageCount} 页`)

    // 2.5 跨页表格：Paged.js 会把一张表切成多个 <table> 分片。分片之间不能出现列宽漂移，
    //     不能只剩表头孤在上一页，也不能有行被挤出页面——列宽改晚了就会这样，连下框线都会跟着跑出页外。
    const readTableFragments = () =>
      preview.locator('.pagedjs_pages').evaluate((root) =>
        Array.from(root.querySelectorAll('table[data-role="table"]')).map((table) => {
          const box = table.closest('.pagedjs_page_content')
          const bounds = box ? box.getBoundingClientRect() : null
          const rowsInside = bounds
            ? Array.from(table.rows).every((row) =>
                Array.from(row.getClientRects()).every(
                  (rect) => rect.bottom <= bounds.bottom + 1 && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1,
                ),
              )
            : true
          return {
            key: table.getAttribute('data-split-from') || table.getAttribute('data-ref'),
            rows: table.rows.length,
            columns: Array.from(table.rows[0]?.cells ?? []).map((cell) => Math.round(cell.offsetWidth)),
            rowsInside,
          }
        }),
      )
    // 预览会重排几次，这里重试到分页落定；超时也要把最后看到的几何打出来，别只留一句"等待超时"。
    let tableFragments = []
    let tableFragmentsConsistent = false
    for (let attempt = 0; attempt < 100 && !tableFragmentsConsistent; attempt += 1) {
      tableFragments = await readTableFragments()
      const keys = new Set(tableFragments.map((fragment) => fragment.key))
      tableFragmentsConsistent =
        tableFragments.length > 0 &&
        [...keys].every((key) => {
          const group = tableFragments.filter((fragment) => fragment.key === key)
          return group.every(
            (fragment) =>
              fragment.rows >= 2 &&
              fragment.rowsInside &&
              fragment.columns.length > 0 &&
              fragment.columns.join('×') === group[0].columns.join('×'),
          )
        })
      if (!tableFragmentsConsistent) await page.waitForTimeout(200)
    }
    check(
      '跨页表格分片列宽一致、行不越页且没有孤行表头',
      tableFragmentsConsistent,
      tableFragments
        .map((fragment) => `${fragment.rows} 行/${fragment.columns.join('+')}px${fragment.rowsInside ? '' : '（有行越出页面）'}`)
        .join('，'),
    )

    // 2.6 表注/图注必须和被注对象同页：断点落在表头或图注上时，题注要和表/图一起换页，不能单独留在上一页页尾。
    const captionAudit = await until(
      async () => {
        const captions = await preview.locator('.pagedjs_pages').evaluate((root) => {
          const pages = Array.from(root.querySelectorAll('.pagedjs_page'))
          return Array.from(root.querySelectorAll('[data-role="table-caption"], [data-role="figure-caption"]')).map((caption) => {
            const page = pages.indexOf(caption.closest('.pagedjs_page'))
            const role = caption.getAttribute('data-role')
            const partner = role === 'table-caption' ? 'table[data-role="table"]' : 'p[data-role="image"]'
            return { role, page, samePage: Boolean(pages[page]?.querySelector(partner)) }
          })
        })
        return captions.length > 0 && captions.every((caption) => caption.samePage) ? captions : null
      },
      { label: '表注/图注与被注对象同页' },
    )
    check('表注/图注与被注对象同页', true, captionAudit.map((caption) => `${caption.role}@第${caption.page + 1}页`).join('，'))

    // 2.7 数学公式：预览是 srcdoc + CSP（font-src data:），字体必须靠内联 woff2 才生效；
    //     行间公式要居中、要整块留在同一页，不能被 Paged.js 从中间切开。
    const mathAudit = await until(
      async () => {
        const audit = await preview.locator('.pagedjs_pages').evaluate(async (root) => {
          if (document.fonts) await document.fonts.ready
          const wrappers = Array.from(root.querySelectorAll('[data-role="math-inline"], [data-role="math-block"]'))
          if (wrappers.length === 0) return null
          const inlines = wrappers.filter((element) => element.getAttribute('data-role') === 'math-inline')
          const blocks = wrappers.filter((element) => element.getAttribute('data-role') === 'math-block')
          const union = (boxes) =>
            boxes.length
              ? {
                  left: Math.min(...boxes.map((rect) => rect.left)),
                  right: Math.max(...boxes.map((rect) => rect.right)),
                  top: Math.min(...boxes.map((rect) => rect.top)),
                  bottom: Math.max(...boxes.map((rect) => rect.bottom)),
                }
              : null
          const boundsOf = (element) => {
            const boxes = [element, ...element.querySelectorAll('.katex-base')]
              .map((node) => node.getBoundingClientRect())
              .filter((rect) => rect.width > 0 || rect.height > 0)
            return union(boxes)
          }
          // 居中只量公式本体：外层 div 是整宽的，把它算进去会让任何位置都「居中」。
          const inkOf = (element) =>
            union(
              Array.from(element.querySelectorAll('.katex-base'))
                .map((node) => node.getBoundingClientRect())
                .filter((rect) => rect.width > 0 || rect.height > 0),
            )
          const blocksFit = blocks.every((block) => {
            const content = block.closest('.pagedjs_page_content')
            const box = boundsOf(block)
            if (!content || !box) return false
            const bounds = content.getBoundingClientRect()
            return box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1
          })
          const blocksCentered = blocks.every((block) => {
            const content = block.closest('.pagedjs_page_content')
            const box = inkOf(block)
            if (!content || !box) return false
            const bounds = content.getBoundingClientRect()
            return Math.abs(box.left - bounds.left - (bounds.right - box.right)) <= 4
          })
          return {
            total: wrappers.length,
            inline: inlines.length,
            block: blocks.length,
            blocksFit,
            blocksCentered,
            inlineDisplay: inlines.length ? getComputedStyle(inlines[0]).display : '',
            blockBreakInside: blocks.length ? getComputedStyle(blocks[0]).breakInside : '',
            annotations: root.querySelectorAll('annotation[encoding="application/x-tex"]').length,
            tags: root.querySelectorAll('.katex-tag').length,
            fontReady: document.fonts ? document.fonts.check('1em KaTeX_Main') : false,
          }
        })
        return audit && audit.inline > 0 && audit.block > 0 ? audit : null
      },
      { label: '预览里出现行内与行间公式' },
    )
    check(
      '预览排版 KaTeX 公式并保留 TeX 原文',
      mathAudit.annotations >= mathAudit.total,
      `${mathAudit.inline} 个行内 / ${mathAudit.block} 个行间，${mathAudit.annotations} 条 TeX 注解`,
    )
    check('公式字体以内联 data URI 在预览里生效', mathAudit.fontReady, 'document.fonts.check(KaTeX_Main) = true')
    check(
      '行内公式随正文排，行间公式居中且不跨页',
      mathAudit.inlineDisplay === 'inline' && mathAudit.blocksCentered && mathAudit.blocksFit && mathAudit.blockBreakInside === 'avoid',
      `行内 display=${mathAudit.inlineDisplay}，行间 break-inside=${mathAudit.blockBreakInside}，居中=${mathAudit.blocksCentered}，同页=${mathAudit.blocksFit}`,
    )
    check('行间公式的 \\tag 编号一起排版', mathAudit.tags >= 1, `${mathAudit.tags} 个公式编号`)

    // 2.8 样式画廊与样式窗口里的公式样例：要交给 KaTeX 真渲染（而不是把 $$...$$ 当纯文本摆着），
    //     行间公式的样例还要按角色默认居中，否则卡片上看不出这个角色的特征。
    const mathCard = await page.locator('.style-card[aria-label="行间公式"]').evaluate((node) => {
      const sample = node.querySelector('.style-card-sample')
      return {
        rendered: Boolean(sample.querySelector('.katex')),
        display: Boolean(sample.querySelector('.katex-display')),
        tex: sample.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? '',
        align: getComputedStyle(sample).textAlign,
        overflow: sample.scrollHeight - sample.clientHeight,
      }
    })
    check(
      '样式画廊的行间公式样例真渲染成公式并居中',
      mathCard.rendered && mathCard.display && mathCard.tex.includes('\\Delta') && mathCard.align === 'center',
      `${mathCard.tex} / text-align=${mathCard.align} / 溢出 ${mathCard.overflow}px`,
    )
    await page.locator('.style-card[aria-label="行间公式"]').click()
    await page.locator('.style-dialog .sample-box .katex').first().waitFor({ timeout: 5000 })
    const dialogMath = await page.locator('.style-dialog .sample-box').evaluate((node) => ({
      tex: node.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? '',
      align: getComputedStyle(node.firstElementChild).textAlign,
    }))
    check(
      '样式窗口的预览里公式同样是渲染出来的',
      dialogMath.tex.includes('\\Delta') && dialogMath.align === 'center',
      `${dialogMath.tex} / text-align=${dialogMath.align}`,
    )
    await page.keyboard.press('Escape')

    check(
      '窗格标题栏已移除，字数与缩放收进底部栏',
      (await page.locator('.pane-head').count()) === 0 &&
        (await page.locator('.statusbar .zoom-control').isVisible()) &&
        /\d+ 字符/.test(await page.locator('.statusbar').innerText()),
      '底部栏含字数与缩放',
    )

    // 3. 样式角色是否落到 DOM 中
    const heading = preview.locator('[data-role="heading-1"]').first()
    await heading.waitFor({ timeout: 10000 })
    const initialPt = await readFontSizePt(heading)
    check('一级标题按预设渲染为 20pt', Math.abs(initialPt - 20) < 0.6, `${initialPt.toFixed(2)}pt`)

    // 4. 光标放进标题 → 功能区定位、样式卡片高亮
    await putCaretInFirstHeading(page)
    const locatorText = await until(async () => {
      const text = (await page.locator('.locator').innerText()).trim()
      return text.includes('一级标题') ? text : ''
    }, { label: '功能区跟随光标定位到一级标题' })
    check('光标定位联动功能区', true, locatorText)
    const activeCard = await until(
      async () => {
        const label = await page.locator('.style-card.active').first().getAttribute('aria-label')
        return label === '一级标题' ? label : ''
      },
      { label: '样式卡片跟着光标高亮' },
    )
    check('当前结构的样式卡片自动高亮', true, `高亮：${activeCard}`)

    // 4a0. 画廊只摆「开始」页有入口意义的结构：页眉页脚是页面装饰（入口在「页面」页），
    //      表格 / 表头单元格 / 表格单元格的样式都在「表格」选项卡里（跟着光标出现），
    //      这几类都不该在结构画廊里再摆卡片；表题是普通段落，仍要留着。
    const galleryLabels = await page
      .locator('.style-card')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))
    check(
      '结构画廊里没有页眉页脚与表格相关结构（表题保留）',
      galleryLabels.length > 0 &&
        !galleryLabels.includes('页眉') &&
        !galleryLabels.includes('页脚') &&
        !['表格', '表头单元格', '表格单元格'].some((label) => galleryLabels.includes(label)) &&
        galleryLabels.includes('表题'),
      `${galleryLabels.length} 个结构：${galleryLabels.join(' / ')}`,
    )

    // 4a. 「样式」栏跟「高亮配色」同一套做法：白底只留一整张卡片，卡片之间用竖线切，
    //     各自带框的小白块摞在白底上会糊成一片，选中态改为整块染底。
    const stylePanelCard = await page.locator('.style-gallery').evaluate((node) => {
      const gallery = getComputedStyle(node)
      const first = node.querySelector('.style-card')
      const active = node.querySelector('.style-card.active')
      const firstStyle = getComputedStyle(first)
      return {
        background: gallery.backgroundColor,
        radius: gallery.borderRadius,
        border: gallery.borderTopWidth,
        scrollbarWidth: gallery.scrollbarWidth,
        // 经典滚动条会从卡片内部切走一条高度，卡片与分隔线就停在那条上面。
        gutter: node.offsetHeight - node.clientHeight - Number.parseFloat(gallery.borderTopWidth) - Number.parseFloat(gallery.borderBottomWidth),
        cardHeight: first.getBoundingClientRect().height,
        contentHeight: node.clientHeight,
        segmentBorder: firstStyle.borderTopWidth,
        divider: firstStyle.borderRightWidth,
        dividerColor: firstStyle.borderRightColor,
        activeBackground: getComputedStyle(active).backgroundColor,
        activeName: getComputedStyle(active.querySelector('.style-card-name')).color,
      }
    })
    check(
      '「样式」栏是一整块白底卡片，卡片之间用竖线分隔',
      stylePanelCard.background === 'rgb(255, 255, 255)' &&
        stylePanelCard.radius === '8px' &&
        stylePanelCard.border === '1px' &&
        stylePanelCard.segmentBorder === '0px' &&
        Number.parseFloat(stylePanelCard.divider) >= 1 &&
        stylePanelCard.dividerColor === 'rgb(223, 228, 236)' &&
        stylePanelCard.activeBackground !== stylePanelCard.background &&
        stylePanelCard.activeName === 'rgb(47, 111, 237)',
      `底 ${stylePanelCard.background} / 圆角 ${stylePanelCard.radius} / 框 ${stylePanelCard.border} / 卡片框 ${stylePanelCard.segmentBorder} / 分隔线 ${stylePanelCard.divider} ${stylePanelCard.dividerColor} / 选中底 ${stylePanelCard.activeBackground} / 选中名 ${stylePanelCard.activeName}`,
    )
    // 卡片必须撑满整张白底卡片：留出滚动条占位的话，卡片、分隔线和选中底色会在卡片底部
    // 缩回去一条，看着像底边距比顶边距大一截。
    check(
      '样式卡片撑满整张白底卡片，不为滚动条留底部占位',
      stylePanelCard.gutter === 0 &&
        stylePanelCard.scrollbarWidth === 'none' &&
        Math.abs(stylePanelCard.cardHeight - stylePanelCard.contentHeight) <= 1,
      `占位 ${stylePanelCard.gutter}px / scrollbar-width ${stylePanelCard.scrollbarWidth} / 卡片 ${stylePanelCard.cardHeight}px vs 卡片内容高 ${stylePanelCard.contentHeight}px`,
    )

    // 藏了滚动条就得自己接管滚轮：鼠标用户得能把后面的结构翻出来。
    await page.locator('.style-gallery').hover()
    await page.mouse.wheel(0, 240)
    const wheelScroll = await until(
      async () => {
        const left = await page.locator('.style-gallery').evaluate((node) => Math.round(node.scrollLeft))
        return left > 0 ? left : 0
      },
      { label: '滚轮把画廊横向翻过去' },
    )
    check('画廊用滚轮也能翻到后面的结构', wheelScroll > 0, `滚轮后 scrollLeft=${wheelScroll}px`)
    await page.locator('.style-gallery').evaluate((node) => {
      node.scrollLeft = 0
    })

    // 4b. 字体框：功能区只放中文字体这一个框，下拉能选
    const ribbon = page.locator('.ribbon')
    await ribbon.getByRole('button', { name: '字体族候选' }).click()
    await page.waitForSelector('.combo-list', { timeout: 3000 })
    const fontOptions = await page.locator('.combo-list [role="option"]').count()
    const curatedMarked = await page.locator('.combo-list [role="option"] em', { hasText: '常用' }).count()
    check(
      '字体下拉列出候选并标出常用',
      fontOptions >= 16 && curatedMarked >= 8,
      `${fontOptions} 个候选，${curatedMarked} 个标注「常用」`,
    )
    await page.getByRole('option', { name: 'SimHei' }).click()
    const headingFamily = await until(
      async () => {
        const family = await preview
          .locator('[data-role="heading-1"]')
          .first()
          .evaluate((element) => getComputedStyle(element).fontFamily)
        return family.includes('SimHei') ? family : ''
      },
      { label: '字体下拉生效' },
    )
    check('功能区中文字体下拉可选并生效', true, headingFamily.split(',')[0])

    // 4c. 字号：一个控件里既能下拉也能直接输入，非法输入回退
    const sizeBox = ribbon.getByLabel('字号 pt', { exact: true })
    await sizeBox.fill('小四')
    await sizeBox.press('Enter')
    await until(async () => Math.abs((await readFontSizePt(preview.locator('[data-role="heading-1"]').first())) - 12) < 0.6, {
      label: '输入中文字号「小四」生效',
    })
    await sizeBox.fill('abc')
    await sizeBox.press('Enter')
    await page.waitForTimeout(400)
    const sizeAfterInvalid = await readFontSizePt(preview.locator('[data-role="heading-1"]').first())
    check(
      '字号支持中文字号输入，非法输入回退原值',
      Math.abs(sizeAfterInvalid - 12) < 0.6 && (await sizeBox.inputValue()) === '小四',
      `非法输入后仍是 12pt，框内显示「${await sizeBox.inputValue()}」`,
    )

    // 4d. 段落组：图标按钮改段距/缩进，开关切换首行缩进
    await ribbon.getByRole('button', { name: '行距', exact: true }).click()
    await page.getByRole('button', { name: '2 倍', exact: true }).click()
    const lineRatio = await until(async () => {
      const metrics = await preview.locator('[data-role="heading-1"]').first().evaluate((element) => {
        const style = getComputedStyle(element)
        return Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize)
      })
      return Math.abs(metrics - 2) < 0.02 ? metrics : 0
    }, { label: '行距改成 2 倍' })
    check('行距用图标下拉改倍数', true, `${lineRatio.toFixed(2)} 倍`)

    const decreaseIndent = ribbon.getByRole('button', { name: '减少左缩进', exact: true })
    const increaseIndent = ribbon.getByRole('button', { name: '增加左缩进', exact: true })
    const decreaseDisabledAtZero = await decreaseIndent.isDisabled()
    await increaseIndent.click()
    await increaseIndent.click()
    const paddingStart = await until(async () => {
      const value = await preview
        .locator('[data-role="heading-1"]')
        .first()
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingInlineStart))
      return value > 0 ? value : 0
    }, { label: '增加左缩进生效' })
    await decreaseIndent.click()
    const paddingAfterReduce = await until(async () => {
      const value = await preview
        .locator('[data-role="heading-1"]')
        .first()
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingInlineStart))
      return value > 0 && value < paddingStart ? value : 0
    }, { label: '减少左缩进生效' })
    check(
      '左缩进是一减一增两个按钮',
      decreaseDisabledAtZero,
      `两次增加 → ${paddingStart.toFixed(1)}px，一次减少 → ${paddingAfterReduce.toFixed(1)}px`,
    )

    await ribbon.getByRole('button', { name: '首行缩进两字' }).click()
    const firstLineIndentRatio = await until(async () => {
      const value = await preview.locator('[data-role="heading-1"]').first().evaluate((element) => {
        const style = getComputedStyle(element)
        return Number.parseFloat(style.textIndent) / Number.parseFloat(style.fontSize)
      })
      return Math.abs(value - 2) < 0.05 ? value : 0
    }, { label: '首行缩进开关生效' })
    check('首行缩进是开关图标按钮', true, `缩进 ${firstLineIndentRatio.toFixed(1)} 字符`)

    // 4d-2. 版式约定（对齐 / 左右缩进 / 首行缩进）不随 basedOn 继承：
    //       光标落到正文上开首行缩进，基于正文的三级标题不该跟着一起缩。
    const bodyOffset = await page.evaluate(() => {
      const lines = window.__stylemdEditor.getValue().split('\n')
      const index = lines.findIndex((line) => line.startsWith('## 研究背景'))
      return lines.slice(0, index + 2).reduce((sum, line) => sum + line.length + 1, 0) + 2
    })
    await setCaret(page, bodyOffset)
    await until(
      async () => ((await page.locator('.statusbar .locator').innerText()).includes('正文段落') ? true : ''),
      { label: '光标落到正文段落' },
    )
    await ribbon.getByRole('button', { name: '首行缩进两字' }).click()
    const indentAudit = await until(
      async () => {
        const body = await preview.locator('[data-role="body-text"]').first().evaluate((element) => {
          const style = getComputedStyle(element)
          return Number.parseFloat(style.textIndent) / Number.parseFloat(style.fontSize)
        })
        if (Math.abs(body - 2) > 0.05) return null
        const heading = await preview
          .locator('[data-role="heading-3"]')
          .first()
          .evaluate((element) => getComputedStyle(element).textIndent)
        return { body, heading }
      },
      { label: '正文首行缩进 2 字符生效' },
    )
    check(
      '版式约定不随「基于」继承：正文开首行缩进不会漏给标题',
      indentAudit.heading === '0px',
      `正文 ${indentAudit.body.toFixed(1)} 字符 / 三级标题 ${indentAudit.heading}`,
    )
    // 复原：后面的段落断言还在同一份样式包上做
    await ribbon.getByRole('button', { name: '首行缩进两字' }).click()

    // 4d-3. 悬挂缩进：段落整体左移、首行用负缩进拉回（首行顶格、其余行缩进），且与首行缩进互斥
    await ribbon.getByRole('button', { name: '悬挂缩进两字' }).click()
    const hangingAudit = await until(
      async () => {
        const state = await preview.locator('[data-role="body-text"]').first().evaluate((element) => {
          const style = getComputedStyle(element)
          const fontSize = Number.parseFloat(style.fontSize)
          return {
            indent: Number.parseFloat(style.textIndent) / fontSize,
            pad: Number.parseFloat(style.paddingInlineStart) / fontSize,
          }
        })
        return Math.abs(state.indent + 2) < 0.05 && state.pad > 1.9 ? state : null
      },
      { label: '悬挂缩进生效' },
    )
    const firstLineToggle = await ribbon.getByRole('button', { name: '首行缩进两字' }).getAttribute('aria-pressed')
    check(
      '悬挂缩进把首行拉回、其余行缩进，并与首行缩进互斥',
      firstLineToggle === 'false',
      `首行 ${hangingAudit.indent.toFixed(1)} 字符 / 左内边距 ${hangingAudit.pad.toFixed(1)} 字符 / 首行缩进开关 ${firstLineToggle}`,
    )
    // 复原，别把悬挂缩进留给后面的断言
    await ribbon.getByRole('button', { name: '悬挂缩进两字' }).click()

    // 4e. 光标落到表格结构：功能区右侧冒出「表格」上下文选项卡并自动选中。
    const tableOffset = await lastLineStartOffset(page, '|')
    if (tableOffset < 0) throw new Error('示例文档里没有表格')
    await setCaret(page, tableOffset + 1)
    const contextTab = await until(
      async () => {
        const tab = page.locator('.ribbon-tab.context-tab')
        if ((await tab.count()) === 0) return null
        return (await tab.getAttribute('aria-selected')) === 'true' ? tab : null
      },
      { label: '光标进表格后「表格」选项卡自动选中' },
    )
    check('光标进表格时右侧出现「表格」选项卡并自动聚焦过去', true, `选中「${(await contextTab.innerText()).trim()}」`)

    const tableGroups = await page.$$eval('.ribbon-body .rgroup-label', (nodes) => nodes.map((node) => node.textContent))
    check(
      '表格选项卡分成大小 / 布局 / 边框 / 样式 / 属性五栏',
      ['大小', '布局', '边框', '样式', '属性'].every((label) => tableGroups.includes(label)),
      `栏目：${tableGroups.join(' / ')}`,
    )

    // 表格结构不再进结构画廊（样式都在「表格」选项卡里），所以画廊自动滚动那条链路
    // 改用文档里排在靠后的行间公式来验：光标移过去，卡片要自己滚进视野。
    // 顺带验证「光标离开表格」的行为：选项卡隐去并回到「开始」。
    const mathOffset = await lastLineStartOffset(page, '$$')
    if (mathOffset < 0) throw new Error('示例文档里没有行间公式')
    await setCaret(page, mathOffset + 2)
    const galleryState = await until(
      async () => {
        const state = await page.evaluate(() => {
          const card = document.querySelector('.style-card.active')
          const strip = document.querySelector('.style-gallery')
          if (!card || !strip) return null
          const cardBox = card.getBoundingClientRect()
          const stripBox = strip.getBoundingClientRect()
          return {
            role: card.getAttribute('aria-label'),
            scrollLeft: Math.round(strip.scrollLeft),
            visible: cardBox.left >= stripBox.left - 2 && cardBox.right <= stripBox.right + 2,
          }
        })
        return state && state.role === '行间公式' && state.visible ? state : null
      },
      { label: '画廊自动滚到当前结构' },
    )
    check('样式聚焦时画廊自动滚动过去', galleryState.scrollLeft > 0, `滚动到 ${galleryState.scrollLeft}px，「行间公式」卡片可见`)
    const tabGone = await until(
      async () => ((await page.locator('.ribbon-tab.context-tab').count()) === 0 ? true : null),
      { label: '光标离开表格后「表格」选项卡隐去' },
    )
    const backToStart = (await page.getByRole('tab', { name: '开始' }).getAttribute('aria-selected')) === 'true'
    check('光标移出表格后选项卡隐去并回到「开始」', tabGone && backToStart, `开始选项卡选中=${backToStart}`)

    // 4e-2. 表格选项卡的五个栏目：大小 / 布局 / 边框 / 属性（样式栏的入口由 5 节覆盖）
    await setCaret(page, tableOffset + 1)
    await page.getByRole('tab', { name: '表格' }).click()
    // 预览默认 85%：折叠边框模型下 Chromium 会把边框宽度按缩放后取整（1.5pt 与 0.75pt 都算成 1px），
    // 量粗细就分不出来了。这里先把预览调到 100%，量完再调回去。
    const zoomSlider = page.locator('.statusbar .zoom-control input[type="range"]')
    await zoomSlider.fill('100')
    await until(
      async () =>
        (await preview.locator('.pagedjs_pages').evaluate((element) => getComputedStyle(element).zoom)) === '1' ? true : null,
      { label: '预览缩放到 100%' },
    )
    const readTable = () =>
      preview.locator('table[data-role="table"]').first().evaluate((table) => {
        const content = table.closest('.pagedjs_page_content')
        const box = table.getBoundingClientRect()
        const header = table.querySelector('th')
        const cell = table.querySelector('td')
        return {
          width: Math.round(box.width),
          contentWidth: Math.round(content.getBoundingClientRect().width),
          columns: Array.from(table.rows[0]?.cells ?? []).map((node) => Math.round(node.getBoundingClientRect().width)),
          thead: table.querySelectorAll(':scope > thead').length,
          cellAlign: getComputedStyle(cell).textAlign,
          cellVertical: getComputedStyle(cell).verticalAlign,
          cellPadding: Math.round(Number.parseFloat(getComputedStyle(cell).paddingTop)),
          outerTop: Number.parseFloat(getComputedStyle(table).borderTopWidth),
          outerLeft: Number.parseFloat(getComputedStyle(table).borderLeftWidth),
          headerBottom: Number.parseFloat(getComputedStyle(header).borderBottomWidth),
          // 格线的共用边：第一个单元格画竖线，最后一列不画（交给外框）
          firstCellRight: Number.parseFloat(getComputedStyle(cell).borderRightWidth),
          lastCellRight: Number.parseFloat(
            getComputedStyle(table.rows[0].cells[table.rows[0].cells.length - 1]).borderRightWidth,
          ),
          lastRowBottom: Number.parseFloat(
            getComputedStyle(table.rows[table.rows.length - 1].cells[0]).borderBottomWidth,
          ),
        }
      })
    const tableSignature = (audit) =>
      JSON.stringify([audit.width, audit.thead, audit.columns, audit.cellAlign, audit.cellVertical, audit.outerTop, audit.outerLeft])
    const initialTable = await readTable()

    // 大小：撑满 100%（表格宽度等于纸张内容区宽度）
    await ribbon.getByLabel('表格宽度', { exact: true }).selectOption('full')
    const filled = await until(
      async () => {
        const audit = await readTable()
        return Math.abs(audit.width - audit.contentWidth) <= 2 ? audit : null
      },
      { label: '表格撑满内容区' },
    )
    check('大小：撑满 100% 让表格铺满纸张内容区', true, `表宽 ${filled.width}px / 内容区 ${filled.contentWidth}px`)

    // 大小：分布列（各列等宽）
    await ribbon.getByRole('button', { name: '分布列' }).click()
    const distributed = await until(
      async () => {
        const audit = await readTable()
        if (audit.columns.length < 3) return null
        return Math.max(...audit.columns) - Math.min(...audit.columns) <= 2 ? audit : null
      },
      { label: '分布列把各列排成等宽' },
    )
    check('大小：分布列让各列等宽', true, `列宽 ${distributed.columns.join(' / ')}px`)

    // 布局：一块面板管表头 / 内容两类单元格，先用上面的切换键切到「内容」，
    //       九宫格改成「右中」（右对齐 + 垂直居中），内边距写进单元格
    await ribbon.getByRole('button', { name: '内容', exact: true }).click()
    const layoutState = await page.evaluate(() => {
      const groups = Array.from(document.querySelectorAll('.ribbon-body > .rgroup'))
      const layout = groups.find((group) => group.querySelector('.rgroup-label')?.textContent === '布局')
      if (!layout) return null
      const buttons = Array.from(layout.querySelectorAll('.seg-button'))
      const pressed = buttons.find(
        (button) => button.getAttribute('aria-pressed') === 'true',
      )
      return {
        note: layout.querySelector('.rgroup-note')?.textContent ?? '',
        pressed: pressed?.textContent ?? '',
        grids: layout.querySelectorAll('.cell-align-grid').length,
        boxes: buttons.map((button) => {
          const box = button.getBoundingClientRect()
          return { left: Math.round(box.left), top: Math.round(box.top) }
        }),
      }
    })
    check(
      '布局：表头与内容共用一个面板，切换键决定改哪一类（按钮纵向排布）',
      layoutState?.note === '内容单元格' && layoutState.pressed === '内容' && layoutState.grids === 1,
      `选中「${layoutState?.pressed}」，组内九宫格 ${layoutState?.grids} 个`,
    )
    check(
      '布局：表头 / 内容切换键竖着排（同一列、上下两行）',
      layoutState.boxes.length === 2 &&
        layoutState.boxes[0].left === layoutState.boxes[1].left &&
        layoutState.boxes[0].top < layoutState.boxes[1].top,
      `位置 ${layoutState.boxes.map((box) => `${box.left},${box.top}`).join(' / ')}`,
    )
    await ribbon.getByRole('button', { name: '内容右中' }).click()
    const aligned = await until(
      async () => {
        const audit = await readTable()
        return audit.cellAlign === 'right' && audit.cellVertical === 'middle' ? audit : null
      },
      { label: '九宫格把内容单元格设成右中' },
    )
    check('布局：九宫格设置内容单元格对齐（右中）', true, `text-align=${aligned.cellAlign} / vertical-align=${aligned.cellVertical}`)

    const paddingBox = ribbon.getByLabel('内容内边距 pt', { exact: true })
    await paddingBox.fill('12')
    const padded = await until(
      async () => {
        const audit = await readTable()
        return audit.cellPadding >= 14 ? audit : null
      },
      { label: '单元格内边距生效' },
    )
    check('布局：内边距写进单元格', true, `${padded.cellPadding}px（12pt）`)

    // 边框：三线表（只留上下粗线与表头细线）
    await ribbon.getByRole('button', { name: '三线表' }).click()
    const threeLine = await until(
      async () => {
        const audit = await readTable()
        return audit.outerTop > 1.8 && audit.outerLeft === 0 && audit.headerBottom > 0.8 && audit.headerBottom < 1.2 ? audit : null
      },
      { label: '三线表生效' },
    )
    check(
      '边框：三线表只留上下框线与表头底线',
      true,
      `上 ${threeLine.outerTop}px（1.5pt）/ 左 ${threeLine.outerLeft}px / 表头下 ${threeLine.headerBottom}px（0.75pt）`,
    )

    // 边框和底纹窗口：完整的改法在这里。手里的线（线型 / 粗细 / 颜色）不自动应用，
    // 点某一条边才刷上去——换线型不会顺手把现有四条边一起改掉。
    await ribbon.getByRole('button', { name: '边框和底纹…' }).click()
    const borderDialog = page.locator('.border-dialog')
    await until(async () => ((await borderDialog.count()) > 0 ? borderDialog : null), { label: '边框窗口打开' })
    const widthBox = borderDialog.getByLabel('边框粗细 pt', { exact: true })
    const beforeLineEdit = await readTable()
    await widthBox.fill('3')
    await page.waitForTimeout(400)
    const afterLineEdit = await readTable()
    check(
      '边框窗口：改线型 / 粗细不会立刻改动表格',
      afterLineEdit.outerTop === beforeLineEdit.outerTop && afterLineEdit.headerBottom === beforeLineEdit.headerBottom,
      `上框线仍是 ${afterLineEdit.outerTop}px，手里这条线是 3pt`,
    )

    // 七条边各有一个开关，状态看得见
    const topSide = borderDialog.getByRole('button', { name: '上框线' })
    const sideKeys = await borderDialog.locator('.bp-side').evaluateAll((nodes) =>
      nodes.map((node) => `${node.textContent}${node.getAttribute('aria-pressed')}`),
    )
    check(
      '边框窗口：七条边各有开关，开 / 关状态看得见',
      sideKeys.length === 7 && sideKeys[0] === '上true',
      `七条边：${sideKeys.join(' / ')}`,
    )

    // 先撤掉旧的上框线，再点开——这时刷上去的就是手里这条 3pt 的线（"换线型要手动应用"）
    await topSide.click()
    const sideOff = await until(
      async () => {
        const audit = await readTable()
        return audit.outerTop === 0 ? audit : null
      },
      { label: '把上框线撤掉' },
    )
    const topPressed = await topSide.getAttribute('aria-pressed')
    check(
      '边框窗口：可以单独撤掉某一条边',
      sideOff.outerTop === 0 && topPressed === 'false',
      `上框线 0px，该键的 aria-pressed=${topPressed}`,
    )
    await topSide.click()
    const sideOn = await until(
      async () => {
        const audit = await readTable()
        return audit.outerTop >= 3.8 ? audit : null
      },
      { label: '把上框线刷回来' },
    )
    check('边框窗口：再点一下按手里的线刷回来', sideOn.outerTop >= 3.8, `上框线 ${sideOn.outerTop}px（3pt）`)
    check(
      '边框窗口：换线型不自动应用，撤掉再点开才刷上手里的线',
      true,
      `上框线 0px → ${sideOn.outerTop}px（手里这条线 3pt）`,
    )

    // 内部竖线：相邻单元格共用的那条边只画一次——第一个单元格画右边框，最后一列不画（交给外框）
    await borderDialog.getByRole('button', { name: '内部竖线' }).click()
    const grid = await until(
      async () => {
        const audit = await readTable()
        return audit.firstCellRight > 0 && audit.lastCellRight === 0 ? audit : null
      },
      { label: '内部竖线只画共用边' },
    )
    check(
      '边框窗口：内部竖线只画一次，最后一列交给外框',
      grid.lastRowBottom === 0,
      `第一格右边框 ${grid.firstCellRight}px / 最后一格 ${grid.lastCellRight}px / 最后一行下边框 ${grid.lastRowBottom}px`,
    )
    // 窗口宽度要贴着表单内容来（原来固定 700，表单只用到 410，右边空掉四成）；
    // 默认宽度就是下限，开窗即最紧。
    const borderDialogWidth = await page.locator('.border-dialog').evaluate((node) => Math.round(node.getBoundingClientRect().width))
    check(
      '边框窗口的默认宽度就是它的下限（450–520）',
      borderDialogWidth >= 450 && borderDialogWidth <= 520,
      `${borderDialogWidth}px`,
    )
    const borderHeadPadding = await headPadding(page, '.border-dialog')
    check(
      '边框窗口的标题在标题栏里垂直居中',
      Math.abs(borderHeadPadding.above - borderHeadPadding.below) <= 1,
      `上留白 ${borderHeadPadding.above}px / 下留白 ${borderHeadPadding.below}px`,
    )
    await borderDialog.getByRole('button', { name: '完成' }).click()

    // 属性：表格整体对齐 + 跨页重复标题行开关。
    // 宽度先按百分比收窄到 60%，否则按内容宽度时表格本来就顶满内容区，看不出左 / 中 / 右的摆位。
    await ribbon.getByLabel('表格宽度', { exact: true }).selectOption('percent')
    await ribbon.getByLabel('表格宽度百分比', { exact: true }).fill('60')
    const narrowed = await until(
      async () => {
        const audit = await readTable()
        return Math.abs(audit.width - audit.contentWidth * 0.6) <= 4 ? audit : null
      },
      { label: '表格按内容区的 60% 收窄' },
    )
    check('大小：百分比宽度按纸张内容区算', true, `表宽 ${narrowed.width}px / 内容区 ${narrowed.contentWidth}px`)

    await ribbon.getByRole('button', { name: '表格右对齐' }).click()
    const rightAligned = await until(
      async () => {
        const audit = await readTable()
        const gap = await preview.locator('table[data-role="table"]').first().evaluate((table) => {
          const content = table.closest('.pagedjs_page_content').getBoundingClientRect()
          return Math.round(content.right - table.getBoundingClientRect().right)
        })
        return Math.abs(gap) <= 2 ? { ...audit, gap } : null
      },
      { label: '表格贴到内容区右边' },
    )
    check('属性：表格右对齐贴到内容区右边', true, `右边缘差 ${rightAligned.gap}px（表宽 ${rightAligned.width}px）`)

    await ribbon.getByLabel('跨页重复标题行', { exact: true }).uncheck()
    const headerOff = await until(
      async () => {
        const audit = await readTable()
        return audit.thead === 0 ? audit : null
      },
      { label: '关掉跨页重复标题行后不再输出 thead' },
    )
    check('属性：关掉跨页重复标题行后首行不进 thead', headerOff.thead === 0, 'thead 数量 0')
    await ribbon.getByLabel('跨页重复标题行', { exact: true }).check()

    // 属性栏的表格对齐图标是「页框 + 色块」：`.seg-button svg { fill: currentColor }` 会把没写
    // fill 的页框填成实心方块，三个图标就长得一样了，这里盯着它别再退回去。
    const alignIcons = await page.evaluate(() => {
      const groups = Array.from(document.querySelectorAll('.ribbon-body > .rgroup'))
      const props = groups.find((group) => group.querySelector('.rgroup-label')?.textContent === '属性')
      return Array.from(props?.querySelectorAll('.seg-button svg') ?? []).map((svg) => {
        const frame = svg.firstElementChild
        const block = svg.querySelector('rect[fill="currentColor"]')
        return {
          frameFill: frame ? getComputedStyle(frame).fill : '',
          blockFill: block ? getComputedStyle(block).fill : '',
        }
      })
    })
    check(
      '属性：表格对齐图标是页框 + 色块，不是三个实心方块',
      alignIcons.length === 3 && alignIcons.every((icon) => icon.frameFill === 'none' && icon.blockFill !== 'none'),
      `页框 fill=${alignIcons[0]?.frameFill} / 色块 fill=${alignIcons[0]?.blockFill}`,
    )

    // 样式窗口的页签按结构给：表格类结构没有「边框与底纹」页（线归「表格」选项卡按边设），
    // 「编号」只给 1–6 级标题。
    const closeStyleDialog = async (label) => {
      const dialog = page.locator('.style-dialog[role="dialog"]')
      const tabs = await dialog.locator('.dialog-tab').allTextContents()
      await dialog.getByRole('button', { name: '关闭样式窗口' }).click()
      await until(async () => ((await dialog.count()) === 0 ? true : null), { label: `样式窗口关闭：${label}` })
      return tabs
    }
    const tabsFromGallery = async (cardLabel) => {
      await page.getByRole('tab', { name: '开始' }).click()
      await page.locator(`.style-card[aria-label="${cardLabel}"]`).first().click()
      const dialog = page.locator('.style-dialog[role="dialog"]')
      await until(async () => ((await dialog.count()) > 0 ? dialog : null), { label: `样式窗口打开：${cardLabel}` })
      return closeStyleDialog(cardLabel)
    }
    // 表格结构不再进结构画廊，它们的样式窗口入口在「表格」选项卡的样式栏
    const styleEntries = await page.$$eval('.rgroup .furniture-edit', (nodes) => nodes.map((node) => node.textContent))
    check(
      '表格选项卡的样式栏给表格 / 表头 / 内容三个样式窗口入口',
      ['表格样式…', '表头样式…', '内容样式…'].every((label) => styleEntries.includes(label)),
      `入口：${styleEntries.join(' / ')}`,
    )
    await page.getByRole('button', { name: '内容样式…' }).click()
    const dialog = page.locator('.style-dialog[role="dialog"]')
    await until(async () => ((await dialog.count()) > 0 ? dialog : null), { label: '样式窗口打开：表格单元格' })
    const cellTabs = await closeStyleDialog('表格单元格')
    check(
      '表格类结构的样式窗口不再有「边框与底纹」页',
      !cellTabs.includes('边框与底纹') && cellTabs.includes('字体') && cellTabs.includes('段落'),
      `表格单元格的页签：${cellTabs.join(' / ')}`,
    )
    const bodyTabs = await tabsFromGallery('正文段落')
    check(
      '非标题结构没有「编号」页，普通结构仍有「边框与底纹」',
      !bodyTabs.includes('编号') && bodyTabs.includes('边框与底纹'),
      `正文段落的页签：${bodyTabs.join(' / ')}`,
    )
    const headingTabs = await tabsFromGallery('四级标题')
    check('1–6 级标题有「编号」页', headingTabs.includes('编号'), `四级标题的页签：${headingTabs.join(' / ')}`)

    // 表格工具的全部改动走的是同一条撤销链：用「撤销」还原到进表格前的样子，别留给后面的断言。
    await page.getByRole('tab', { name: '编辑' }).click()
    const undoButton = ribbon.getByRole('button', { name: '撤销样式修改' })
    let tableRestored = false
    for (let attempt = 0; attempt < 24 && !tableRestored; attempt += 1) {
      if (await undoButton.isDisabled()) break
      await undoButton.click()
      await page.waitForTimeout(120)
      tableRestored = tableSignature(await readTable()) === tableSignature(initialTable)
    }
    check('表格工具里的改动可以用「撤销」整批还原', tableRestored, `还原到 ${tableSignature(initialTable)}`)
    await zoomSlider.fill('85')
    await page.getByRole('tab', { name: '开始' }).click()

    // 4f. 光标停在文件头（不在任何结构里）时，样式高亮落回正文段落
    //     （「光标离开表格 → 选项卡收起并回到开始」由 4e 末尾覆盖）
    await setCaret(page, 0)
    const fallbackCard = await until(
      async () => {
        const label = await page.locator('.style-card.active').first().getAttribute('aria-label')
        return label === '正文段落' ? label : ''
      },
      { label: '未定位时回落到正文样式' },
    )
    check('未定位到结构时默认跳到正文样式', true, `高亮：${fallbackCard}`)

    // 4g. 左侧大纲导航：点击把该标题顶到编辑器首行；到文末跳不动时就停在底部
    const navItems = await page.locator('.nav-item').count()
    const jumpTo = async (index) => {
      await page.locator('.nav-item').nth(index).click()
      await page.waitForTimeout(120)
      return readEditor(page)
    }

    const secondItem = await jumpTo(1)
    const thirdItem = await jumpTo(2)
    const expectedOffset = (await editorValue(page)).indexOf('## 研究背景')
    check(
      '大纲跳转把标题顶到编辑器首行',
      secondItem.scrollTop > 0 && secondItem.caret === expectedOffset && thirdItem.scrollTop > secondItem.scrollTop,
      `第 2 条 → ${secondItem.scrollTop}px，第 3 条 → ${thirdItem.scrollTop}px，光标落在偏移 ${secondItem.caret}`,
    )

    const lastItem = await jumpTo(navItems - 1)
    check(
      '文末的标题跳不动时停在底部',
      lastItem.scrollTop === lastItem.maxScroll && lastItem.maxScroll > 0,
      `停在 ${lastItem.scrollTop}px（上限 ${lastItem.maxScroll}px）`,
    )

    // 4g-2. 滚动到哪一段，大纲就高亮哪一条
    const activeNavText = async () => {
      const count = await page.locator('.nav-item.active').count()
      return count > 0 ? (await page.locator('.nav-item.active').first().innerText()).trim() : ''
    }
    await setScrollTop(page, 0)
    const topActive = await until(
      async () => {
        const active = await activeNavText()
        const first = (await page.locator('.nav-item').first().innerText()).trim()
        return active === first ? active : ''
      },
      { label: '滚到顶部高亮第一条' },
    )
    await setScrollTop(page, 1e7)
    const bottomActive = await until(
      async () => {
        const active = await activeNavText()
        const last = (await page.locator('.nav-item').last().innerText()).trim()
        return active === last ? active : ''
      },
      { label: '滚到底部高亮最后一条' },
    )
    check('滚动时大纲自动高亮当前章节', true, `顶部 → ${topActive}，底部 → ${bottomActive}`)

    await page.getByRole('button', { name: '收起导航面板' }).click()
    const navHidden = (await page.locator('.nav-panel').count()) === 0
    await page.getByRole('button', { name: '展开导航面板' }).click()
    check('导航面板可以折叠', navHidden && (await page.locator('.nav-panel').count()) === 1, '收起后隐藏，再点展开')

    // 4h. 编辑器与预览之间的分隔条可以推动
    const editorBefore = (await page.locator('.source-pane').boundingBox()).width
    let editorAfter = editorBefore
    // 拖动是一串指针事件，预览重排时可能整串落在忙碌窗口里；拖不动就重试，不把偶发的时序当成没这个功能。
    for (let attempt = 0; attempt < 3 && Math.abs(editorAfter - editorBefore - 90) >= 4; attempt += 1) {
      const splitter = await page.locator('.splitter').last().boundingBox()
      const delta = editorBefore + 90 - editorAfter
      await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + 200)
      await page.mouse.down()
      await page.mouse.move(splitter.x + splitter.width / 2 + delta, splitter.y + 200, { steps: 6 })
      await page.mouse.up()
      await page.waitForTimeout(150)
      editorAfter = (await page.locator('.source-pane').boundingBox()).width
    }
    check(
      '编辑器与预览之间可以推动调宽',
      Math.abs(editorAfter - editorBefore - 90) < 4,
      `${Math.round(editorBefore)}px → ${Math.round(editorAfter)}px`,
    )

    // 4i. 双向滚动同步：编辑器 → 预览
    await setScrollTop(page, 1e7)
    const previewScroll = await until(async () => {
      const top = await preview.locator('html').evaluate((element) => element.scrollTop || element.parentElement?.scrollTop || 0)
      return top > 0 ? top : 0
    }, { label: '预览跟随滚动', timeout: 10000 })
    check('编辑器滚动时预览跟随', true, `预览 scrollTop=${Math.round(previewScroll)}`)

    // 4i-2. 反向：在预览里滚鼠标滚轮，编辑器要跟着走
    await setScrollTop(page, 0)
    await page.waitForTimeout(400)
    const previewBox = await page.locator('.preview-pane').boundingBox()
    await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2)
    await page.mouse.wheel(0, 600)
    const editorAfterWheel = await until(
      async () => {
        const top = await editorScrollTop(page)
        return top > 0 ? top : 0
      },
      { label: '预览滚动时编辑器跟随', timeout: 10000 },
    )
    const previewAfterWheel = await preview.locator('html').evaluate((element) => Math.round(element.scrollTop))
    check(
      '预览滚动时编辑器跟随（双向同步）',
      editorAfterWheel > 0 && previewAfterWheel > 0,
      `预览 ${previewAfterWheel}px → 编辑器 ${editorAfterWheel}px`,
    )

    // 4i-3. 打一个字就会重排整篇。预览用前后两块画布：前面那块一直亮着，新内容在背面排完才换上来，
    //       所以既不该出现"先清空再重排"的闪白，也不该跳回文首。这里采样打字后的一段时间，
    //       预览的滚动位置必须一直留在原处（退回 0 就是那个"闪回开头再跳回来"的毛病）。
    const previewTop = () => preview.locator('html').evaluate((element) => Math.round(element.scrollTop))
    // 分页期间那块画布的身份会短暂变成 .preview-iframe-incoming（压在最上面、元素可见、内容藏着）。
    // 这一步必须压在上面：被完全遮住的 iframe，浏览器会把它的 requestAnimationFrame 限流到 1 帧/秒，
    // Paged.js 每排一页等一帧，正文一长就能从 0.3 秒拖到 15 秒。
    await page.evaluate(() => {
      window.__frameClasses = []
      for (const frame of document.querySelectorAll('.preview-frame iframe')) {
        new MutationObserver(() => window.__frameClasses.push(frame.className)).observe(frame, {
          attributes: true,
          attributeFilter: ['class'],
        })
      }
    })
    const canvases = await page.evaluate(() => ({
      active: document.querySelectorAll('iframe.preview-iframe').length,
      other: document.querySelectorAll('iframe.preview-iframe-spare, iframe.preview-iframe-incoming').length,
    }))
    check(
      '预览用两块画布（一块显示、一块预排）',
      canvases.active === 1 && canvases.other === 1,
      `显示 ${canvases.active} 块 / 预排 ${canvases.other} 块`,
    )

    await setScrollTop(page, 1e7)
    const previewBeforeEdit = await until(async () => {
      const top = await previewTop()
      return top > 200 ? top : 0
    }, { label: '预览滚到文末', timeout: 10000 })
    const paneClip = await page.locator('.preview-pane').boundingBox()
    const paneShotBytes = (await page.screenshot({ clip: paneClip })).length
    // 「正在渲染」可能只闪现几十毫秒，50ms 轮询会整段漏掉（这条断言以前就偶发假失败）；
    // 盯 DOM 文本变化，只要出现过一次就算数。
    await page.evaluate(() => {
      window.__renderingSeen = false
      const status = document.querySelector('.statusbar .page-status')
      if (!status) return
      const record = () => {
        if (status.textContent.includes('正在渲染')) window.__renderingSeen = true
      }
      record()
      new MutationObserver(record).observe(status, { childList: true, characterData: true, subtree: true })
    })
    await page.locator('.source-pane .cm-content').click()
    await page.keyboard.press('End')
    await page.keyboard.type('x')
    let previewLowest = previewBeforeEdit
    let paneShotSmallest = paneShotBytes
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await page.waitForTimeout(50)
      previewLowest = Math.min(previewLowest, await previewTop())
      // 顺带盯一眼画面：重排途中两块画布都不能「都不画」，否则那块区域会闪成灰底。
      if (attempt % 4 === 0) {
        paneShotSmallest = Math.min(paneShotSmallest, (await page.screenshot({ clip: paneClip })).length)
      }
    }
    check(
      '改动正文重排时预览不闪回文首',
      previewLowest > previewBeforeEdit * 0.5,
      `改前 ${previewBeforeEdit}px，重排全程最低 ${previewLowest}px`,
    )
    check(
      '改动正文重排时预览不空白',
      paneShotSmallest > paneShotBytes * 0.5,
      `截图 ${paneShotBytes} 字节 → 重排全程最小 ${paneShotSmallest} 字节（空白约 4k）`,
    )
    // 分页期间那块画布会把原生滚动条涂透明（visibility 盖不住它，拇指会跟着文档高度一涨一缩）；
    // 换到显示之后必须还原，别把用户的滚动条弄没了。
    const activeScrollbarColor = await preview.locator('html').evaluate((element) => element.style.scrollbarColor)
    check('预览恢复显示后滚动条样式也还原', activeScrollbarColor === '', `scrollbarColor = "${activeScrollbarColor}"`)
    const renderingLabelSeen = await page.evaluate(() => window.__renderingSeen === true)
    check('排版没排完时底部栏显示「正在渲染」', renderingLabelSeen, '完成后才换成「第 1 页，共 N 页」')
    const frameClasses = await page.evaluate(() => window.__frameClasses)
    check(
      '重排时分页画布压在最上面（不被限流）',
      frameClasses.includes('preview-iframe-incoming'),
      `画布身份变化：${[...new Set(frameClasses)].join(' → ')}`,
    )
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(600)

    // 4j. 三个展示模式
    await page.getByRole('button', { name: '仅展示编辑器' }).click()
    const editOnly = (await page.locator('.preview-pane').count()) === 0 && (await page.locator('.source-pane').count()) === 1
    await page.getByRole('button', { name: '仅展示预览' }).click()
    const previewOnly = (await page.locator('.source-pane').count()) === 0 && (await page.locator('.preview-pane').count()) === 1
    await page.getByRole('button', { name: '同时展示编辑器和预览' }).click()
    const both = (await page.locator('.source-pane').count()) === 1 && (await page.locator('.preview-pane').count()) === 1
    check('三种展示模式可以切换', editOnly && previewOnly && both, '仅编辑器 / 仅预览 / 同时展示')

    // 预览重新挂载时，备用画布会把它装着的那一版（更早的）也重新排一遍；它不能把自己抬成 incoming
    // 露在最上面，否则切回双栏看到的会是旧内容。
    await page.waitForTimeout(1500)
    const staleOnTop = await page.locator('iframe.preview-iframe-incoming').count()
    check('切回双栏后不会把更早一版露在最上面', staleOnTop === 0, `.preview-iframe-incoming = ${staleOnTop}`)

    // 5. 点击样式卡片 → 打开配置窗口，窗口内改字号即时生效
    await page.getByRole('button', { name: '一级标题', exact: true }).first().click()
    await page.waitForSelector('.style-dialog', { timeout: 5000 })
    const dialogTitle = (await page.locator('.style-dialog h2').innerText()).trim()
    check('点击样式打开配置窗口', dialogTitle === '一级标题', `窗口标题：${dialogTitle}`)

    // 字号下拉点弹窗内别处要收起：样式窗口在内部 stopPropagation 挡的是「点窗口内不该关窗口」，
    // 而 React 18 把委托挂在 #root，事件冒泡到那里就停了——收起下拉的监听必须走捕获阶段。
    await page.locator('.style-dialog').getByLabel('字号 pt候选').click()
    await page.locator('.combo-list').first().waitFor({ timeout: 3000 })
    const sectionHead = await page.locator('.style-dialog .section-title').first().boundingBox()
    await page.mouse.click(sectionHead.x + sectionHead.width / 2, sectionHead.y + sectionHead.height / 2)
    await page.waitForTimeout(150)
    check(
      '样式窗口里的字号下拉点别处会收起',
      (await page.locator('.combo-list').count()) === 0,
      '点在弹窗内的分区标题上',
    )

    const toolbarControlHeight = await page
      .locator('.rgroup input[type="text"]')
      .first()
      .evaluate((element) => getComputedStyle(element).height)
    const dialogControlHeight = await page
      .locator('.style-dialog input[type="text"]')
      .first()
      .evaluate((element) => getComputedStyle(element).height)
    check(
      '弹窗表单控件与工具栏同一套样式',
      toolbarControlHeight === dialogControlHeight,
      `弹窗 ${dialogControlHeight} / 工具栏 ${toolbarControlHeight}`,
    )

    // 「字形」那两个开关的外圈是 span 而不是 label：包成 label 时浏览器会把这一排里的第一个按钮
    // 当成"标签对应的控件"，鼠标停在下划线上也会给倾斜加上 :hover 底色，两个一起亮（真踩过）。
    await page.locator('.style-dialog').getByRole('button', { name: '下划线' }).hover()
    await page.waitForTimeout(150)
    const glyphHover = await page.locator('.style-dialog').evaluate((node) => {
      const background = (name) => {
        const button = node.querySelector(`.icon-toggle[aria-label="${name}"]`)
        return button ? getComputedStyle(button).backgroundColor : ''
      }
      return { italic: background('倾斜'), underline: background('下划线') }
    })
    check(
      '「字形」的倾斜 / 下划线只亮悬停的那一个',
      glyphHover.italic === 'rgba(0, 0, 0, 0)' && glyphHover.underline !== 'rgba(0, 0, 0, 0)',
      `倾斜 ${glyphHover.italic} / 下划线 ${glyphHover.underline}`,
    )

    // 标题文字要在标题栏里垂直居中（见 headPadding 的说明）
    const styleHeadPadding = await headPadding(page, '.style-dialog')
    check(
      '样式窗口的标题在标题栏里垂直居中',
      Math.abs(styleHeadPadding.above - styleHeadPadding.below) <= 1,
      `上留白 ${styleHeadPadding.above}px / 下留白 ${styleHeadPadding.below}px`,
    )

    // 继承链原来以小字挂在标题栏右侧，挪进「进阶」页：标题栏只留角色名与 id
    const styleHeadText = (await page.locator('.style-dialog .dialog-head').innerText()).replace(/\s+/g, ' ').trim()
    check('样式窗口的标题栏不再放继承链小字', !styleHeadText.includes('继承链'), `标题栏：${styleHeadText}`)
    await page.locator('.style-dialog').getByRole('tab', { name: '进阶' }).click()
    const advancedText = await page.locator('.style-dialog .section-text').first().innerText()
    check('继承链改到「进阶」页显示', advancedText.includes('当前继承链'), advancedText.trim())
    await page.locator('.style-dialog').getByRole('tab', { name: '字体' }).click()

    // 5b. 弹窗：没有遮罩底色，但会挡住底层；可拖动、可缩放
    const layerState = await page.locator('.dialog-layer').evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      blocksApp: [document.elementFromPoint(60, 26), document.elementFromPoint(1500, 120)].every((node) =>
        node?.classList.contains('dialog-layer'),
      ),
    }))
    check(
      '弹窗没有遮罩底色但仍挡住底层操作',
      layerState.blocksApp && layerState.background === 'rgba(0, 0, 0, 0)',
      `挡住底层=${layerState.blocksApp}，底色=${layerState.background}`,
    )

    const frameBefore = await page.locator('.style-dialog').boundingBox()
    // 样式窗口按表单宽度来，默认宽度就是下限（跟边框 / 页眉页脚两个窗口同一套改法）：
    // 原来固定 1000，最宽的一页也只用到 880 左右，右边空一条
    check(
      '样式窗口的默认宽度就是它的下限（340–420）',
      frameBefore.width >= 340 && frameBefore.width <= 420,
      `${Math.round(frameBefore.width)}×${Math.round(frameBefore.height)}`,
    )
    const handle = await page.locator('.dialog-head').boundingBox()
    await page.mouse.move(handle.x + 200, handle.y + 18)
    await page.mouse.down()
    await page.mouse.move(handle.x + 130, handle.y + 68, { steps: 6 })
    await page.mouse.up()
    const frameAfterDrag = await page.locator('.style-dialog').boundingBox()
    check(
      '弹窗可以按住标题栏拖动',
      Math.abs(frameAfterDrag.x - (frameBefore.x - 70)) < 3 && Math.abs(frameAfterDrag.y - (frameBefore.y + 50)) < 3,
      `位移 ${Math.round(frameAfterDrag.x - frameBefore.x)}, ${Math.round(frameAfterDrag.y - frameBefore.y)}`,
    )

    const grip = await page.locator('.dialog-resize').boundingBox()
    await page.mouse.move(grip.x + 8, grip.y + 8)
    await page.mouse.down()
    await page.mouse.move(grip.x + 98, grip.y + 78, { steps: 6 })
    await page.mouse.up()
    const frameAfterResize = await page.locator('.style-dialog').boundingBox()
    check(
      '弹窗右下角可以缩放',
      frameAfterResize.width > frameAfterDrag.width + 60 && frameAfterResize.height > frameAfterDrag.height + 40,
      `${Math.round(frameAfterDrag.width)}×${Math.round(frameAfterDrag.height)} → ${Math.round(frameAfterResize.width)}×${Math.round(frameAfterResize.height)}`,
    )

    await page.getByRole('tab', { name: '段落', exact: true }).click()
    const paragraphTabVisible = await page.locator('.form-section', { hasText: '分页' }).first().isVisible()
    check('窗口内按类别切换选项卡', paragraphTabVisible, '已切到「段落」类别')

    await page.getByRole('tab', { name: '字体', exact: true }).click()
    const cjkPicker = page.locator('.style-dialog input[role="combobox"][aria-label="中文字体"]')
    const latinPicker = page.locator('.style-dialog input[role="combobox"][aria-label="西文字体"]')
    const chainCollapsed = await page
      .locator('.style-dialog .advanced-block')
      .first()
      .evaluate((element) => element.open !== true)
    check(
      '样式窗口里中西文字体分开设置、回退链收进进阶项',
      (await cjkPicker.count()) === 1 &&
        (await latinPicker.count()) === 1 &&
        chainCollapsed &&
        (await latinPicker.inputValue()) === '使用中文字体',
      '中西文两个下拉，西文默认「使用中文字体」，「进阶：回退链」默认收起',
    )

    // 箭头是绝对定位在组合框壳上的：输入框没跟着壳长就会被压回 150px，箭头飘到框外（真踩过）
    const comboEdges = await page.locator('.style-dialog .font-primary-combo').first().evaluate((combo) => {
      const right = (selector) => combo.querySelector(selector)?.getBoundingClientRect().right ?? -1
      return { shell: combo.getBoundingClientRect().right, input: right('input'), toggle: right('.combo-toggle') }
    })
    check(
      '组合框的箭头贴在输入框右边',
      Math.abs(comboEdges.shell - comboEdges.input) < 1.5 && Math.abs(comboEdges.shell - comboEdges.toggle) < 1.5,
      `壳 ${Math.round(comboEdges.shell)} / 输入 ${Math.round(comboEdges.input)} / 箭头 ${Math.round(comboEdges.toggle)}`,
    )

    // 窗口里把西文字体设成 Arial：两个槽不同时，编译期用一对 @font-face 按字符区段分派
    await page.locator('.style-dialog').getByRole('button', { name: '西文字体候选' }).click()
    await page.waitForSelector('.combo-list', { timeout: 3000 })
    const westernLabels = await page.locator('.combo-list [role="option"] span').allTextContents()
    check(
      '西文字体候选也允许选中文字体（两个槽互不干扰）',
      westernLabels.includes('Arial') && westernLabels.includes('SimHei'),
      `${westernLabels.length} 个候选，中文字体也在列表里`,
    )
    await page.getByRole('option', { name: 'Arial' }).click()

    // 在预览里实测：同一个元素的拉丁字符按 Arial 排、中文字符按上一步设的 SimHei 排。
    // 这里不能只看 computed font-family——分成两槽时它是生成的家族名（stylemd-font-…），
    // 真正分派由 @font-face 的 unicode-range 决定，只能量宽度。
    const routing = await until(
      async () => {
        const measured = await preview.locator('[data-role="heading-1"]').first().evaluate((heading) => {
          const doc = heading.ownerDocument
          const measure = (family, text) => {
            const span = doc.createElement('span')
            span.style.cssText = 'position:absolute;visibility:hidden;font-size:64px;white-space:nowrap'
            span.style.fontFamily = family
            span.textContent = text
            doc.body.appendChild(span)
            const width = Math.round(span.getBoundingClientRect().width * 100) / 100
            span.remove()
            return width
          }
          const family = getComputedStyle(heading).fontFamily
          return {
            latin: measure(family, 'A'),
            cjk: measure(family, '中'),
            arialA: measure('Arial', 'A'),
            simheiA: measure('SimHei', 'A'),
            simheiCjk: measure('SimHei', '中'),
          }
        })
        // 拉丁必须按 Arial 排（而不是被中文字体接管），中文按 SimHei 排
        return measured.latin === measured.arialA && measured.latin !== measured.simheiA && measured.cjk === measured.simheiCjk
          ? measured
          : null
      },
      { label: '中西文按区段分派' },
    )
    check(
      '中西文按 unicode-range 分派到各自的字体',
      true,
      `A=${routing.latin}（Arial ${routing.arialA}，SimHei ${routing.simheiA}）/ 中=${routing.cjk}`,
    )

    // 样式窗口里的样本走内联样式，拿不到编译产物里的 @font-face，必须自己注入同一套；
    // 否则两个槽不同时样本会退回普通链，跟预览显示的不是同一个字体（真踩过）
    const specimenFamily = await page
      .locator('.style-dialog .sample-box > div')
      .evaluate((element) => getComputedStyle(element).fontFamily)
    const previewFamily = await preview
      .locator('[data-role="heading-1"]')
      .first()
      .evaluate((element) => getComputedStyle(element).fontFamily)
    check(
      '样式窗口的样本与预览用同一套字体分派',
      specimenFamily.split(',')[0].trim() === previewFamily.split(',')[0].trim(),
      `样本 ${specimenFamily.split(',')[0]} / 预览 ${previewFamily.split(',')[0]}`,
    )
    const sizeInput = page.locator('.style-dialog').getByLabel('字号 pt', { exact: true })
    await sizeInput.fill('26')
    await sizeInput.press('Enter')
    await until(
      async () => Math.abs((await readFontSizePt(preview.locator('[data-role="heading-1"]').first())) - 26) < 0.6,
      { label: '预览中的一级标题变为 26pt' },
    )
    check('窗口内改字号后预览即时更新', true, '→ 26pt')

    await page.getByRole('button', { name: '完成' }).click()
    await page.waitForSelector('.style-dialog', { state: 'detached', timeout: 5000 })
    check('配置窗口可以关闭', true, '点击「完成」后关闭')

    // 6. 换预设 → 编号与首行缩进生效
    await page.getByLabel('样式包', { exact: true }).selectOption('thesis-cn')
    const beforeContent = await until(
      async () => {
        const value = await preview
          .locator('[data-role="heading-1"]')
          .first()
          .evaluate((element) => getComputedStyle(element, '::before').content)
        return value && value !== 'none' && value !== 'normal' ? value : ''
      },
      { label: '标题自动编号生效' },
    )
    check('学位论文预设的章节编号生效', beforeContent.includes('第') && beforeContent.includes('章'), beforeContent)

    const indent = await preview
      .locator('[data-role="body-text"]')
      .first()
      .evaluate((element) => getComputedStyle(element).textIndent)
    check('正文首行缩进 2 字符生效', indent !== '0px' && indent !== 'normal', indent)

    const thesisTitlePt = await readFontSizePt(preview.locator('[data-role="heading-1"]').first())
    check('切换预设后标题字号随样式包改变', Math.abs(thesisTitlePt - 18) < 0.6, `${thesisTitlePt.toFixed(2)}pt`)

    // 7. 页面选项卡里的边距可读可改
    await page.getByRole('tab', { name: '页面', exact: true }).click()
    const marginBefore = await page.locator('.field:has-text("页边距") input').first().inputValue()
    check('页面设置面板可读', marginBefore === '30', `${marginBefore}mm`)

    // 数字框的增减箭头要常驻：Chromium 默认只在悬停/聚焦时才画。
    // 这里失焦并把鼠标停在角落，截图和「临时把箭头 opacity 归零」的同一区域对比；
    // 先验证同一状态两次截图逐字节一致，免得把 PNG 编码抖动当成差异（也证明箭头不是靠悬停画出来的）。
    // 顺带钉住页边距那行：4 个并排的输入框和网格列必须同宽，否则输入框会顶出列宽、
    // 吃掉 3px 列间距（值也会被常驻箭头挤掉）。
    const marginRow = await page.locator('.rgroup .quad-row').first().evaluate((row) => ({
      columns: getComputedStyle(row).gridTemplateColumns.split(' ').map((value) => Number.parseFloat(value)),
      widths: [...row.querySelectorAll('input[type="number"]')].map((input) => input.getBoundingClientRect().width),
    }))
    check(
      '页边距四个框与网格列同宽（不顶出列、不挤列间距）',
      marginRow.widths.length === 4 &&
        marginRow.widths.every((width, index) => Math.abs(width - marginRow.columns[index]) < 0.5),
      `列宽 ${marginRow.columns.join('/')}，输入框 ${marginRow.widths.join('/')}`,
    )

    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
    const spinBox = await page.locator('.quad-row input[type="number"]').first().boundingBox()
    const spinClip = { x: spinBox.x + spinBox.width - 16, y: spinBox.y, width: 15, height: spinBox.height }
    const shootSpinStrip = async () => {
      await page.mouse.move(2, 2)
      await page.waitForTimeout(80)
      return page.screenshot({ clip: spinClip })
    }
    const spinIdle = await shootSpinStrip()
    const spinIdleAgain = await shootSpinStrip()
    const spinDimStyle = await page.addStyleTag({
      content: 'input[type="number"]::-webkit-inner-spin-button { opacity: 0 !important; }',
    })
    const spinDimmed = await shootSpinStrip()
    await spinDimStyle.evaluate((node) => node.remove())
    check(
      '数字输入框的增减箭头不悬停也常驻',
      spinIdle.equals(spinIdleAgain) && !spinIdle.equals(spinDimmed),
      `箭头区域 ${spinIdle.length}B，藏掉箭头后 ${spinDimmed.length}B`,
    )

    const headerDistance = await page.getByLabel('页眉距顶部 mm').inputValue()
    check(
      '新增「页眉页脚」栏目：编辑入口与距边距离',
      headerDistance === '12' &&
        (await page.getByRole('button', { name: '编辑页眉' }).isVisible()) &&
        (await page.getByRole('button', { name: '编辑页脚' }).isVisible()),
      `页眉距顶 ${headerDistance}mm`,
    )

    const furniture = await until(
      async () => {
        const state = await preview.locator('.pagedjs_margin-top-center > [data-role="page-header"]').first().evaluate((element) => {
          const container = element.parentElement
          return {
            contentBorder: getComputedStyle(element).borderBottomWidth,
            containerBorder: container ? getComputedStyle(container).borderBottomWidth : '',
            alignment: getComputedStyle(element.parentElement).alignItems,
          }
        })
        return state.contentBorder !== '0px' && state.containerBorder === '0px' ? state : null
      },
      { label: '页眉横线挂在页眉段落上' },
    )
    check(
      '页眉横线是页眉段落的下边框，不画在容器上',
      true,
      `段落 ${furniture.contentBorder} / 容器 ${furniture.containerBorder} / 贴边对齐 ${furniture.alignment}`,
    )

    // 弹窗：左中右三段输入 + 快捷域插入；光标停在哪一段就插到哪一段。
    await page.getByRole('button', { name: '编辑页眉' }).click()
    const furnitureDialog = page.locator('.furniture-dialog')
    await furnitureDialog.waitFor({ timeout: 5000 })
    // 窗口贴着表单内容：三块表单一百多像素高，固定 720×360 会空掉一大半（宽度与高度都收下来了）；
    // 默认宽度就是下限，域按钮排两行也不影响读。
    const furnitureBox = await furnitureDialog.boundingBox()
    check(
      '页眉页脚窗口的默认宽度就是它的下限（460–540 宽、不超过 360 高）',
      furnitureBox.width >= 460 && furnitureBox.width <= 540 && furnitureBox.height <= 360,
      `${Math.round(furnitureBox.width)}×${Math.round(furnitureBox.height)}`,
    )
    const furnitureHeadPadding = await headPadding(page, '.furniture-dialog')
    check(
      '页眉页脚窗口的标题在标题栏里垂直居中',
      Math.abs(furnitureHeadPadding.above - furnitureHeadPadding.below) <= 1,
      `上留白 ${furnitureHeadPadding.above}px / 下留白 ${furnitureHeadPadding.below}px`,
    )
    const slotBefore = await furnitureDialog.getByLabel('页眉中部').inputValue()
    const hasThreeSlots =
      (await furnitureDialog.getByLabel('页眉左部').count()) === 1 &&
      (await furnitureDialog.getByLabel('页眉右部').count()) === 1
    await furnitureDialog.getByLabel('页眉中部').click()
    await furnitureDialog.getByLabel('页眉中部').press('End')
    await furnitureDialog.getByRole('button', { name: '页码' }).click()
    const slotAfter = await furnitureDialog.getByLabel('页眉中部').inputValue()
    check(
      '编辑页眉弹窗：三段输入 + 快捷域插入',
      hasThreeSlots && slotBefore === '{title}' && slotAfter === '{title}{page}',
      `三段 ${hasThreeSlots} / ${slotBefore} → ${slotAfter}`,
    )

    // 弹窗里的「样式」直接打开这个区域的样式窗口（page.header 角色），关掉后还能回到弹窗继续改。
    await furnitureDialog.getByRole('button', { name: '样式' }).click()
    const styleWindow = page.getByRole('dialog', { name: '页眉 样式配置' })
    await styleWindow.waitFor({ timeout: 5000 })
    // 标题栏只留角色名（角色 id「page.header」那行小字删了），认窗口靠标题与 aria-label
    const styleRole = (await styleWindow.locator('.dialog-title').innerText()).trim()
    const dialogStillOpen = await page.locator('.furniture-dialog').count()
    await styleWindow.getByRole('tab', { name: '边框与底纹', exact: true }).click()
    const borderSectionVisible = await styleWindow.locator('.form-section', { hasText: '边框' }).first().isVisible()
    await styleWindow.getByRole('button', { name: '完成' }).click()
    await page.waitForSelector('[aria-label="页眉 样式配置"]', { state: 'detached', timeout: 5000 })
    check(
      '弹窗里的「样式」打开页眉样式窗口',
      styleRole === '页眉' && dialogStillOpen === 1 && borderSectionVisible,
      `${styleRole} / 弹窗仍在 ${dialogStillOpen} 个 / 边框页 ${borderSectionVisible}`,
    )

    // 改距离与内容要真的进到预览：距离落在边距盒的 padding-top 上，内容进页眉段落的 ::after。
    await furnitureDialog.getByLabel('页眉左部').fill('StyleMD 页眉左')
    await furnitureDialog.getByLabel('页眉距页面顶部 mm').fill('20')
    await furnitureDialog.getByLabel('页眉中部').fill('StyleMD 测试页眉')
    await furnitureDialog.getByRole('button', { name: '完成' }).click()
    await page.waitForSelector('.furniture-dialog', { state: 'detached', timeout: 5000 })
    const furnitureEdit = await until(
      async () => {
        // 首页默认不显示页眉页脚，它的 ::after 是 content: none；要在真正显示页眉的那一页上核对。
        const states = await preview
          .locator('.pagedjs_margin-top-center > [data-role="page-header"]')
          .evaluateAll((elements) =>
            elements.map((element) => ({
              padding: getComputedStyle(element.parentElement).paddingTop,
              content: getComputedStyle(element, '::after').content,
            })),
          )
        const edited = states.find((state) => state.content.includes('测试页眉'))
        return edited && Math.abs(Number.parseFloat(edited.padding) - 75.6) < 2 ? edited : null
      },
      { label: '页眉页脚改动同步到预览' },
    )
    check('页眉页脚弹窗改动同步到预览', true, `padding-top ${furnitureEdit.padding} / ${furnitureEdit.content}`)

    // 只写左、中两段时，右段没内容也要把横线补满，不能断一截。
    const headerRow = await until(
      async () => {
        const row = await preview.locator('.pagedjs_page').nth(1).evaluate((pageEl) => {
          const rowBox = pageEl.querySelector('.pagedjs_margin-top').getBoundingClientRect()
          const parts = ['left', 'center', 'right'].map((position) => {
            const container = pageEl.querySelector('.pagedjs_margin-top-' + position)
            const content = container ? container.querySelector(':scope > .pagedjs_margin-content') : null
            const rect = content ? content.getBoundingClientRect() : null
            return {
              position,
              visible: container ? getComputedStyle(container).visibility === 'visible' : false,
              border: content ? Number.parseFloat(getComputedStyle(content).borderBottomWidth) : 0,
              width: rect ? Math.round(rect.width) : 0,
              height: rect ? Math.round(rect.height) : 0,
            }
          })
          return { rowWidth: Math.round(rowBox.width), parts }
        })
        const covered = row.parts.reduce((sum, part) => sum + part.width, 0)
        return row.parts.every((part) => part.visible && part.border > 0 && part.height > 2) &&
          Math.abs(covered - row.rowWidth) <= 2
          ? row
          : null
      },
      { label: '只写左中两段时右侧横线不断' },
    )
    check(
      '只写左中两段时右侧横线不断',
      true,
      headerRow.parts.map((part) => `${part.position} ${part.width}×${part.height}`).join(' / '),
    )

    // 取消要回滚到打开弹窗时的设置。
    await page.getByRole('button', { name: '编辑页脚' }).click()
    await furnitureDialog.waitFor({ timeout: 5000 })
    await furnitureDialog.getByLabel('页脚中部').fill('临时内容')
    await furnitureDialog.getByRole('button', { name: '取消' }).click()
    await page.waitForSelector('.furniture-dialog', { state: 'detached', timeout: 5000 })
    await page.getByRole('button', { name: '编辑页脚' }).click()
    await furnitureDialog.waitFor({ timeout: 5000 })
    const footerRestored = await furnitureDialog.getByLabel('页脚中部').inputValue()
    await furnitureDialog.getByRole('button', { name: '取消' }).click()
    await page.waitForSelector('.furniture-dialog', { state: 'detached', timeout: 5000 })
    check('页眉页脚弹窗按取消回滚', footerRestored === '{page}', `回滚到 ${footerRestored}`)

    // 把页眉改回预设值，别影响后面的截图与用例。
    await page.getByRole('button', { name: '编辑页眉' }).click()
    await furnitureDialog.waitFor({ timeout: 5000 })
    await furnitureDialog.getByLabel('页眉左部').fill('')
    await furnitureDialog.getByLabel('页眉中部').fill('{title}')
    await furnitureDialog.getByLabel('页眉距页面顶部 mm').fill('12')
    await furnitureDialog.getByRole('button', { name: '完成' }).click()
    await page.waitForSelector('.furniture-dialog', { state: 'detached', timeout: 5000 })

    // 8. 缩放通过 postMessage 同步进预览 iframe（iframe 已加 sandbox，不能再直接改 DOM）
    const zoomBefore = await preview.locator('.pagedjs_pages').evaluate((element) => getComputedStyle(element).zoom)
    await page.getByRole('button', { name: '放大预览' }).click()
    const zoomAfter = await until(
      async () => {
        const value = await preview.locator('.pagedjs_pages').evaluate((element) => getComputedStyle(element).zoom)
        return Math.abs(Number(value) - (Number(zoomBefore) + 0.1)) < 0.001 ? value : ''
      },
      { label: '预览缩放同步到 iframe' },
    )
    check('预览缩放通过消息同步到 iframe', true, `${zoomBefore} → ${zoomAfter}`)

    // 等分页彻底落定再截图，保证留档的图与状态栏一致。
    await until(async () => /第 1 页，共/.test(await page.locator('.statusbar .page-status').innerText()), {
      label: '切换样式包后分页状态落定',
    })
    await page.screenshot({ path: path.join(artifactDir, 'demo-smoke.png'), fullPage: false })

    // 8e. 「文件」菜单的展开规则：悬停即开、移开即收、点击钉住；外加「自动保存」开关
    const fileTab = page.getByRole('button', { name: '文件', exact: true })
    const fileTabBox = await fileTab.boundingBox()
    const tabCenter = { x: fileTabBox.x + fileTabBox.width / 2, y: fileTabBox.y + fileTabBox.height / 2 }
    const awayInHost = { x: 300, y: 520 }
    const filePreviewBox = await page.locator('.preview-iframe').boundingBox()
    const filePreviewCenter = { x: filePreviewBox.x + filePreviewBox.width / 2, y: filePreviewBox.y + filePreviewBox.height / 2 }

    await page.mouse.move(tabCenter.x, tabCenter.y)
    await page.waitForSelector('.file-panel', { timeout: 3000 })
    await page.mouse.move(awayInHost.x, awayInHost.y)
    await page.waitForTimeout(400)
    const hoverOpenedAndClosed = (await page.locator('.file-panel').count()) === 0
    check('悬停「文件」即展开，移开即收起', hoverOpenedAndClosed, '悬停展开 → 移到编辑器上方收起')

    // 指针移进预览 iframe 后父文档收不到任何鼠标事件，靠预览 postMessage 通报位置
    await page.mouse.move(tabCenter.x, tabCenter.y)
    await page.waitForSelector('.file-panel', { timeout: 3000 })
    await page.mouse.move(filePreviewCenter.x, filePreviewCenter.y)
    await page.waitForTimeout(400)
    const closedOnPreview = (await page.locator('.file-panel').count()) === 0
    check('指针移进预览 iframe 也会收起', closedOnPreview, '预览通报 stylemd:pointer')

    await fileTab.click()
    await page.waitForSelector('.file-panel', { timeout: 3000 })
    await page.mouse.move(awayInHost.x, awayInHost.y)
    await page.waitForTimeout(400)
    const pinnedStaysOpen = (await page.locator('.file-panel').count()) === 1
    await page.mouse.click(awayInHost.x, awayInHost.y)
    await page.waitForTimeout(250)
    const outsideClosed = (await page.locator('.file-panel').count()) === 0
    check(
      '点击「文件」后长期展开，点别处才收起',
      pinnedStaysOpen && outsideClosed,
      `移开仍展开=${pinnedStaysOpen}，点空白收起=${outsideClosed}`,
    )

    const underline = await page.locator('.file-tab').evaluate((node) => getComputedStyle(node).borderBottomColor)
    check('「文件」选项卡不再画选中下边线', underline === 'rgba(0, 0, 0, 0)', underline)

    await fileTab.click()
    await page.waitForSelector('.file-panel', { timeout: 3000 })
    const autoSaveBox = page.getByRole('checkbox', { name: '自动保存' })
    const autoSaveDefault = await autoSaveBox.isChecked()
    const autoSaveMarker = '关闭自动保存标记'
    const savedLabel = async () =>
      (await page.locator('.statusbar').innerText()).match(/已(?:自动)?保存 \d{2}:\d{2}/)?.[0] ?? ''
    const savedLabelBefore = await savedLabel()
    await autoSaveBox.uncheck()
    await page.keyboard.press('Escape')
    await page.locator('.source-pane .cm-content').click()
    await page.keyboard.press('End')
    await page.keyboard.type(autoSaveMarker)
    await page.waitForTimeout(800)
    const storedWhileOff = await page.evaluate(() => window.localStorage.getItem('stylemd:session:v1') ?? '')
    const savedLabelAfter = await savedLabel()
    check(
      '关掉自动保存后不再写会话存档，状态栏停在最后一次保存时间',
      autoSaveDefault && !storedWhileOff.includes(autoSaveMarker) && savedLabelBefore !== '' && savedLabelAfter === savedLabelBefore,
      `默认勾选=${autoSaveDefault}，状态栏「${savedLabelAfter}」不再前进`,
    )

    await fileTab.click()
    await page.waitForSelector('.file-panel', { timeout: 3000 })
    await page.getByRole('checkbox', { name: '自动保存' }).check()
    await page.keyboard.press('Escape')
    const writtenBack = await until(
      async () =>
        (await page.evaluate(() => window.localStorage.getItem('stylemd:session:v1') ?? '')).includes(autoSaveMarker),
      { label: '重新勾选自动保存后写回会话' },
    )
    check(
      '重新勾选自动保存后恢复写入',
      writtenBack && /已自动保存 \d{2}:\d{2}/.test(await page.locator('.statusbar').innerText()),
      '会话写回 + 状态栏显示「已自动保存 + 时间」',
    )

    // 9. 文件菜单与标题栏：文件名就地重命名、保存、新建、载入示例
    await page.getByRole('button', { name: '文件', exact: true }).click()
    await page.waitForSelector('.file-panel', { timeout: 5000 })
    const menuItems = await page.locator('.file-item').allInnerTexts()
    check(
      '新增「文件」菜单',
      ['新建', '打开…', '保存', '另存为…', '自动保存'].every((label) => menuItems.includes(label)) &&
        !menuItems.includes('重命名…'),
      menuItems.join(' / '),
    )

    // 标题栏：大字是文件名（不含 .md），灰色小字是文档标题
    const titlebar = await page.evaluate(() => {
      const file = document.querySelector('.doc-file')
      const sub = document.querySelector('.doc-subtitle')
      return {
        file: file?.textContent ?? '',
        sub: sub?.textContent ?? '',
        fileSize: file ? Number.parseFloat(getComputedStyle(file).fontSize) : 0,
        subSize: sub ? Number.parseFloat(getComputedStyle(sub).fontSize) : 0,
      }
    })
    check(
      '标题栏是「文件名（大字）+ 文档标题（灰色小字）」',
      titlebar.file.length > 0 &&
        !/\.md$/i.test(titlebar.file) &&
        titlebar.sub === 'StyleMD 样式模型设计说明' &&
        titlebar.fileSize > titlebar.subSize,
      `${titlebar.file}（${titlebar.fileSize}px） / ${titlebar.sub}（${titlebar.subSize}px）`,
    )

    await page.locator('.doc-file').click()
    await page.locator('.doc-file-input').fill('重命名后的文件名')
    await page.keyboard.press('Enter')
    const renamed = await until(async () => (await page.locator('.doc-file').innerText()).trim(), {
      label: '标题栏重命名生效',
    })
    check('点击文件名回车即完成重命名', renamed === '重命名后的文件名', `标题栏：${renamed}`)

    // 等这一次重命名触发的自动存档落定，再手动保存，否则可能被自动存档覆盖掉「已保存」的措辞
    await page.waitForTimeout(600)
    // 没有 File System Access API 的浏览器（Firefox / Safari）里「保存」退回下载，先关掉能力验证兜底路径
    await page.evaluate(() =>
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, writable: true, configurable: true }),
    )
    await page.getByRole('button', { name: '文件', exact: true }).click()
    await page.waitForSelector('.file-panel', { timeout: 5000 })
    const download = page.waitForEvent('download', { timeout: 5000 })
    await page.getByRole('menuitem', { name: '保存', exact: true }).click()
    const saved = await download
    check(
      '没有文件写入能力时「保存」退回下载，并用标题栏里的文件名',
      saved.suggestedFilename() === '重命名后的文件名.md',
      saved.suggestedFilename(),
    )
    const manualLabel = ((await page.locator('.statusbar').innerText()).match(/已(?:自动)?保存 \d{2}:\d{2}/) ?? [''])[0]
    check('手动保存后状态栏显示「已保存 + 时间」', manualLabel.startsWith('已保存'), manualLabel || '没有保存时间')

    // 有 File System Access API 时「保存」要写回文件：用假句柄接住写入，避免弹真正的系统对话框
    await page.evaluate(() => {
      window.__fileSaves = { picked: 0, writes: [] }
      window.showSaveFilePicker = async (options) => {
        window.__fileSaves.picked += 1
        return {
          name: options?.suggestedName ?? 'untitled.md',
          async createWritable() {
            return {
              async write(text) {
                window.__fileSaves.writes.push(text)
              },
              async close() {},
            }
          },
        }
      }
    })
    await page.getByRole('button', { name: '文件', exact: true }).click()
    await page.waitForSelector('.file-panel', { timeout: 5000 })
    await page.getByRole('menuitem', { name: '保存', exact: true }).click()
    const firstWrite = await until(
      async () => {
        const state = await page.evaluate(() => window.__fileSaves)
        return state.writes.length === 1 ? state : null
      },
      { label: '「保存」写回文件' },
    )
    const textAtSave = await editorValue(page)
    check(
      '「保存」写回文件而不是下载',
      firstWrite.writes[0] === textAtSave && firstWrite.picked === 1,
      `弹出选择框 ${firstWrite.picked} 次，写入 ${firstWrite.writes[0].length} 字符`,
    )
    await page.getByRole('button', { name: '文件', exact: true }).click()
    await page.waitForSelector('.file-panel', { timeout: 5000 })
    await page.getByRole('menuitem', { name: '保存', exact: true }).click()
    const secondWrite = await until(
      async () => {
        const state = await page.evaluate(() => window.__fileSaves)
        return state.writes.length === 2 ? state : null
      },
      { label: '再次「保存」直接写回原文件' },
    )
    check('已有文件句柄时不再弹选择框', secondWrite.picked === 1, `选择框只弹过 ${secondWrite.picked} 次`)

    await page.getByRole('button', { name: '文件', exact: true }).click()
    await page.waitForSelector('.file-panel', { timeout: 5000 })
    await page.getByRole('menuitem', { name: '新建' }).click()
    const blank = await until(async () => {
      const value = await editorValue(page)
      return value.includes('title: 未命名文档') && value.includes('# 一级标题') ? value : ''
    }, { label: '新建文档' })
    check('文件菜单可以新建文档', blank.startsWith('---'), '生成带前置元数据的空白文档')

    await page.getByRole('button', { name: '文件', exact: true }).click()
    await page.waitForSelector('.file-panel', { timeout: 5000 })
    await page.getByRole('menuitem', { name: '载入示例文档' }).click()
    await until(async () => (await editorValue(page)).includes('StyleMD 样式模型设计说明'), {
      label: '恢复示例文档',
    })

    // 10. 会话记忆：改点内容 + 落个光标，刷新后原样恢复
    //     光标直接放进二级标题文字里：大纲是防抖算出来的，刚换过文档时偏移可能还是上一份的。
    const headingText = await editorValue(page)
    await setCaret(page, headingText.indexOf('## 研究背景') + '## 研究背景'.length)
    await page.keyboard.type(' 会话标记')
    const beforeReload = { value: await editorValue(page), caret: await editorCaret(page) }
    await page.waitForTimeout(700)
    check(
      '底部栏显示已自动保存时间',
      /已自动保存 \d{2}:\d{2}/.test(await page.locator('.statusbar').innerText()),
      '写入 localStorage',
    )

    await page.reload({ waitUntil: 'load' })
    const restored = await until(
      async () => {
        const state = { value: await editorValue(page), caret: await editorCaret(page) }
        return state.value === beforeReload.value && state.caret === beforeReload.caret ? state : null
      },
      { label: '刷新后恢复文档与光标' },
    )
    check('刷新后恢复上次文档与光标位置', true, `光标复位到偏移 ${restored.caret}`)
    const restoredFile = (await page.locator('.doc-file').innerText()).trim()
    check('刷新后文件名也一并恢复', restoredFile === '重命名后的文件名', `标题栏：${restoredFile}`)
    const restoredRole = await until(async () => {
      const text = await page.locator('.statusbar .locator').innerText()
      return text.includes('二级标题') ? text.trim() : ''
    }, { label: '恢复后定位一致' })
    check('恢复后结构定位一致', true, restoredRole)

    // 12. 编辑器高亮与配色：功能区改版、语法上色、结构高亮、预设切换与持久化
    await page.getByRole('tab', { name: '编辑', exact: true }).click()
    const schemeEntry = await page.getByText('高亮配色').count()
    const stylesTabGone = (await page.getByRole('tab', { name: '样式', exact: true }).count()) === 0
    check(
      '功能区去掉「样式」页并新增「编辑」页',
      schemeEntry > 0 && stylesTabGone,
      '「样式」与「开始」重复，已移除；高亮配色落在「编辑」页',
    )

    // 「高亮配色」栏里直接摊着方案，点一下就切，不用先开窗
    const chipNames = await page.locator('.scheme-chip-name').allInnerTexts()
    check(
      '高亮配色栏固定展示 5 个方案',
      chipNames.length === 5 && ['纸感', '鲜明', '黑白', '夜读', '高对比'].every((name) => chipNames.includes(name)),
      chipNames.join(' / '),
    )

    // 点「夜读」：编辑区底色与原生 color-scheme 一起变
    await page.getByRole('button', { name: '夜读', exact: true }).click()
    const darkApplied = await until(
      async () => {
        const state = await page.evaluate(() => {
          // 底色与 color-scheme 挂在编辑器本身（.cm-editor）上，不再挂在容器上——
          // 面板里的实时预览是同一套样式，所以这两个值必须读编辑器元素。
          const host = document.querySelector('.source-input .cm-editor')
          const style = getComputedStyle(host)
          return { bg: style.backgroundColor, scheme: style.colorScheme }
        })
        return state.scheme === 'dark' ? state : null
      },
      { label: '点工具带上的方案直接切换' },
    )
    check('点工具带上的配色方案即切换', /rgb\(19, 26, 38\)/.test(darkApplied.bg), `${darkApplied.bg} · color-scheme: ${darkApplied.scheme}`)

    // 切成深色方案后，编辑器的滚动条滑块也要跟着换到更亮的那一档（applyScheme → --ed-scroll-thumb）
    const darkThumb = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.cm-scroller')).getPropertyValue('--scroll-thumb').trim(),
    )
    // 浅色那档 RGB 合计 393，深色那档 596
    const darkThumbSum = rgbSum(darkThumb)
    check(
      '深色方案下编辑器滚动条滑块换成更亮的一档',
      darkThumbSum > 500,
      `${darkThumb}（RGB 合计 ${darkThumbSum}）`,
    )

    const reorderedFirst = await page.locator('.scheme-chip-name').first().innerText()
    check('最近选用的方案自动排到最前', reorderedFirst.trim() === '夜读', `第一位：${reorderedFirst.trim()}`)

    // 细调与导入导出仍走面板
    await page.getByRole('button', { name: /更多/ }).click()
    await page.waitForSelector('.scheme-dialog', { timeout: 5000 })
    const presetNames = await page.locator('.scheme-card-name').allInnerTexts()
    check(
      '「更多」打开配色面板',
      ['纸感', '鲜明', '黑白', '夜读', '高对比'].every((name) => presetNames.some((text) => text.includes(name))),
      presetNames.map((text) => text.replace(/\s+/g, '')).join(' / '),
    )

    // 预览必须是「所见即所得」：底色、前景、行号槽都得跟真身一样
    const previewSurface = await page.evaluate(() => {
      const editor = document.querySelector('.scheme-preview-host .cm-editor')
      if (!editor) return null
      const style = getComputedStyle(editor)
      return {
        bg: style.backgroundColor,
        scheme: style.colorScheme,
        gutter: getComputedStyle(document.querySelector('.scheme-preview-host .cm-gutters')).backgroundColor,
      }
    })
    check(
      '实时预览里能看到编辑器底色',
      previewSurface?.bg === 'rgb(19, 26, 38)' && previewSurface.scheme === 'dark',
      `${previewSurface?.bg} · color-scheme: ${previewSurface?.scheme}`,
    )

    // 面板里点选：工具栏要跟着排，面板自己先不重排（用户正在这里调色，卡片跳位很难受）
    const dialogOrderBefore = await page.locator('.scheme-card-name').allInnerTexts()
    await page.getByRole('radio', { name: '高对比内置', exact: true }).click()
    const dialogOrderAfter = await page.locator('.scheme-card-name').allInnerTexts()
    check(
      '面板内点选不重排（避免选项跳动）',
      JSON.stringify(dialogOrderAfter) === JSON.stringify(dialogOrderBefore),
      dialogOrderAfter.map((text) => text.replace(/\s+/g, '')).join(' / '),
    )

    await page.getByRole('button', { name: '关闭' }).click()
    const ribbonAfterPanelPick = await page.locator('.scheme-chip-name').allInnerTexts()
    check(
      '面板里选的方案在工具栏排到最前',
      ribbonAfterPanelPick[0]?.trim() === '高对比',
      ribbonAfterPanelPick.join(' / '),
    )

    await page.getByRole('button', { name: /更多/ }).click()
    const dialogOrderReopened = await page.locator('.scheme-card-name').allInnerTexts()
    check(
      '重新打开面板才按新顺序',
      dialogOrderReopened[0]?.includes('高对比') === true,
      dialogOrderReopened.map((text) => text.replace(/\s+/g, '')).join(' / '),
    )

    // 配色窗口与样式窗口共用同一套拖动 / 缩放：拖标题栏要走，拖右下角要变大
    const schemeBefore = await page.locator('.scheme-dialog').boundingBox()
    // 标题栏只留「编辑器配色」：那行「只影响源码编辑区…」的小字删掉了
    const schemeHeadText = (await page.locator('.scheme-dialog .dialog-head').innerText()).replace(/\s+/g, ' ').trim()
    check(
      '配色窗口的标题栏不再挂说明小字',
      schemeHeadText.startsWith('编辑器配色') && !schemeHeadText.includes('只影响'),
      `标题栏：${schemeHeadText}`,
    )
    // 两栏（预览 + 色槽）：原来默认铺到 980，预览那栏比内容宽不少，收到 900
    check(
      '配色窗口的默认宽度不再铺满（不超过 920）',
      schemeBefore.width <= 920 && schemeBefore.width >= 660,
      `${Math.round(schemeBefore.width)}×${Math.round(schemeBefore.height)}`,
    )
    const schemeHead = await page.locator('.scheme-dialog .dialog-head').boundingBox()
    await page.mouse.move(schemeHead.x + 60, schemeHead.y + schemeHead.height / 2)
    await page.mouse.down()
    await page.mouse.move(schemeHead.x + 60 - 70, schemeHead.y + schemeHead.height / 2 + 40, { steps: 6 })
    await page.mouse.up()
    const schemeDragged = await page.locator('.scheme-dialog').boundingBox()
    check(
      '配色窗口可以拖标题栏移动（与样式窗口同一套）',
      Math.abs(schemeDragged.x - schemeBefore.x + 70) < 4 && Math.abs(schemeDragged.y - schemeBefore.y - 40) < 4,
      `位移 ${Math.round(schemeDragged.x - schemeBefore.x)}, ${Math.round(schemeDragged.y - schemeBefore.y)}`,
    )

    const resize = await page.locator('.scheme-dialog .dialog-resize').boundingBox()
    await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2)
    await page.mouse.down()
    await page.mouse.move(resize.x + resize.width / 2 + 60, resize.y + resize.height / 2 + 50, { steps: 6 })
    await page.mouse.up()
    const schemeResized = await page.locator('.scheme-dialog').boundingBox()
    check(
      '配色窗口可以拖右下角缩放',
      Math.abs(schemeResized.width - schemeBefore.width - 60) < 4 && Math.abs(schemeResized.height - schemeBefore.height - 50) < 4,
      `${Math.round(schemeBefore.width)}×${Math.round(schemeBefore.height)} → ${Math.round(schemeResized.width)}×${Math.round(schemeResized.height)}`,
    )

    // 改内置方案里的一个色槽：应当自动落一份自定义副本，而不是改坏预设
    await page.getByLabel('标题文字色值').fill('#ff8800')
    const forked = await until(
      async () => {
        const names = await page.locator('.scheme-card-name').allInnerTexts()
        return names.some((text) => text.includes('副本')) ? names.map((text) => text.replace(/\s+/g, '')).join(' / ') : ''
      },
      { label: '改内置配色自动存成副本' },
    )
    check('改内置方案的颜色会自动生成自定义副本', forked.includes('副本'), forked)

    const headingVariable = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--syn-heading').trim(),
    )
    check('改色槽立刻写进 CSS 变量', headingVariable === '#ff8800', `--syn-heading = ${headingVariable}`)

    await page.getByRole('button', { name: '关闭' }).click()
    const ribbonAfterCustom = await page.locator('.scheme-chip-name').allInnerTexts()
    const moreLabel = (await page.locator('.scheme-more').innerText()).trim()
    check(
      '自定义方案排到最前，工具带仍只展示 5 个',
      ribbonAfterCustom.length === 5 &&
        ribbonAfterCustom[0]?.includes('副本') &&
        moreLabel.includes('+1'),
      `${ribbonAfterCustom.join(' / ')}｜${moreLabel}`,
    )
    const headingColor = await until(
      async () => {
        const color = await page.evaluate(() => {
          const node = document.querySelector('.cm-md-heading')
          return node ? getComputedStyle(node).color : ''
        })
        return color ? color : ''
      },
      { label: '语法高亮生效' },
    )
    check('Markdown 语法按配色上色', headingColor === 'rgb(255, 136, 0)', `标题计算色 ${headingColor}`)

    // 结构高亮：光标放进标题，源码里出现结构块装饰
    await putCaretInFirstHeading(page)
    const roleBlockCount = await until(
      async () => {
        const count = await page.locator('.cm-role-bar').count()
        return count > 0 ? count : 0
      },
      { label: '结构高亮出现' },
    )
    check('光标所在结构在行号旁画出竖线', roleBlockCount > 0, `${roleBlockCount} 行带结构竖线`)

    // 配色写在独立存档里：刷新后仍然生效
    await page.reload({ waitUntil: 'load' })
    const persistedHeading = await until(
      async () => {
        const value = await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--syn-heading').trim(),
        )
        return value === '#ff8800' ? value : ''
      },
      { label: '配色写入独立存档' },
    )
    check('配色方案刷新后仍然生效', persistedHeading === '#ff8800', '--syn-heading 保持自定义值')

    // 收尾：删掉测试造出来的副本并回到默认配色，免得影响下一次运行
    await page.getByRole('tab', { name: '编辑', exact: true }).click()
    await page.getByRole('button', { name: /更多/ }).click()
    await page.waitForSelector('.scheme-dialog', { timeout: 5000 })
    await page.getByRole('radio', { name: /副本/ }).click()
    await page.getByRole('button', { name: '删除该方案' }).click()
    await page.getByRole('radio', { name: '纸感内置', exact: true }).click()
    await page.getByRole('button', { name: '关闭' }).click()
    const backToDefault = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--syn-heading').trim(),
    )
    check('恢复默认配色后回到纸感', backToDefault === '#1d4ed8', `--syn-heading = ${backToDefault}`)

    // 13. 控制台错误
    check('运行期无控制台错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
  } finally {
    await browser.close()
    server.close()
  }

  const failed = results.filter((result) => !result.passed)
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(`\n冒烟测试异常：${error.message}`)
  process.exitCode = 1
})
