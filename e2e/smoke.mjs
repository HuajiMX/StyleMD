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

    // 4b. 字体框：只显示当前字体，下拉能选
    const ribbon = page.locator('.ribbon')
    await ribbon.getByRole('button', { name: '字体族候选' }).click()
    await page.waitForSelector('.combo-list', { timeout: 3000 })
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
    check('字体下拉可选并生效', true, headingFamily.split(',')[0])

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

    // 4e. 光标落到排在末尾的表格结构：画廊要自动滚过去，否则聚焦了也找不到
    const tableOffset = await lastLineStartOffset(page, '|')
    if (tableOffset < 0) throw new Error('示例文档里没有表格')
    await setCaret(page, tableOffset + 1)
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
        return state && state.role === '表格' && state.visible ? state : null
      },
      { label: '画廊自动滚到当前结构' },
    )
    check('样式聚焦时画廊自动滚动过去', galleryState.scrollLeft > 0, `滚动到 ${galleryState.scrollLeft}px，「表格」卡片可见`)

    // 4f. 光标离开所有结构（停在文件头）时，默认落到正文段落
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
    await page.locator('.source-pane .cm-content').click()
    await page.keyboard.press('End')
    await page.keyboard.type('x')
    let previewLowest = previewBeforeEdit
    let paneShotSmallest = paneShotBytes
    let renderingLabelSeen = false
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await page.waitForTimeout(50)
      previewLowest = Math.min(previewLowest, await previewTop())
      if (!renderingLabelSeen) {
        renderingLabelSeen = (await page.locator('.statusbar .page-status').innerText()).includes('正在渲染')
      }
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
    const styleRole = await styleWindow.locator('.role-id').innerText()
    const dialogStillOpen = await page.locator('.furniture-dialog').count()
    await styleWindow.getByRole('tab', { name: '边框与底纹', exact: true }).click()
    const borderSectionVisible = await styleWindow.locator('.form-section', { hasText: '边框' }).first().isVisible()
    await styleWindow.getByRole('button', { name: '完成' }).click()
    await page.waitForSelector('[aria-label="页眉 样式配置"]', { state: 'detached', timeout: 5000 })
    check(
      '弹窗里的「样式」打开页眉样式窗口',
      styleRole === 'page.header' && dialogStillOpen === 1 && borderSectionVisible,
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
