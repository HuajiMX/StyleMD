/**
 * 缩放的两把尺子：**预览缩放**（状态栏两个按钮 / Ctrl+= / Ctrl+- / Ctrl+0 / 预览里的 Ctrl+滚轮）
 * 与**编辑器字号**（编辑器上的 Ctrl+滚轮）。
 *
 * 取值范围与步长只写在这儿，别在组件里各写一遍 Math.max(0.4, …)：两处的下限一旦不一致，
 * 从按钮滑到底再按快捷键就会「跳」一下。
 */

export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 2
export const ZOOM_STEP = 0.1

/** 预览缩放：夹到范围内，并抹掉 0.1 连加攒出来的浮点尾巴。 */
export function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))))
}

/** 编辑器字号（px）。12.5 是 CodeMirror 主题里那个默认值；缩放只动字号，行距倍数（1.75）跟着走。 */
export const EDITOR_FONT_MIN_PX = 9
export const EDITOR_FONT_MAX_PX = 24
export const EDITOR_FONT_STEP_PX = 1
export const EDITOR_FONT_DEFAULT_PX = 12.5

export function clampEditorFontPx(value: number): number {
  return Math.min(EDITOR_FONT_MAX_PX, Math.max(EDITOR_FONT_MIN_PX, Number(value.toFixed(1))))
}

/**
 * 滚轮攒够多少才算一档。鼠标滚一格是 100px——正好一档，与 Ctrl+= / Ctrl+- 同步长；
 * 触控板捏合一次会拆成几十条小事件，按累积量走才不会一捏就蹿到底。
 */
const WHEEL_STEP_PX = 100

/** deltaMode：0 像素、1 行、2 页；后两种折成大致等价的像素量。 */
function wheelPx(deltaY: number, deltaMode: number): number {
  return deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1)
}

/**
 * 把这一笔滚轮量并进累积器，返回该走几档：**正数放大、负数缩小**（向上滚 = 放大），不够一档给 0。
 *
 * 累积器由调用方持有（编辑器与预览各一个，互不串味），没走满一档的余量留在里面接着攒。
 */
export function takeWheelZoomSteps(accumulator: { current: number }, deltaY: number, deltaMode: number): number {
  accumulator.current += wheelPx(deltaY, deltaMode)
  // 向上滚 deltaY 为负，对应放大，所以取负号
  const steps = Math.trunc(-accumulator.current / WHEEL_STEP_PX)
  if (steps === 0) return 0
  accumulator.current += steps * WHEEL_STEP_PX
  return steps
}
