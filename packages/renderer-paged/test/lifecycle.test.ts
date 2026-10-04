import { describe, expect, it } from 'vitest'
import { PREVIEW_CHROME_CSS, injectHeadStyle, injectPagedPolyfill } from '../src/index'

const source = '<html><head><title>t</title></head><body><p>hi</p></body></html>'
const preview = injectPagedPolyfill(injectHeadStyle(source, PREVIEW_CHROME_CSS), '/*polyfill*/', 'id-1')

/** 取一段生命周期脚本，便于按「某段代码里有什么」断言，不受别处改动影响。 */
function between(start: string, end: string): string {
  const from = preview.indexOf(start)
  const to = preview.indexOf(end, from)
  expect(from, `找不到片段起点：${start}`).toBeGreaterThan(-1)
  return preview.slice(from, to)
}

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
