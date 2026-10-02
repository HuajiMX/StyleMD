import { useEffect, useState } from 'react'
import { ROLES, type ComputedStyles, type RoleCategory, type StyleTheme } from '@stylemd/theme-schema'
import { StyleCard } from './StyleGallery'

interface StyleBrowserProps {
  theme: StyleTheme
  computed: ComputedStyles
  activeRole: string
  onPick: (role: string) => void
}

/**
 * 按类别浏览样式：先选类别，再看该类别的卡片。
 * 功能区高度有限，铺开所有类别必然要滚动，不如把「找类别」和「选样式」分成两步。
 */
export function StyleBrowser({ theme, computed, activeRole, onPick }: StyleBrowserProps) {
  const categories = [...new Set(ROLES.map((role) => role.category))]
  const activeCategory = ROLES.find((role) => role.id === activeRole)?.category
  const [category, setCategory] = useState<RoleCategory>(activeCategory ?? categories[0]!)

  // 光标移动到别的类别时，浏览类别跟着走，省得用户还要手动切一次。
  useEffect(() => {
    if (activeCategory) setCategory(activeCategory)
  }, [activeCategory])

  const roles = ROLES.filter((role) => role.category === category)

  return (
    <div className="style-browser">
      {/* 这里用 aria-pressed 的按钮组而不是 tablist：它没有对应的 tabpanel，语义上不是选项卡。 */}
      <div className="category-row" role="group" aria-label="样式类别">
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={name === category}
            className={`category-chip${name === category ? ' active' : ''}`}
            onClick={() => setCategory(name)}
          >
            {name}
            <span className="category-count">{ROLES.filter((role) => role.category === name).length}</span>
          </button>
        ))}
      </div>
      <div className="style-gallery">
        {roles.map((role) => (
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
    </div>
  )
}
