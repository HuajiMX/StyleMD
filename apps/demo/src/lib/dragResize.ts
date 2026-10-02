import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * 拖动分隔条改宽度：按下时记起点，移动时把「起点宽度 + 位移」夹到区间里交给调用方。
 *
 * 这里必须用指针捕获：右边紧挨着预览 iframe，指针一越过去，顶层文档就收不到
 * pointermove 了（事件被 iframe 的文档接走），拖动会中途失联。
 */
export function startWidthDrag(
  event: ReactPointerEvent<HTMLElement>,
  startWidth: number,
  min: number,
  max: number,
  apply: (width: number) => void,
): void {
  if (event.button !== 0) return
  const handle = event.currentTarget
  event.preventDefault()
  const startX = event.clientX
  const pointerId = event.pointerId
  try {
    handle.setPointerCapture(pointerId)
  } catch {
    // 指针捕获失败不影响后续逻辑：真正的保险是下面给 body 加的拖动态。
  }
  const previousUserSelect = document.body.style.userSelect
  document.body.style.userSelect = 'none'
  // 预览是 iframe，指针一进去事件就被它的文档接走，父文档再收不到 pointermove。
  // 拖动期间把 iframe 设成 pointer-events: none，事件才会留在父文档里。
  document.body.classList.add('is-dragging-pane')

  const onMove = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== pointerId) return
    const next = Math.min(Math.max(startWidth + (moveEvent.clientX - startX), min), max)
    apply(Math.round(next))
  }
  const onUp = () => {
    document.body.style.userSelect = previousUserSelect
    document.body.classList.remove('is-dragging-pane')
    handle.releasePointerCapture(pointerId)
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onUp)
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onUp)
}
