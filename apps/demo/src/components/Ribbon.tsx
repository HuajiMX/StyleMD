import type { ComputedStyles, RoleStyle, StyleTheme } from '@stylemd/theme-schema'
import type { EditorScheme } from '@stylemd/editor-theme'
import { StyleGallery } from './StyleGallery'
import { FileMenu } from './FileMenu'
import {
  DefaultsGroup,
  EditGroup,
  EditorSchemeGroup,
  FontQuickGroup,
  FurnitureGroup,
  PageGroup,
  ParagraphQuickGroup,
  RibbonGroup,
  StylePackGroup,
  type StyleEditContext,
} from './ribbon-groups'

export type RibbonTab = 'start' | 'edit' | 'page'

const TABS: { id: RibbonTab; label: string }[] = [
  { id: 'start', label: '开始' },
  { id: 'edit', label: '编辑' },
  { id: 'page', label: '页面' },
]

interface RibbonProps {
  theme: StyleTheme
  computed: ComputedStyles
  activeRole: string
  cursorRole: string | undefined
  documentTitle: string
  tab: RibbonTab
  onTabChange: (tab: RibbonTab) => void
  autoDetect: boolean
  status: { roles: number; warnings: number; errors: number }
  canPrint: boolean
  canUndo: boolean
  onUndo: () => void
  onPrint: () => void
  onPresetChange: (id: string) => void
  onImport: (theme: StyleTheme) => void
  onExport: () => void
  onAutoDetectChange: (value: boolean) => void
  onRoleChange: (role: string, patch: Partial<RoleStyle>) => void
  onClearGroup: (role: string, group: keyof RoleStyle) => void
  onResetRole: (role: string) => void
  onOpenDialog: (role: string) => void
  onPageChange: (patch: Partial<StyleTheme['document']['page']>) => void
  onEditFurniture: (area: 'header' | 'footer') => void
  onDefaultsChange: (patch: Partial<StyleTheme['document']['defaults']>) => void
  onLoadMarkdown: (text: string) => void
  onLoadSample: () => void
  onNewDocument: () => void
  onSaveDocument: () => void
  onSaveDocumentAs: (name: string) => void
  onRenameDocument: (name: string) => void
  schemes: EditorScheme[]
  activeSchemeId: string
  hiddenSchemeCount: number
  onSelectScheme: (id: string) => void
  onOpenSchemeDialog: () => void
}

/**
 * 顶部功能区：标题栏 / 选项卡 / 分组工具带。
 * 样式配置不再常驻在右侧，而是收进「样式」画廊里的弹窗；
 * 字体与段落两组留在工具带上，改当前结构的一两个属性不用开窗。
 */
export function Ribbon(props: RibbonProps) {
  const { theme, computed, activeRole } = props
  const resolved = computed.roles[activeRole]
  const context: StyleEditContext | undefined = resolved
    ? {
        theme,
        computed,
        role: activeRole,
        explicit: theme.styles.find((style) => style.role === activeRole),
        resolved,
        onRoleChange: props.onRoleChange,
        onClearGroup: props.onClearGroup,
        onResetRole: props.onResetRole,
        onOpenDialog: props.onOpenDialog,
      }
    : undefined

  const statusChip =
    props.status.errors > 0
      ? { className: 'chip-error', text: `${props.status.errors} 个样式错误` }
      : props.status.warnings > 0
        ? { className: 'chip-warn', text: `${props.status.warnings} 条提示` }
        : { className: 'chip-ok', text: '样式包正常' }

  return (
    <header className="ribbon">
      <div className="ribbon-titlebar">
        <div className="brand">
          <strong>StyleMD</strong>
          <span className="brand-sub">样式管理器原型</span>
        </div>
        <div className="doc-title" title={props.documentTitle}>
          {props.documentTitle}
        </div>
        <div className="titlebar-actions">
          <span className={`chip ${statusChip.className}`}>
            {statusChip.text}
            <span className="chip-sub">角色 {props.status.roles}</span>
          </span>
          <button type="button" className="primary" onClick={props.onPrint} disabled={!props.canPrint}>
            打印 / 导出 PDF
          </button>
        </div>
      </div>

      <nav className="ribbon-tabs" role="tablist" aria-label="功能区">
        <FileMenu
          documentName={props.documentTitle}
          onNew={props.onNewDocument}
          onOpen={props.onLoadMarkdown}
          onLoadSample={props.onLoadSample}
          onSave={props.onSaveDocument}
          onSaveAs={props.onSaveDocumentAs}
          onRename={props.onRenameDocument}
        />
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={props.tab === tab.id}
            className={`ribbon-tab${props.tab === tab.id ? ' active' : ''}`}
            onClick={() => props.onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="ribbon-body">
        {props.tab === 'start' ? (
          <>
            <StylePackGroup
              theme={theme}
              onPresetChange={props.onPresetChange}
              onImport={props.onImport}
              onExport={props.onExport}
            />
            {context ? (
              <>
                <FontQuickGroup ctx={context} />
                <ParagraphQuickGroup ctx={context} />
              </>
            ) : null}
            <RibbonGroup label="样式" grow note="点击卡片配置">
              <StyleGallery
                theme={theme}
                computed={computed}
                activeRole={activeRole}
                onPick={props.onOpenDialog}
              />
            </RibbonGroup>
          </>
        ) : null}

        {props.tab === 'edit' ? (
          <>
            <EditorSchemeGroup
              schemes={props.schemes}
              activeId={props.activeSchemeId}
              hiddenCount={props.hiddenSchemeCount}
              onSelect={props.onSelectScheme}
              onOpen={props.onOpenSchemeDialog}
            />
            <EditGroup
              autoDetect={props.autoDetect}
              onAutoDetectChange={props.onAutoDetectChange}
              canUndo={props.canUndo}
              onUndo={props.onUndo}
            />
          </>
        ) : null}

        {props.tab === 'page' ? (
          <>
            <PageGroup page={theme.document.page} onPageChange={props.onPageChange} />
            <FurnitureGroup
              page={theme.document.page}
              onPageChange={props.onPageChange}
              onEditFurniture={props.onEditFurniture}
            />
            <DefaultsGroup defaults={theme.document.defaults} onDefaultsChange={props.onDefaultsChange} />
          </>
        ) : null}
      </div>
    </header>
  )
}
