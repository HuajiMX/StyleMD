import type { ComputedStyles, RoleStyle, StyleTheme, TableSpec } from '@stylemd/theme-schema'
import type { EditorScheme } from '@stylemd/editor-theme'
import { StyleGallery } from './StyleGallery'
import { FileMenu } from './FileMenu'
import { FileHeading } from './FileHeading'
import { canExportPdfDirectly } from '../lib/desktop'
import { acceleratorLabel } from '../lib/shortcuts'
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
  TableGroups,
  type StyleEditContext,
  type TableEditContext,
} from './ribbon-groups'
import { IconChevronDown, IconChevronUp } from './icons'

export type RibbonTab = 'start' | 'edit' | 'page' | 'table'

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
  /**
   * 工具带（分组那一排）是否收起：收起后只剩选项卡栏，跟 Word 的「折叠功能区」一个意思。
   * 选项卡栏必须留着——收起来还得靠它旁边那枚按钮展开回来。
   */
  collapsed: boolean
  onToggleCollapsed: () => void
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
  onOpenDocument: () => void
  onLoadSample: () => void
  onNewDocument: () => void
  onSaveDocument: () => void
  onSaveDocumentAs: (name: string) => void
  /** 文件名主名（不含 .md），标题栏大字；点一下可改。 */
  fileName: string
  onRenameFile: (name: string) => void
  autoSave: boolean
  onAutoSaveChange: (enabled: boolean) => void
  /** 预览里指针移动的计数（父文档感知不到指针进了 iframe，由预览 postMessage 通报）。 */
  previewHoverTick: number
  /** 光标是否落在表格结构里：是才出现「表格」选项卡。 */
  tableContext: boolean
  onTableChange: (patch: Partial<TableSpec>) => void
  onOpenBorderDialog: () => void
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
  const tableContext: TableEditContext | undefined = props.tableContext
    ? {
        theme,
        computed,
        onRoleChange: props.onRoleChange,
        onTableChange: props.onTableChange,
        onOpenDialog: props.onOpenDialog,
        onOpenBorderDialog: props.onOpenBorderDialog,
      }
    : undefined
  // 光标离开表格后「表格」选项卡会消失（App 同时把选中切回「开始」）；
  // 这一层兜住同一次渲染里的空档，免得控制区先空一块。
  const activeTab: RibbonTab = props.tab === 'table' && !tableContext ? 'start' : props.tab

  const statusChip =
    props.status.errors > 0
      ? { className: 'chip-error', text: `${props.status.errors} 个样式错误` }
      : props.status.warnings > 0
        ? { className: 'chip-warn', text: `${props.status.warnings} 条提示` }
        : { className: 'chip-ok', text: '样式包正常' }

  // 桌面壳里点一下就直接出 PDF 并存盘（弹系统保存框），浏览器里只能走打印对话框。
  const printLabel = canExportPdfDirectly() ? '导出 PDF' : '打印 / 导出 PDF'

  return (
    <header className={`ribbon${props.collapsed ? ' is-collapsed' : ''}`}>
      <div className="ribbon-titlebar">
        <div className="brand">
          <strong>StyleMD</strong>
        </div>
        <FileHeading
          fileName={props.fileName}
          documentTitle={props.documentTitle}
          onRename={props.onRenameFile}
        />
        <div className="titlebar-actions">
          <span className={`chip ${statusChip.className}`}>
            {statusChip.text}
            <span className="chip-sub">角色 {props.status.roles}</span>
          </span>
          <button
            type="button"
            className="primary"
            title={`${printLabel}（${acceleratorLabel('print')}）`}
            onClick={props.onPrint}
            disabled={!props.canPrint}
          >
            {printLabel}
          </button>
        </div>
      </div>

      <nav className="ribbon-tabs" role="tablist" aria-label="功能区">
        <FileMenu
          fileName={props.fileName}
          onNew={props.onNewDocument}
          onOpen={props.onOpenDocument}
          onLoadSample={props.onLoadSample}
          onSave={props.onSaveDocument}
          onSaveAs={props.onSaveDocumentAs}
          autoSave={props.autoSave}
          onAutoSaveChange={props.onAutoSaveChange}
          previewHoverTick={props.previewHoverTick}
        />
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`ribbon-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => props.onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        {/* 上下文选项卡：光标进表格才出现。位置排在常规选项卡右侧，与 Word 的「表布局」同一个读法。 */}
        {tableContext ? (
          <>
            <span className="ribbon-tab-sep" aria-hidden="true" />
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'table'}
              className={`ribbon-tab context-tab${activeTab === 'table' ? ' active' : ''}`}
              title="表格工具（光标在表格里时出现）"
              onClick={() => props.onTabChange('table')}
            >
              表格
            </button>
          </>
        ) : null}
        {/* 收起 / 展开工具带：贴选项卡栏最右侧（`margin-left: auto`）。收起来只剩这一行，
            所以按钮必须留在这儿——不然收下去就点不回来了。 */}
        <button
          type="button"
          className="ribbon-collapse"
          aria-expanded={!props.collapsed}
          aria-controls="ribbon-body"
          aria-label={props.collapsed ? '展开功能区' : '收起功能区'}
          title={props.collapsed ? '展开功能区' : '收起功能区'}
          onClick={props.onToggleCollapsed}
        >
          {props.collapsed ? <IconChevronDown /> : <IconChevronUp />}
        </button>
      </nav>

      <div className="ribbon-body" id="ribbon-body">
        {activeTab === 'start' ? (
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

        {activeTab === 'edit' ? (
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

        {activeTab === 'page' ? (
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

        {activeTab === 'table' && tableContext ? <TableGroups ctx={tableContext} /> : null}
      </div>
    </header>
  )
}
