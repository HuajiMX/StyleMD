import { useEffect, useRef } from 'react'
import { ROLES, type ComputedStyles, type StyleTheme } from '@stylemd/theme-schema'
import { specimenStyle, singleLineSample } from '../lib/inlineStyle'
import { explicitGroupCount } from '../lib/roleStyle'
import { IconPencil } from './icons'

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
        {singleLineSample(definition.sample)}
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

/** 横向排开的全部样式，用于「开始」选项卡。 */
export function StyleGallery({ theme, computed, activeRole, onPick }: StyleGalleryProps) {
  return (
    <div className="style-gallery">
      {ROLES.map((role) => (
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
