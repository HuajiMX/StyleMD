import type { ReactNode } from 'react'
import { roleLabel } from '@stylemd/theme-schema'
import { formatSavedAt } from '../lib/session'
import { IconBothPanes, IconEditorOnly, IconOutline, IconPreviewOnly } from './icons'

export type ViewMode = 'edit' | 'both' | 'preview'

interface StatusBarProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  navOpen: boolean
  onNavToggle: () => void
  cursorRole: string | undefined
  charCount: number
  pageCount: number | null
  pagedStatus: 'pending' | 'paged' | 'error'
  zoom: number
  onZoomChange: (zoom: number) => void
  /** 最后一次保存：时间与方式（自动写会话 / 手动存文件）；null 表示还没保存过。 */
  saved: { at: number; kind: 'auto' | 'manual' } | null
}

/**
 * 全局底部栏：左边是导航开关和文档信息，右边是展示模式与缩放。
 * 原来挂在两个窗格标题栏上的信息（分页状态、光标定位、缩放）都收到这里。
 */
export function StatusBar(props: StatusBarProps) {
  const pageText =
    props.pagedStatus === 'paged'
      ? `第 1 页，共 ${props.pageCount ?? 0} 页`
      : props.pagedStatus === 'error'
        ? '分页失败'
        : '正在渲染…'

  const viewModes: { mode: ViewMode; label: string; glyph: ReactNode }[] = [
    { mode: 'edit', label: '仅展示编辑器', glyph: <IconEditorOnly /> },
    { mode: 'both', label: '同时展示编辑器和预览', glyph: <IconBothPanes /> },
    { mode: 'preview', label: '仅展示预览', glyph: <IconPreviewOnly /> },
  ]

  return (
    <footer className="statusbar">
      <button
        type="button"
        className={`icon-toggle${props.navOpen ? ' on' : ''}`}
        aria-label={props.navOpen ? '收起导航面板' : '展开导航面板'}
        aria-pressed={props.navOpen}
        title={props.navOpen ? '收起导航面板' : '展开导航面板'}
        onClick={props.onNavToggle}
      >
        <IconOutline />
      </button>

      <span className="status-item page-status">{pageText}</span>
      <span className="status-item">{props.charCount} 字符</span>
      <span className={`status-item locator${props.cursorRole ? ' hit' : ''}`}>
        定位：{roleLabel(props.cursorRole ?? 'body.text')}
      </span>
      {props.saved ? (
        <span className="status-item status-saved">
          {props.saved.kind === 'auto' ? '已自动保存' : '已保存'} {formatSavedAt(props.saved.at)}
        </span>
      ) : null}

      <span className="status-spacer" />

      <span className="view-modes" role="group" aria-label="展示模式">
        {viewModes.map((item) => (
          <button
            key={item.mode}
            type="button"
            className={`icon-toggle${props.viewMode === item.mode ? ' on' : ''}`}
            aria-label={item.label}
            aria-pressed={props.viewMode === item.mode}
            title={item.label}
            onClick={() => props.onViewModeChange(item.mode)}
          >
            {item.glyph}
          </button>
        ))}
      </span>

      <span className="zoom-control">
        <button
          type="button"
          className="icon-button"
          aria-label="缩小预览"
          onClick={() => props.onZoomChange(Math.max(0.4, Number((props.zoom - 0.1).toFixed(2))))}
        >
          −
        </button>
        <input
          type="range"
          aria-label="预览缩放"
          min={40}
          max={200}
          step={5}
          value={Math.round(props.zoom * 100)}
          onChange={(event) => props.onZoomChange(Number(event.target.value) / 100)}
        />
        <button
          type="button"
          className="icon-button"
          aria-label="放大预览"
          onClick={() => props.onZoomChange(Math.min(2, Number((props.zoom + 0.1).toFixed(2))))}
        >
          +
        </button>
        <span className="zoom-value">{Math.round(props.zoom * 100)}%</span>
      </span>
    </footer>
  )
}
