import type { OutlineItem } from '../lib/outline'

interface OutlinePanelProps {
  items: OutlineItem[]
  /** 当前所处章节的标题偏移；由滚动位置推出，不是光标位置。 */
  activeOffset: number | null
  onJump: (item: OutlineItem) => void
}

/** 左侧导航：各级标题的索引，点一条就跳到正文里的对应位置。 */
export function OutlinePanel({ items, activeOffset, onJump }: OutlinePanelProps) {
  return (
    <aside className="nav-panel">
      <div className="nav-panel-head">大纲</div>
      <div className="nav-list">
        {items.length === 0 ? <p className="nav-empty">正文里还没有标题</p> : null}
        {items.map((item) => (
          <button
            key={`${item.offset}-${item.role}`}
            type="button"
            className={`nav-item depth-${item.depth}${item.offset === activeOffset ? ' active' : ''}`}
            title={`第 ${item.line + 1} 行`}
            onClick={() => onJump(item)}
          >
            {item.text}
          </button>
        ))}
      </div>
    </aside>
  )
}
