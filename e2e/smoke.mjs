/**
 * 原型端到端冒烟测试：用本机已装好的 Chromium 打开构建产物，验证主链路真的能跑通。
 *
 * 覆盖的链路：
 *   光标定位 → 功能区字体/段落跟随 → 点开样式窗口 → 窗口内改字号 → 预览即时刷新
 *   → 切换样式包（编号与首行缩进生效）→ 页面设置 → 预览缩放到 iframe
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

/** 把光标放到文中第一处 `# ` 标题的文字里，用来验证功能区会跟随光标定位。 */
async function putCaretInFirstHeading(page) {
  const lineIndex = await page
    .locator('.source-input')
    .evaluate((element) => element.value.split('\n').findIndex((line) => line.startsWith('# ')))
  if (lineIndex < 0) throw new Error('示例文档里没有一级标题')
  // 用 focus 而不是 click：click 会把光标落在点到的位置，先经过别的结构再回到文首，
  // 断言时要多等一轮状态同步，没必要。
  await page.locator('.source-input').focus()
  await page.keyboard.press('Control+Home')
  for (let index = 0; index < lineIndex; index += 1) await page.keyboard.press('ArrowDown')
  for (let index = 0; index < 3; index += 1) await page.keyboard.press('ArrowRight')
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
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
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
    const tableLine = await page.locator('.source-input').evaluate((element) => {
      const lines = element.value.split('\n')
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (lines[index].startsWith('|')) return index + 1
      }
      return -1
    })
    await page.locator('.source-input').focus()
    await page.keyboard.press('Control+Home')
    for (let index = 0; index < tableLine; index += 1) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
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
    await page.locator('.source-input').focus()
    await page.keyboard.press('Control+Home')
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
    const readEditor = () =>
      page.locator('.source-input').evaluate((element) => ({
        scrollTop: Math.round(element.scrollTop),
        maxScroll: Math.round(element.scrollHeight - element.clientHeight),
        caret: element.selectionStart,
      }))
    const jumpTo = async (index) => {
      await page.locator('.nav-item').nth(index).click()
      await page.waitForTimeout(120)
      return readEditor()
    }

    const secondItem = await jumpTo(1)
    const thirdItem = await jumpTo(2)
    const expectedOffset = await page
      .locator('.source-input')
      .evaluate((element) => element.value.indexOf('## 研究背景'))
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

    await page.getByRole('button', { name: '收起导航面板' }).click()
    const navHidden = (await page.locator('.nav-panel').count()) === 0
    await page.getByRole('button', { name: '展开导航面板' }).click()
    check('导航面板可以折叠', navHidden && (await page.locator('.nav-panel').count()) === 1, '收起后隐藏，再点展开')

    // 4h. 编辑器与预览之间的分隔条可以推动
    const editorBefore = (await page.locator('.source-pane').boundingBox()).width
    const splitter = await page.locator('.splitter').last().boundingBox()
    await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + 200)
    await page.mouse.down()
    await page.mouse.move(splitter.x + splitter.width / 2 + 90, splitter.y + 200, { steps: 6 })
    await page.mouse.up()
    const editorAfter = (await page.locator('.source-pane').boundingBox()).width
    check(
      '编辑器与预览之间可以推动调宽',
      Math.abs(editorAfter - editorBefore - 90) < 4,
      `${Math.round(editorBefore)}px → ${Math.round(editorAfter)}px`,
    )

    // 4i. 双向滚动同步：编辑器 → 预览
    await page.locator('.source-input').evaluate((element) => { element.scrollTop = element.scrollHeight })
    const previewScroll = await until(async () => {
      const top = await preview.locator('html').evaluate((element) => element.scrollTop || element.parentElement?.scrollTop || 0)
      return top > 0 ? top : 0
    }, { label: '预览跟随滚动', timeout: 10000 })
    check('编辑器滚动时预览跟随', true, `预览 scrollTop=${Math.round(previewScroll)}`)

    // 4i-2. 反向：在预览里滚鼠标滚轮，编辑器要跟着走
    await page.locator('.source-input').evaluate((element) => { element.scrollTop = 0 })
    await page.waitForTimeout(400)
    const previewBox = await page.locator('.preview-pane').boundingBox()
    await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2)
    await page.mouse.wheel(0, 600)
    const editorAfterWheel = await until(
      async () => {
        const top = await page.locator('.source-input').evaluate((element) => Math.round(element.scrollTop))
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

    // 4j. 三个展示模式
    await page.getByRole('button', { name: '仅展示编辑器' }).click()
    const editOnly = (await page.locator('.preview-pane').count()) === 0 && (await page.locator('.source-pane').count()) === 1
    await page.getByRole('button', { name: '仅展示预览' }).click()
    const previewOnly = (await page.locator('.source-pane').count()) === 0 && (await page.locator('.preview-pane').count()) === 1
    await page.getByRole('button', { name: '同时展示编辑器和预览' }).click()
    const both = (await page.locator('.source-pane').count()) === 1 && (await page.locator('.preview-pane').count()) === 1
    check('三种展示模式可以切换', editOnly && previewOnly && both, '仅编辑器 / 仅预览 / 同时展示')

    // 5. 点击样式卡片 → 打开配置窗口，窗口内改字号即时生效
    await page.getByRole('button', { name: '一级标题', exact: true }).first().click()
    await page.waitForSelector('.style-dialog', { timeout: 5000 })
    const dialogTitle = (await page.locator('.style-dialog h2').innerText()).trim()
    check('点击样式打开配置窗口', dialogTitle === '一级标题', `窗口标题：${dialogTitle}`)

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

    // 9. 文件菜单：重命名、新建、载入示例
    await page.getByRole('button', { name: '文件' }).click()
    await page.waitForSelector('.file-panel', { timeout: 5000 })
    const menuItems = await page.locator('.file-item').allInnerTexts()
    check(
      '新增「文件」菜单',
      ['新建', '打开…', '保存', '另存为…', '重命名…'].every((label) => menuItems.includes(label)),
      menuItems.join(' / '),
    )

    await page.getByRole('menuitem', { name: '重命名…' }).click()
    await page.waitForSelector('.file-form', { timeout: 5000 })
    await page.getByLabel('文档标题').fill('重命名后的文档')
    await page.getByRole('button', { name: '确定' }).click()
    const renamed = await until(async () => {
      const title = await page.locator('.doc-title').innerText()
      return title.trim() === '重命名后的文档' ? title.trim() : ''
    }, { label: '重命名生效' })
    const frontmatterRenamed = await page.locator('.source-input').evaluate((element) => element.value.includes('title: 重命名后的文档'))
    check('文件菜单可以重命名文档', frontmatterRenamed, `标题栏：${renamed}`)

    await page.getByRole('button', { name: '文件' }).click()
    await page.waitForSelector('.file-panel', { timeout: 5000 })
    const download = page.waitForEvent('download', { timeout: 5000 })
    await page.getByRole('menuitem', { name: '保存', exact: true }).click()
    const saved = await download
    check('文件菜单可以保存为 .md', saved.suggestedFilename().endsWith('.md'), saved.suggestedFilename())

    await page.getByRole('button', { name: '文件' }).click()
    await page.waitForSelector('.file-panel', { timeout: 5000 })
    await page.getByRole('menuitem', { name: '新建' }).click()
    const blank = await until(async () => {
      const value = await page.locator('.source-input').inputValue()
      return value.includes('title: 未命名文档') && value.includes('# 一级标题') ? value : ''
    }, { label: '新建文档' })
    check('文件菜单可以新建文档', blank.startsWith('---'), '生成带前置元数据的空白文档')

    await page.getByRole('button', { name: '文件' }).click()
    await page.waitForSelector('.file-panel', { timeout: 5000 })
    await page.getByRole('menuitem', { name: '载入示例文档' }).click()
    await until(async () => (await page.locator('.source-input').inputValue()).includes('StyleMD 样式模型设计说明'), {
      label: '恢复示例文档',
    })

    // 10. 会话记忆：改点内容 + 落个光标，刷新后原样恢复
    await page.locator('.nav-item').nth(1).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' 会话标记')
    const beforeReload = await page
      .locator('.source-input')
      .evaluate((element) => ({ value: element.value, caret: element.selectionStart }))
    await page.waitForTimeout(700)
    check('底部栏显示已保存时间', /已保存 \d{2}:\d{2}/.test(await page.locator('.statusbar').innerText()), '写入 localStorage')

    await page.reload({ waitUntil: 'load' })
    const restored = await until(
      async () => {
        const state = await page
          .locator('.source-input')
          .evaluate((element) => ({ value: element.value, caret: element.selectionStart }))
        return state.value === beforeReload.value && state.caret === beforeReload.caret ? state : null
      },
      { label: '刷新后恢复文档与光标' },
    )
    check('刷新后恢复上次文档与光标位置', true, `光标复位到偏移 ${restored.caret}`)
    const restoredRole = await until(async () => {
      const text = await page.locator('.statusbar .locator').innerText()
      return text.includes('二级标题') ? text.trim() : ''
    }, { label: '恢复后定位一致' })
    check('恢复后结构定位一致', true, restoredRole)

    // 11. 控制台错误
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
