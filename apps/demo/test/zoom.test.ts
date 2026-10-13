import { describe, expect, it } from 'vitest'
import {
  EDITOR_FONT_DEFAULT_PX,
  EDITOR_FONT_MAX_PX,
  EDITOR_FONT_MIN_PX,
  ZOOM_MAX,
  ZOOM_MIN,
  clampEditorFontPx,
  clampZoom,
  takeWheelZoomSteps,
} from '../src/lib/zoom'

/** 累积器就是一个可变对象（App 里是 ref）。 */
const accumulator = (current = 0) => ({ current })

describe('缩放的范围与步长', () => {
  it('预览缩放夹在范围内，并抹掉 0.1 连加攒出来的浮点尾巴', () => {
    expect(clampZoom(0.7 + 0.1 + 0.1)).toBe(0.9)
    expect(clampZoom(0.85 + 0.1)).toBe(0.95)
    expect(clampZoom(0.1)).toBe(ZOOM_MIN)
    expect(clampZoom(5)).toBe(ZOOM_MAX)
    // 状态栏按钮从下限往上走一格，与快捷键是同一个值
    expect(clampZoom(ZOOM_MIN + 0.1)).toBe(0.5)
  })

  it('编辑器字号的范围与默认值', () => {
    expect(clampEditorFontPx(1)).toBe(EDITOR_FONT_MIN_PX)
    expect(clampEditorFontPx(99)).toBe(EDITOR_FONT_MAX_PX)
    expect(clampEditorFontPx(EDITOR_FONT_DEFAULT_PX + 1)).toBe(13.5)
    expect(EDITOR_FONT_DEFAULT_PX).toBe(12.5)
  })
})

describe('Ctrl+滚轮的累积', () => {
  it('鼠标滚一格正好一档：向上滚放大、向下滚缩小', () => {
    expect(takeWheelZoomSteps(accumulator(), -100, 0)).toBe(1)
    expect(takeWheelZoomSteps(accumulator(), 100, 0)).toBe(-1)
  })

  it('一次滚很多格就一次走多档', () => {
    expect(takeWheelZoomSteps(accumulator(), -300, 0)).toBe(3)
    expect(takeWheelZoomSteps(accumulator(), 250, 0)).toBe(-2)
  })

  it('不够一档的余量留着下次接着攒（触控板捏合一次来几十条小事件）', () => {
    const wheel = accumulator()
    expect(takeWheelZoomSteps(wheel, -40, 0)).toBe(0)
    expect(takeWheelZoomSteps(wheel, -40, 0)).toBe(0)
    expect(takeWheelZoomSteps(wheel, -40, 0)).toBe(1)
    // 走掉一档之后余量还在（120 - 100），下次再滚 80 就又是一档
    expect(wheel.current).toBe(-20)
    expect(takeWheelZoomSteps(wheel, -80, 0)).toBe(1)
    expect(wheel.current).toBe(0)
  })

  it('行 / 页单位的滚轮折成像素', () => {
    const wheel = accumulator()
    // 3 行 ≈ 48px：两格 96px 还不够，第三格过线
    expect(takeWheelZoomSteps(wheel, -3, 1)).toBe(0)
    expect(takeWheelZoomSteps(wheel, -3, 1)).toBe(0)
    expect(takeWheelZoomSteps(wheel, -3, 1)).toBe(1)
    // 一页按 400px 算，正好四档
    expect(takeWheelZoomSteps(accumulator(), -1, 2)).toBe(4)
  })

  it('编辑器与预览各用一个累积器，互不串味', () => {
    const editor = accumulator()
    const preview = accumulator()
    expect(takeWheelZoomSteps(editor, -60, 0)).toBe(0)
    expect(takeWheelZoomSteps(preview, -60, 0)).toBe(0)
    // 编辑器自己攒够了就走，不该把预览那半格也带上
    expect(takeWheelZoomSteps(editor, -40, 0)).toBe(1)
    expect(preview.current).toBe(-60)
  })
})
