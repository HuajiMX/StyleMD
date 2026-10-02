/**
 * 导出路径检查：把 CLI 生成的两份 HTML 分别转成 PDF，并核对页眉页脚到底有没有出现。
 *
 * 这一步回答的是 M0 的核心问题：Chromium 自己打不打印 @page 页边距盒里的内容？
 * 结论会直接决定"页眉页脚 + 页码"由谁负责（Paged.js 还是 Chromium 原生打印）。
 */
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const artifactDir = path.resolve(here, 'artifacts')

function findChromium() {
  const base = path.join(process.env.LOCALAPPDATA, 'ms-playwright')
  const found = []
  for (const entry of readdirSync(base)) {
    if (!entry.startsWith('chromium-')) continue
    const candidate = path.join(base, entry, 'chrome-win64', 'chrome.exe')
    if (existsSync(candidate)) found.push(candidate)
  }
  return found.sort().reverse()[0]
}

function countPdfPages(buffer) {
  const text = buffer.toString('latin1')
  const plainPages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length
  if (plainPages > 0) return plainPages
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((match) => Number(match[1]))
  return counts.length > 0 ? Math.max(...counts) : null
}

await mkdir(artifactDir, { recursive: true })
const browser = await chromium.launch({ executablePath: findChromium(), headless: true })

async function inspect(name) {
  const file = path.join(artifactDir, `${name}.html`)
  const page = await browser.newPage()
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  const dom = await page.evaluate(() => {
    const bodyText = document.body.innerText
    return {
      pagedPages: document.querySelectorAll('.pagedjs_page').length,
      pagedMargins: document.querySelectorAll('[class*="pagedjs_margin"]').length,
      hasFooterTextInDom: /\d+\s*\/\s*\d+/.test(bodyText),
      sheetCount: document.querySelectorAll('.pagedjs_sheet').length,
      toolbarDisplay: (() => {
        const toolbar = document.querySelector('.stylemd-toolbar')
        return toolbar ? getComputedStyle(toolbar).display : null
      })(),
    }
  })

  await page.emulateMedia({ media: 'print' })
  const printState = await page.evaluate(() => {
    const toolbar = document.querySelector('.stylemd-toolbar')
    const pages = document.querySelector('.pagedjs_pages')
    return {
      toolbarDisplay: toolbar ? getComputedStyle(toolbar).display : null,
      pagesZoom: pages ? getComputedStyle(pages).zoom : null,
    }
  })
  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
  const pdfPath = path.join(artifactDir, `${name}.pdf`)
  await writeFile(pdfPath, pdf)
  const pages = countPdfPages(pdf)
  await page.close()

  return { name, dom, printState, pdfPages: pages, pdfBytes: pdf.length }
}

const native = await inspect('sample-native')
const paged = await inspect('sample-paged')

await browser.close()

console.log('原生分页（@page + 浏览器打印）')
console.log(`  分页容器数: ${native.dom.pagedPages}（Paged.js 未参与，预期为 0）`)
console.log(`  页眉页脚元素: ${native.dom.pagedMargins}`)
console.log(`  正文里是否出现页码文本: ${native.dom.hasFooterTextInDom}`)
console.log(`  打印工具栏（屏幕）: ${native.dom.toolbarDisplay ?? '不存在'}`)
console.log(`  打印态：工具栏 ${native.printState.toolbarDisplay ?? '不存在'} / 分页缩放 ${native.printState.pagesZoom ?? '不适用'}`)
console.log(`  导出 PDF: ${native.pdfPages ?? '?'} 页 / ${(native.pdfBytes / 1024).toFixed(0)} KB`)

console.log('\nPaged.js 分页')
console.log(`  分页容器数: ${paged.dom.pagedPages}`)
console.log(`  页眉页脚元素: ${paged.dom.pagedMargins}`)
console.log(`  正文里是否出现页码文本: ${paged.dom.hasFooterTextInDom}`)
console.log(`  打印工具栏（屏幕）: ${paged.dom.toolbarDisplay ?? '不存在'}`)
console.log(`  打印态：工具栏 ${paged.printState.toolbarDisplay ?? '不存在'} / 分页缩放 ${paged.printState.pagesZoom ?? '不适用'}`)
console.log(`  导出 PDF: ${paged.pdfPages ?? '?'} 页 / ${(paged.pdfBytes / 1024).toFixed(0)} KB`)

const conclusion = []
if (native.dom.pagedMargins === 0) {
  conclusion.push('原生 @page 页边距盒没有生成任何 DOM 元素 —— 页眉页脚是否被 Chromium 打印，需要看 PDF 实际效果')
}
if (paged.dom.pagedMargins > 0) {
  conclusion.push('Paged.js 把页眉页脚渲染成了真实元素，导出时会被一并打印')
}
if (paged.dom.toolbarDisplay && paged.dom.toolbarDisplay !== 'none') {
  conclusion.push('Paged.js 分页完成后打印工具栏在屏幕上重新显示，打印时由 @media print 隐藏')
} else if (paged.dom.toolbarDisplay === 'none') {
  conclusion.push('警告：Paged.js 路径下打印工具栏在屏幕上被隐藏，需要检查 print 规则是否被 polisher 展平')
}
if (paged.printState.toolbarDisplay === 'none' && paged.printState.pagesZoom === '1') {
  conclusion.push('打印态下工具栏隐藏且分页缩放复位为 1，屏幕外壳不会进入 PDF')
}
console.log('\n结论：')
for (const line of conclusion) console.log(`  - ${line}`)

const nativeSample = await readFile(path.join(artifactDir, 'sample-native.html'), 'utf8')
console.log(`\n原生 HTML 里是否存在 @page 页边距盒规则: ${/@top-center|@bottom-center/.test(nativeSample)}`)
