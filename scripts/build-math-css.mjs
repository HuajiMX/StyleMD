/**
 * 生成 packages/core/src/render/math-css.generated.ts。
 *
 * KaTeX 的样式表默认用 `url(fonts/...)` 相对路径取字体：预览 iframe 是 srcdoc（没有自己的
 * 文档地址），离线导出的 HTML 也可能被搬到任意目录，相对路径都会 404。这里把 woff2 字体内联成
 * data URI，让 build() 的产物自带公式字体，预览和导出一模一样。
 *
 * KaTeX 字体是 SIL OFL 授权的可再分发字体（Computer Modern 系），符合仓库的字体约束。
 * 升级 katex 后必须重跑：node scripts/build-math-css.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const katexDir = path.join(root, 'node_modules', 'katex', 'dist')
const targetFile = path.join(root, 'packages', 'core', 'src', 'render', 'math-css.generated.ts')

const version = JSON.parse(readFileSync(path.join(root, 'node_modules', 'katex', 'package.json'), 'utf8')).version
let css = readFileSync(path.join(katexDir, 'katex.min.css'), 'utf8')

const fonts = new Map()
css = css.replace(/url\(fonts\/([A-Za-z0-9_-]+)\.woff2\)/g, (whole, name) => {
  let data = fonts.get(name)
  if (!data) {
    const bytes = readFileSync(path.join(katexDir, 'fonts', `${name}.woff2`))
    data = `data:font/woff2;base64,${bytes.toString('base64')}`
    fonts.set(name, data)
  }
  return `url(${data})`
})

// woff / ttf 只是给老浏览器兜底；现代 Chromium 只走 woff2，留着会让产物再大一倍多。
css = css.replace(/,?url\(fonts\/[A-Za-z0-9_-]+\.(?:woff|ttf)\)\s*format\("[^"]*"\)/g, '')

if (/url\(fonts\//.test(css)) throw new Error('仍有字体没被内联，检查 katex.min.css 的写法是否变了')
if (fonts.size === 0) throw new Error('没有找到任何 woff2 字体，检查 katex/dist/fonts 是否存在')

const banner = `/**
 * 由 scripts/build-math-css.mjs 生成，不要手改。
 * KaTeX ${version} 的样式表 + 内联 woff2 字体：预览 iframe（srcdoc）与离线 HTML 导出都不依赖外部字体文件。
 */
`
const output = `${banner}export const KATEX_VERSION = ${JSON.stringify(version)}

export const KATEX_CSS = ${JSON.stringify(css)}
`

writeFileSync(targetFile, output, 'utf8')
const kb = Math.round(Buffer.byteLength(output) / 1024)
console.log(`已生成 ${path.relative(root, targetFile)}（KaTeX ${version}，内联 ${fonts.size} 个字体，${kb} KB）`)
