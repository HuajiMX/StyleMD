/**
 * 求「把 textarea 里某个字符所在行顶到首行」需要多大的 scrollTop。
 *
 * 按行号 × 行高估算不行：长段落一软换行，后面每一行的位置就全错了。
 * 这里把一块与 textarea 逐像素重合的镜像元素贴在它上面（同样的位置、尺寸、内边距、
 * 字体、换行规则，并同样滚动到当前 scrollTop），再用 Range 量出目标字符相对可见区顶部的
 * 距离。这个差值就是「还需要往上滚多少」——不依赖行高与内边距的任何假设。
 */
const COPIED_STYLES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'direction',
  'overflowWrap',
  'wordBreak',
  'tabSize',
] as const

/** 建一块与 textarea 逐像素重合的镜像，用于量任意字符在内容里的纵向位置。 */
function createMirror(textarea: HTMLTextAreaElement): HTMLElement {
  const style = getComputedStyle(textarea)
  const box = textarea.getBoundingClientRect()

  const mirror = document.createElement('div')
  mirror.style.position = 'fixed'
  mirror.style.visibility = 'hidden'
  mirror.style.pointerEvents = 'none'
  mirror.style.overflow = 'hidden'
  mirror.style.boxSizing = 'border-box'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.left = `${box.left + (Number.parseFloat(style.borderLeftWidth) || 0)}px`
  mirror.style.top = `${box.top + (Number.parseFloat(style.borderTopWidth) || 0)}px`
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.style.height = `${textarea.clientHeight}px`
  mirror.style.padding = `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`
  for (const property of COPIED_STYLES) mirror.style[property] = style[property]
  mirror.textContent = textarea.value

  document.body.appendChild(mirror)
  mirror.scrollTop = textarea.scrollTop
  return mirror
}

/** 量一批偏移：返回「把该字符顶到首行需要的 scrollTop」。一次镜像布局量完所有点。 */
export function scrollTopsForOffsets(textarea: HTMLTextAreaElement, offsets: number[]): number[] {
  const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight)
  if (maxScroll <= 0 || offsets.length === 0) return offsets.map(() => 0)

  const mirror = createMirror(textarea)
  const node = mirror.firstChild
  const mirrorTop = mirror.getBoundingClientRect().top
  const tops = offsets.map((offset) => {
    if (!node || offset <= 0 || offset > textarea.value.length) return 0
    const range = document.createRange()
    range.setStart(node, Math.max(0, offset - 1))
    range.setEnd(node, offset)
    const delta = range.getBoundingClientRect().top - mirrorTop
    return Math.min(Math.max(0, Math.round(textarea.scrollTop + delta)), maxScroll)
  })
  document.body.removeChild(mirror)
  return tops
}

export function offsetToScrollTop(textarea: HTMLTextAreaElement, offset: number): number {
  return scrollTopsForOffsets(textarea, [offset])[0] ?? 0
}
