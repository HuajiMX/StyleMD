import type { RefObject } from 'react'

/** 预览画布的前后两块。 */
export type PreviewSlot = 'a' | 'b'
export interface PreviewFrame {
  /** 这一版渲染的消息 id（每次都不同）；空串表示这块画布还没装过东西。 */
  id: string
  html: string
}

interface PreviewPaneProps {
  frames: Record<PreviewSlot, PreviewFrame>
  /** 正在显示的那块；另一块在它上面，下一版内容在那儿先排好（分页期间内容藏着，看不到）。 */
  activeSlot: PreviewSlot
  /** 正在分页的那块：压在显示那块上面（被盖住的 iframe 会被浏览器限流成 1 帧/秒）。 */
  incomingSlot: PreviewSlot | null
  frameRefs: Record<PreviewSlot, RefObject<HTMLIFrameElement>>
  onFrameLoad: (slot: PreviewSlot) => void
}

/**
 * 分页预览。两块 iframe 叠在同一处轮流上前：正在显示的那块留着旧内容不动，新一版在另一块里排，
 * 排完只换层级、不重新加载文档，所以看不到「先清空旧渲染再重排」的闪白，滚动位置也在换上来之前
 * 就恢复好了。
 *
 * 三块身份对应三个类：显示（`.preview-iframe`）、正在分页（`.preview-iframe-incoming`，压在最上面）、
 * 备用（`.preview-iframe-spare`，不画）。分页那块必须压在最上面且元素本身可见——被完全遮住或藏起来的
 * iframe 会被浏览器把 requestAnimationFrame 限流到 1 帧/秒，分页会慢几十倍；它自己的内容由预览文档
 * 在分页期间藏着，所以压在上面也看不见。
 */
export function PreviewPane({ frames, activeSlot, incomingSlot, frameRefs, onFrameLoad }: PreviewPaneProps) {
  return (
    <section className="pane preview-pane">
      <div className="preview-frame">
        {(['a', 'b'] as const).map((slot) => {
          const active = slot === activeSlot
          const className =
            active ? 'preview-iframe' : slot === incomingSlot ? 'preview-iframe-incoming' : 'preview-iframe-spare'
          return (
            <iframe
              key={slot}
              ref={frameRefs[slot]}
              title={active ? '样式预览' : '样式预览缓冲'}
              className={className}
              sandbox="allow-scripts allow-modals"
              referrerPolicy="no-referrer"
              srcDoc={frames[slot].html}
              onLoad={() => onFrameLoad(slot)}
              tabIndex={active ? undefined : -1}
              aria-hidden={active ? undefined : true}
            />
          )
        })}
      </div>
    </section>
  )
}
