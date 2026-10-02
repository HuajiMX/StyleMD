import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * 浮动窗口的「位置 + 大小」。
 *
 * 样式窗口和编辑器配色窗口共用这一套：拖标题栏移动、拖右下角缩放、同一个会话里
 * 再次打开沿用上次的位置。之前两个窗口各写一份，配色窗口那份干脆漏了拖动，
 * 所以这里收成一个 hook——以后再加窗口就不会再出现「一个能拖、一个不能拖」。
 */
export interface DialogFrame {
  x: number
  y: number
  width: number
  height: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 同一个 key 的两处调用共享「上次的位置与大小」。 */
const rememberedFrames = new Map<string, DialogFrame>()

interface UseDialogFrameOptions {
  key: string
  /** 按当前窗口尺寸算初始宽高；位置会再居中。 */
  measure: () => { width: number; height: number }
  minWidth: number
  minHeight: number
}

export interface DialogFrameApi {
  frame: DialogFrame
  setFrame: React.Dispatch<React.SetStateAction<DialogFrame>>
  /** 用户是否手动拖过或缩放过；动过之后调用方不该再自动改尺寸。 */
  adjusted: React.MutableRefObject<boolean>
  /** 这次挂载是否沿用了上次记住的位置。 */
  restored: boolean
  beginDrag: (event: ReactPointerEvent<HTMLElement>) => void
  beginResize: (event: ReactPointerEvent<HTMLElement>) => void
  frameStyle: CSSProperties
}

export function useDialogFrame({ key, measure, minWidth, minHeight }: UseDialogFrameOptions): DialogFrameApi {
  const [frame, setFrame] = useState<DialogFrame>(() => {
    const remembered = rememberedFrames.get(key)
    if (remembered) return remembered
    const size = measure()
    const width = clamp(size.width, minWidth, Math.max(minWidth, window.innerWidth - 16))
    const height = clamp(size.height, minHeight, Math.max(minHeight, window.innerHeight - 16))
    return {
      x: Math.round((window.innerWidth - width) / 2),
      y: Math.round(Math.max(16, (window.innerHeight - height) / 2 - 40)),
      width,
      height,
    }
  })
  const restored = useRef(rememberedFrames.has(key)).current
  const adjusted = useRef(false)
  const frameRef = useRef(frame)
  frameRef.current = frame

  // 只记住用户调过的尺寸：自动贴合出来的高度不该被当成用户的选择。
  // （也不能写成「卸载时保存」——StrictMode 下挂载会立刻清理一次，那样第一次就被记下了。）
  useEffect(() => {
    if (adjusted.current) rememberedFrames.set(key, frameRef.current)
  }, [frame, key])

  /** 拖动与缩放共用一套指针跟踪；拖拽期间禁掉文本选择。 */
  const startPointerJob = useCallback(
    (event: ReactPointerEvent<HTMLElement>, apply: (move: { dx: number; dy: number }) => void) => {
      if (event.button !== 0) return
      // 标题栏里还嵌着关闭按钮，点在它上面时不该开始拖动。
      if (
        event.currentTarget.classList.contains('dialog-head') &&
        (event.target as HTMLElement).closest('button, input, select, textarea, a, [role="tab"]')
      ) {
        return
      }
      event.preventDefault()
      const startX = event.clientX
      const startY = event.clientY
      const previousUserSelect = document.body.style.userSelect
      document.body.style.userSelect = 'none'
      const onMove = (moveEvent: PointerEvent) =>
        apply({ dx: moveEvent.clientX - startX, dy: moveEvent.clientY - startY })
      const onUp = () => {
        document.body.style.userSelect = previousUserSelect
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [],
  )

  const beginDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      adjusted.current = true
      const origin = { ...frameRef.current }
      startPointerJob(event, ({ dx, dy }) => {
        setFrame({
          ...origin,
          x: clamp(origin.x + dx, 80 - origin.width, window.innerWidth - 80),
          y: clamp(origin.y + dy, 0, window.innerHeight - 40),
        })
      })
    },
    [startPointerJob],
  )

  const beginResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.stopPropagation()
      adjusted.current = true
      const origin = { ...frameRef.current }
      startPointerJob(event, ({ dx, dy }) => {
        setFrame({
          ...origin,
          width: clamp(origin.width + dx, minWidth, window.innerWidth - 16),
          height: clamp(origin.height + dy, minHeight, window.innerHeight - 16),
        })
      })
    },
    [minHeight, minWidth, startPointerJob],
  )

  return {
    frame,
    setFrame,
    adjusted,
    restored,
    beginDrag,
    beginResize,
    frameStyle: { left: frame.x, top: frame.y, width: frame.width, height: frame.height },
  }
}
