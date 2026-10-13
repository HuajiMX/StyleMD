import { describe, expect, it } from 'vitest'
import { PREVIEW_CHROME_CSS, injectHeadStyle, injectPagedPolyfill } from '../src/index'

const source = '<html><head><title>t</title></head><body><p>hi</p></body></html>'
const preview = injectPagedPolyfill(injectHeadStyle(source, PREVIEW_CHROME_CSS), '/*polyfill*/', 'id-1')

/** 取一段生命周期脚本，便于按「某段代码里有什么」断言，不受别处改动影响。 */
function between(start: string, end: string, html = preview): string {
  const from = html.indexOf(start)
  const to = html.indexOf(end, from)
  expect(from, `找不到片段起点：${start}`).toBeGreaterThan(-1)
  return html.slice(from, to)
}

/** 带键位表的那一份：宿主把「有哪些快捷键」注进来，帧只认不处理。 */
const withKeys = injectPagedPolyfill(source, '/*polyfill*/', 'id-2', [
  { id: 'save', key: 's', shift: false },
  { id: 'saveAs', key: 's', shift: true },
])

describe('预览分页生命周期', () => {
  it('分页期间把文档藏起来：内容、背景与原生滚动条都要收干净', () => {
    const conceal = between('function conceal()', 'function reveal()')
    // 藏内容：还没排完的裸文档不能露给用户
    expect(conceal).toContain("visibility = 'hidden'")
    // 清背景：文档只要还被判成不透明，合成器就会把下面那块正在显示的画布一起丢掉，用户看到灰底闪一下
    expect(conceal).toContain("background = 'transparent'")
    // 滚滚动条要单独涂透明：它是原生滚动条，画在图层上，`visibility: hidden` 盖不住它。
    // 分页途中文档高度一页一变，拇指就会在预览右边一涨一缩（用户看到的就是「滚动条跳一下」）。
    expect(conceal).toContain("scrollbarColor = 'transparent transparent'")
  })

  it('露出内容时把藏起来的三样都还原回去', () => {
    const reveal = between('function reveal()', 'if (embedded)')
    expect(reveal).toContain("visibility = ''")
    expect(reveal).toContain("background = ''")
    expect(reveal).toContain("scrollbarColor = ''")
  })

  it('进度先记下、分页排完再补上，然后才露出内容并上报', () => {
    const load = between("if (desiredScroll !== null)", "report('paged'")
    // 顺序：补进度 → 露内容 → 等两帧（先画出来）→ 上报
    expect(load.indexOf('applyScroll(desiredScroll)')).toBeGreaterThan(-1)
    expect(load.indexOf('applyScroll(desiredScroll)')).toBeLessThan(load.indexOf('reveal()'))
    expect(load.indexOf('reveal()')).toBeLessThan(load.indexOf('requestAnimationFrame'))
  })

  it('独立打开导出文件时不需要藏（没有别的画布盖着它），分页失败也要露出来', () => {
    expect(preview).toContain("var embedded = window.parent !== window;")
    expect(preview).toContain('if (embedded) {')
    // 失败分支同样要 reveal，别把预览停在灰底上
    const failure = between("} catch (error) {", 'report(\'error\'')
    expect(failure).toContain('reveal()')
  })
})

describe('预览里的快捷键转发', () => {
  it('键位表由宿主注入，帧里照单全收', () => {
    expect(withKeys).toContain('[{"id":"save","key":"s","shift":false},{"id":"saveAs","key":"s","shift":true}]')
    // 不注入就没有键可认（独立打开的导出文件里没有宿主，也不需要）
    expect(preview).toContain('var shortcuts = [];')
  })

  it('认出来先同步拦默认行为，再把 id 转给宿主', () => {
    const forward = between('var shortcuts =', '// 跨页表格', withKeys)
    // 顺序反了就等于没拦：Chromium 收到 keydown 之后会立刻把 Ctrl+= / Ctrl+- / Ctrl+0 当整页缩放执行
    expect(forward.indexOf('event.preventDefault()')).toBeLessThan(forward.indexOf('postMessage'))
    expect(forward).toContain("type: 'stylemd:shortcut'")
    expect(forward).toContain('id: "id-2"')
    // 只认表里的组合：Ctrl+C / Ctrl+A 留给预览自己，文字要能选中、复制
    expect(forward).toContain('combo.key !== key')
    // 自己就是顶层文档时没有宿主可转
    expect(forward).toContain('window.parent === window')
  })
})
