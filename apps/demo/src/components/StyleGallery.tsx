import { useEffect, useRef, type WheelEvent as ReactWheelEvent } from 'react'
import { ROLES, type ComputedStyles, type StyleTheme } from '@stylemd/theme-schema'
import { specimenStyle, singleLineSample } from '../lib/inlineStyle'
import { explicitGroupCount } from '../lib/roleStyle'
import { CELL_ROLE, HEADER_ROLE, TABLE_ROLE } from '../lib/tableBorders'
import { IconPencil } from './icons'
import { isMathSample, MathSample } from './MathSample'

interface StyleCardProps {
  theme: StyleTheme
  computed: ComputedStyles
  roleId: string
  active: boolean
  onPick: (role: string) => void
}

/**
 * 样式卡片：用该角色自己的字体渲染样本。
 * 这是整个界面的 signature —— 用户看到的不是样式名，而是排出来的字。
 */
export function StyleCard({ theme, computed, roleId, active, onPick }: StyleCardProps) {
  const definition = ROLES.find((role) => role.id === roleId)
  const resolved = computed.roles[roleId]
  const buttonRef = useRef<HTMLButtonElement>(null)

  // 光标定位到某个结构时，画廊里对应的卡片可能滚在视野外——聚焦了却看不见等于没聚焦。
  useEffect(() => {
    if (!active) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    buttonRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [active])

  if (!definition || !resolved) return null
  const explicitCount = explicitGroupCount(theme, roleId)

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`style-card${active ? ' active' : ''}`}
      aria-label={definition.label}
      aria-pressed={active}
      title={`${definition.label}（${roleId}）\n${definition.description}`}
      onClick={() => onPick(roleId)}
    >
      <span className="style-card-sample" style={specimenStyle(resolved)}>
        {isMathSample(definition) ? <MathSample definition={definition} /> : singleLineSample(definition.sample)}
      </span>
      <span className="style-card-foot">
        <span className="style-card-name">{definition.label}</span>
        {explicitCount > 0 ? <em className="style-card-dot" title={`已显式声明 ${explicitCount} 组属性`} /> : null}
      </span>
      <span className="style-card-action" aria-hidden="true">
        <IconPencil />
      </span>
    </button>
  )
}

interface StyleGalleryProps {
  theme: StyleTheme
  computed: ComputedStyles
  activeRole: string
  onPick: (role: string) => void
}

/**
 * 画廊自己那份滚动条被藏掉了（经典滚动条会从卡片内部切走一条高度，卡片和分隔线就停在那条
 * 上面，见 styles.css 里 `.rgroup .style-gallery` 的注），所以滚轮得自己翻成横向——
 * 不然鼠标用户翻不到排在后面的结构，只能靠移动光标把卡片带进视野。
 * 只接管纵向滚轮：触控板报 deltaX 的横向手势仍走原生滚动，不去插一手。
 */
function scrollGalleryByWheel(event: ReactWheelEvent<HTMLDivElement>) {
  const node = event.currentTarget
  if (event.deltaY === 0 || node.scrollWidth <= node.clientWidth) return
  // 行模式的浏览器（deltaMode 1）给的是一行几格，得换算成像素，否则滚一格只挪几个像素。
  node.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : 1)
}

/** 表格的三个结构角色：它们在「表格」选项卡里有专门的入口，不再摆进结构画廊。 */
const TABLE_STRUCTURE_ROLES = new Set<string>([TABLE_ROLE, HEADER_ROLE, CELL_ROLE])

/**
 * 画廊只摆**在「开始」页有入口意义的结构**。
 *
 *  - 页眉页脚（`page.header` / `page.footer`）是页面装饰，不是 Markdown 解析出来的节点，
 *    正文里根本没有这种角色；它们有自己的入口——「页面」页的「页眉页脚」组，
 *    那儿既能编辑内容也能开样式窗口。摆在结构画廊里只会让人以为文档里有这东西。
 *  - 表格 / 表头单元格 / 表格单元格同理：光标进表格会自动切到「表格」选项卡，
 *    外框、格线、九宫格对齐、内边距、底纹都在那一页按边 / 按面板设置，样式的窗口入口也在那儿。
 *    表题（`table.caption`）是普通段落，仍留在画廊里。
 */
const DOCUMENT_ROLES = ROLES.filter(
  (role) => role.category !== '页面' && !TABLE_STRUCTURE_ROLES.has(role.id),
)

/** 横向排开的全部样式（文档结构），用于「开始」选项卡。 */
export function StyleGallery({ theme, computed, activeRole, onPick }: StyleGalleryProps) {
  return (
    <div className="style-gallery" onWheel={scrollGalleryByWheel}>
      {DOCUMENT_ROLES.map((role) => (
        <StyleCard
          key={role.id}
          theme={theme}
          computed={computed}
          roleId={role.id}
          active={role.id === activeRole}
          onPick={onPick}
        />
      ))}
    </div>
  )
}
