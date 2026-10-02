import type { RefObject } from 'react'

interface PreviewPaneProps {
  html: string
  iframeRef: RefObject<HTMLIFrameElement>
}

/** 分页预览。窗格标题栏已经去掉，分页状态与缩放都收进了全局底部栏。 */
export function PreviewPane({ html, iframeRef }: PreviewPaneProps) {
  return (
    <section className="pane preview-pane">
      <div className="preview-frame">
        <iframe
          ref={iframeRef}
          title="样式预览"
          className="preview-iframe"
          sandbox="allow-scripts allow-modals"
          referrerPolicy="no-referrer"
          srcDoc={html}
        />
      </div>
    </section>
  )
}
