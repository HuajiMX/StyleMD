import { useRef, useState, type ReactNode } from 'react'
import {
  migrateTheme,
  PAGE_SIZES_MM,
  roleLabel,
  validateTheme,
  type ComputedRoleStyle,
  type ComputedStyles,
  type DocumentDefaults,
  type PageSetup,
  type PageSizeName,
  type RoleStyle,
  type StyleTheme,
  type TableSpec,
} from '@stylemd/theme-schema'
import { BUILT_IN_THEMES } from '@stylemd/presets'
import type { EditorScheme, EditorTokenName } from '@stylemd/editor-theme'
import {
  Combo,
  Field,
  FontSizeCombo,
  IconButton,
  IconToggle,
  NumberInput,
  Popover,
  SelectInput,
  ToggleChip,
} from './fields'
import { AlignSegmented, CellAlignGrid, type CellAlignH, type CellAlignV } from './align-control'
import {
  IconChevronDown,
  IconBorderGrid,
  IconBorderNone,
  IconBorderOuter,
  IconBorderThreeLine,
  IconDistributeColumns,
  IconDistributeRows,
  IconExport,
  IconFirstLineIndent,
  IconHangingIndent,
  IconImport,
  IconIndentDecrease,
  IconIndentIncrease,
  IconLineSpacing,
  IconPalette,
  IconReset,
  IconTableAlignCenter,
  IconTableAlignLeft,
  IconTableAlignRight,
  IconTableFillWidth,
  IconTableFitContent,
  IconUndo,
} from './icons'
import { fontLabel, fontOptions, resolveFontInput, useFontCatalog } from '../lib/fontCatalog'
import { FOLLOW_CJK_LABEL, currentSlots, hasFontSlots, ribbonFontValue } from '../lib/fontChain'
import {
  BORDER_STYLE_OPTIONS,
  BORDER_PRESETS,
  CELL_ROLE,
  HEADER_ROLE,
  PRESET_LABELS,
  TABLE_ROLE,
  applyBorderPreset,
  currentLine,
  presetOf,
  type BorderLine,
  type BorderPreset,
} from '../lib/tableBorders'

/** 四个预设的图标：数据在 lib 里（纯数据），图标留在组件层。 */
const PRESET_ICONS: Record<BorderPreset, ReactNode> = {
  none: <IconBorderNone />,
  grid: <IconBorderGrid />,
  outer: <IconBorderOuter />,
  'three-line': <IconBorderThreeLine />,
}

/** 工具栏里「快速改当前结构」需要的一整套上下文。 */
export interface StyleEditContext {
  theme: StyleTheme
  computed: ComputedStyles
  role: string
  explicit: RoleStyle | undefined
  resolved: ComputedRoleStyle
  onRoleChange: (role: string, patch: Partial<RoleStyle>) => void
  onClearGroup: (role: string, group: keyof RoleStyle) => void
  onResetRole: (role: string) => void
  onOpenDialog: (role: string) => void
}

interface RibbonGroupProps {
  label: string
  /** 组名旁边的补充说明，例如当前正在编辑哪个结构。 */
  note?: string
  grow?: boolean
  /** 额外类名：给这一组整套控件做局部样式（例如把表单标签列对齐）时用。 */
  className?: string
  onExpand?: () => void
  children: ReactNode
}

/** 功能区里的一组控件：控件在上，组名在下，右侧一条竖分隔线——照着工具带的惯例来。 */
export function RibbonGroup({ label, note, grow, className, onExpand, children }: RibbonGroupProps) {
  return (
    <section className={`rgroup${grow ? ' grow' : ''}${className ? ` ${className}` : ''}`}>
      <div className="rgroup-body">{children}</div>
      <div className="rgroup-foot">
        <span className="rgroup-label">{label}</span>
        {note ? <span className="rgroup-note">{note}</span> : null}
        {onExpand ? (
          <button
            type="button"
            className="rgroup-expand"
            aria-label={`打开${label}设置`}
            title="打开样式窗口"
            onClick={onExpand}
          >
            ⌄
          </button>
        ) : null}
      </div>
    </section>
  )
}

export function StylePackGroup({
  theme,
  onPresetChange,
  onImport,
  onExport,
}: {
  theme: StyleTheme
  onPresetChange: (id: string) => void
  onImport: (theme: StyleTheme) => void
  onExport: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const isBuiltIn = BUILT_IN_THEMES.some((preset) => preset.id === theme.id)

  return (
    <RibbonGroup label="样式包" note={theme.name}>
      <div className="rgroup-row">
        <select
          className="wide-select"
          aria-label="样式包"
          value={theme.id}
          onChange={(event) => onPresetChange(event.target.value)}
        >
          {BUILT_IN_THEMES.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
          {isBuiltIn ? null : <option value={theme.id}>{theme.name}（已修改）</option>}
        </select>
      </div>
      <div className="rgroup-row">
        <IconButton label="导入样式包" text="导入" onClick={() => fileInput.current?.click()}>
          <IconImport />
        </IconButton>
        <IconButton label="导出样式包" text="导出" onClick={onExport}>
          <IconExport />
        </IconButton>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          try {
            if (file.size > 2 * 1024 * 1024) throw new Error('样式包不能超过 2 MB')
            const { theme: imported, notes } = migrateTheme(JSON.parse(await file.text()) as unknown)
            const result = validateTheme(imported)
            for (const note of notes) console.info(`[样式包] ${note}`)
            if (!result.ok) {
              window.alert(`样式包校验失败：\n${result.errors.join('\n')}`)
              return
            }
            if (result.warnings.length > 0) console.warn(result.warnings)
            onImport(imported)
          } catch (error) {
            window.alert(`无法读取样式包：${error instanceof Error ? error.message : String(error)}`)
          } finally {
            event.target.value = ''
          }
        }}
      />
    </RibbonGroup>
  )
}

/** 功能区里的字体组：直接改当前光标所在结构的字体，不用开窗。 */
export function FontQuickGroup({ ctx }: { ctx: StyleEditContext }) {
  const { role, explicit, resolved } = ctx
  const font = explicit?.font
  const patch = (next: Partial<RoleStyle>) => ctx.onRoleChange(role, next)
  const weight = font?.weight ?? resolved.font.weight
  const catalog = useFontCatalog()
  const slots = currentSlots(font, resolved.font)
  const options = fontOptions(catalog)
  // 功能区只放中文字体这一个框（西文在样式窗口里设），显示的值见 ribbonFontValue
  const shownFamily = ribbonFontValue(slots)
  const inherited = !hasFontSlots(font) || !shownFamily
  const commit = (text: string) => {
    const family = resolveFontInput(text, catalog)
    if (family) patch({ font: { cjkFamily: family } })
  }

  return (
    <RibbonGroup label="字体" note={roleLabel(role)} onExpand={() => ctx.onOpenDialog(role)}>
      <div className="rgroup-row">
        <Field
          label=""
          compact
          inherited={inherited}
          hint={`中文字体：${fontLabel(shownFamily, catalog.aliases) || '未指定'}\n西文字体：${slots.latinFamily ? fontLabel(slots.latinFamily, catalog.aliases) : FOLLOW_CJK_LABEL}\n候选来源：${catalog.note}\n下拉选一个字体，或直接输入字体名（只改中文字体，西文与其余回退保留）`}
        >
          <Combo
            className="font-family-combo"
            ariaLabel="字体族"
            inherited={inherited}
            value={fontLabel(shownFamily, catalog.aliases)}
            options={options}
            onPick={(family) => patch({ font: { cjkFamily: family } })}
            onCommit={commit}
          />
        </Field>
        <Field label="" compact inherited={font?.sizePt === undefined}>
          <FontSizeCombo
            value={font?.sizePt ?? resolved.font.sizePt}
            inherited={font?.sizePt === undefined}
            ariaLabel="字号 pt"
            onChange={(value) => patch({ font: { sizePt: value } })}
          />
        </Field>
      </div>
      <div className="rgroup-row">
        <IconToggle
          label="加粗"
          glyph="B"
          className="glyph-bold"
          title="加粗（切换 700 / 400）"
          checked={weight >= 700}
          onChange={(checked) => patch({ font: { weight: checked ? 700 : 400 } })}
        />
        <IconToggle
          label="倾斜"
          glyph="I"
          className="glyph-italic"
          checked={font?.italic ?? resolved.font.italic}
          onChange={(checked) => patch({ font: { italic: checked } })}
        />
        <IconToggle
          label="下划线"
          glyph="U"
          className="glyph-underline"
          checked={font?.underline ?? resolved.font.underline}
          onChange={(checked) => patch({ font: { underline: checked } })}
        />
        <span className="rgroup-sep" />
        <Field label="" compact inherited={font?.color === undefined} hint="文字颜色">
          <input
            type="color"
            aria-label="文字颜色"
            value={font?.color ?? resolved.font.color}
            onChange={(event) => patch({ font: { color: event.target.value } })}
          />
        </Field>
        <button
          type="button"
          className="icon-button"
          onClick={() => ctx.onClearGroup(role, 'font')}
          aria-label="清除字体设置"
          title="清除该结构的字体设置，回落到继承值"
        >
          <IconReset />
        </button>
      </div>
    </RibbonGroup>
  )
}

/** 快捷行距只给常用倍数；固定值要精确到 pt，去样式窗口里设。 */
const LINE_HEIGHTS = [1, 1.15, 1.25, 1.5, 1.75, 2, 2.5, 3]

/** 功能区里的段落组：对齐、行距、段距、缩进、分页控制。 */
export function ParagraphQuickGroup({ ctx }: { ctx: StyleEditContext }) {
  const { role, explicit, resolved } = ctx
  const paragraph = explicit?.paragraph
  const lineHeight = paragraph?.lineHeight ?? resolved.paragraph.lineHeight
  const firstLineIndent = paragraph?.firstLineIndentChars ?? resolved.paragraph.firstLineIndentChars
  const hangingIndent = paragraph?.hangingIndentChars ?? resolved.paragraph.hangingIndentChars
  const indentLeftPt = paragraph?.indentLeftPt ?? resolved.paragraph.indentLeftPt
  // 每次缩进半个字符（按当前字号折算），中文排版里半个字是最小有意义的步长。
  const indentStep = Math.max(1, Number((resolved.font.sizePt / 2).toFixed(2)))
  const patch = (next: Partial<RoleStyle>) => ctx.onRoleChange(role, next)

  return (
    <RibbonGroup label="段落" note={roleLabel(role)} onExpand={() => ctx.onOpenDialog(role)}>
      <div className="rgroup-row">
        <AlignSegmented
          value={paragraph?.align ?? resolved.paragraph.align}
          onChange={(value) => patch({ paragraph: { align: value } })}
        />
        <span className="rgroup-sep" />
        <Popover
          className={`line-height-popover${paragraph?.lineHeight === undefined ? ' inherited' : ''}`}
          label="行距"
          title={
            lineHeight.mode === 'fixed'
              ? `当前是固定行距 ${lineHeight.value}pt，选一个倍数会切回倍数行距`
              : `行距 ${lineHeight.value} 倍`
          }
          trigger={
            <>
              <IconLineSpacing />
              <em className="popover-value">
                {lineHeight.mode === 'fixed' ? `${lineHeight.value}pt` : formatMultiple(lineHeight.value)}
              </em>
              <IconChevronDown />
            </>
          }
        >
          {(close) => (
            <span className="popover-body">
              {LINE_HEIGHTS.map((multiple) => (
                <button
                  key={multiple}
                  type="button"
                  aria-pressed={lineHeight.mode === 'multiple' && Math.abs(lineHeight.value - multiple) < 0.001}
                  className={`popover-option${lineHeight.mode === 'multiple' && Math.abs(lineHeight.value - multiple) < 0.001 ? ' on' : ''}`}
                  onClick={() => {
                    patch({ paragraph: { lineHeight: { mode: 'multiple', value: multiple } } })
                    close()
                  }}
                >
                  <span>{formatMultiple(multiple)} 倍</span>
                </button>
              ))}
              <span className="popover-hint">固定行距请到样式窗口里设</span>
            </span>
          )}
        </Popover>
      </div>
      <div className="rgroup-row">
        <IconButton
          label="减少左缩进"
          title={`减少左缩进（当前 ${indentLeftPt}pt，每次 ${indentStep}pt）`}
          disabled={indentLeftPt <= 0}
          onClick={() => patch({ paragraph: { indentLeftPt: Math.max(0, Number((indentLeftPt - indentStep).toFixed(2))) } })}
        >
          <IconIndentDecrease />
        </IconButton>
        <IconButton
          label="增加左缩进"
          title={`增加左缩进（当前 ${indentLeftPt}pt，每次 ${indentStep}pt）`}
          onClick={() =>
            patch({ paragraph: { indentLeftPt: Math.min(200, Number((indentLeftPt + indentStep).toFixed(2))) } })
          }
        >
          <IconIndentIncrease />
        </IconButton>
        <span className="rgroup-sep" />
        <IconToggle
          label="首行缩进两字"
          title="首行缩进 2 字符（中文排版惯例），关闭即回到 0"
          glyph={<IconFirstLineIndent />}
          checked={firstLineIndent >= 2}
          // 首行缩进与悬挂缩进互斥：打开一边就把另一边归零，免得排出「首行既缩进又悬挂」的怪样子。
          onChange={(checked) =>
            patch({ paragraph: checked ? { firstLineIndentChars: 2, hangingIndentChars: 0 } : { firstLineIndentChars: 0 } })
          }
        />
        <IconToggle
          label="悬挂缩进两字"
          title="悬挂缩进 2 字符（首行顶格、其余行缩进，参考文献条目常用），关闭即回到 0"
          glyph={<IconHangingIndent />}
          checked={hangingIndent >= 2}
          onChange={(checked) =>
            patch({ paragraph: checked ? { hangingIndentChars: 2, firstLineIndentChars: 0 } : { hangingIndentChars: 0 } })
          }
        />
        <button
          type="button"
          className="icon-button"
          onClick={() => ctx.onClearGroup(role, 'paragraph')}
          aria-label="清除段落设置"
          title="清除该结构的段落设置，回落到继承值"
        >
          <IconReset />
        </button>
      </div>
    </RibbonGroup>
  )
}

/** 倍数的显示：1.5 就写 1.5，2 写 2。 */
function formatMultiple(value: number): string {
  return String(Number(value.toFixed(2)))
}

export function EditGroup({
  autoDetect,
  onAutoDetectChange,
  canUndo,
  onUndo,
}: {
  autoDetect: boolean
  onAutoDetectChange: (value: boolean) => void
  canUndo: boolean
  onUndo: () => void
}) {
  return (
    <RibbonGroup label="编辑">
      <div className="rgroup-row">
        <label className="check-inline" title="关闭后只按原生 Markdown 语义划分结构">
          <input type="checkbox" checked={autoDetect} onChange={(event) => onAutoDetectChange(event.target.checked)} />
          识别图题表题
        </label>
      </div>
      <div className="rgroup-row">
        <IconButton label="撤销样式修改" disabled={!canUndo} onClick={onUndo}>
          <IconUndo />
        </IconButton>
      </div>
    </RibbonGroup>
  )
}

/**
 * 编辑器配色：直接把配色方案铺在工具带上，点一下即切换，不用先开窗。
 *
 * 只改源码区自己的观感，跟文档样式包是两回事，所以控件上跟样式包分组隔开；
 * 需要逐色槽细调或导入导出时，再走最右边的「自定义…」。
 */
export function EditorSchemeGroup({
  schemes,
  activeId,
  hiddenCount,
  onSelect,
  onOpen,
}: {
  schemes: EditorScheme[]
  activeId: string
  /** 排在「更多」后面、没摆上工具带的方案数量。 */
  hiddenCount: number
  onSelect: (id: string) => void
  onOpen: () => void
}) {
  const active = schemes.find((scheme) => scheme.id === activeId)
  return (
    <RibbonGroup label="高亮配色" note={active ? active.name : undefined}>
      <div className="rgroup-row scheme-ribbon">
        {schemes.map((scheme) => {
          const on = scheme.id === activeId
          return (
            <button
              key={scheme.id}
              type="button"
              className={`scheme-chip${on ? ' on' : ''}`}
              aria-pressed={on}
              title={`${scheme.name}${scheme.builtIn ? '（内置）' : '（自定义）'}——点击切换编辑器配色`}
              onClick={() => onSelect(scheme.id)}
            >
              <span className="scheme-chip-name">{scheme.name}</span>
              <span className="scheme-chip-strip" aria-hidden="true">
                {(['heading', 'emphasis', 'code', 'listMarker', 'activeBlockBar'] as EditorTokenName[]).map((name) => (
                  <i key={name} style={{ background: scheme.tokens[name] }} />
                ))}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          className="scheme-more"
          title={`全部配色方案、逐色槽细调、导入导出${hiddenCount > 0 ? `（还有 ${hiddenCount} 套没摆出来）` : ''}`}
          onClick={onOpen}
        >
          <IconPalette />
          更多{hiddenCount > 0 ? ` +${hiddenCount}` : ''}
        </button>
      </div>
    </RibbonGroup>
  )
}

export function PageGroup({
  page,
  onPageChange,
}: {
  page: PageSetup
  onPageChange: (patch: Partial<PageSetup>) => void
}) {
  const margin = page.marginMm ?? { top: 20, right: 20, bottom: 20, left: 20 }
  const marginSides = [
    { key: 'top' as const, label: '上' },
    { key: 'right' as const, label: '右' },
    { key: 'bottom' as const, label: '下' },
    { key: 'left' as const, label: '左' },
  ]

  return (
    <RibbonGroup label="页面">
      <div className="rgroup-row">
        <Field label="纸张" compact>
          <select
            aria-label="纸张"
            value={typeof page.size === 'string' ? page.size : 'A4'}
            onChange={(event) => onPageChange({ size: event.target.value as PageSizeName })}
          >
            {Object.keys(PAGE_SIZES_MM).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="方向" compact>
          <SelectInput
            ariaLabel="方向"
            value={page.orientation ?? 'portrait'}
            options={[
              { value: 'portrait' as const, label: '纵向' },
              { value: 'landscape' as const, label: '横向' },
            ]}
            onChange={(value) => onPageChange({ orientation: value })}
          />
        </Field>
      </div>
      {/* 页边距单占一行：纸张/方向一行、页边距一行，三组栏目对齐时高度一致。 */}
      <div className="rgroup-row">
        <Field label="页边距" compact hint="上右下左，单位 mm">
          <span className="quad-row">
            {marginSides.map((side) => (
              <NumberInput
                key={side.key}
                value={margin[side.key]}
                inherited={false}
                min={0}
                ariaLabel={`${side.label}边距 mm`}
                onChange={(value) => onPageChange({ marginMm: { ...margin, [side.key]: value ?? 0 } })}
              />
            ))}
          </span>
        </Field>
      </div>
    </RibbonGroup>
  )
}

/** 页眉页脚：内容用弹窗编辑（仿 Word 的左中右三段 + 域按钮），工具带上只留入口和距边距离。 */
export function FurnitureGroup({
  page,
  onPageChange,
  onEditFurniture,
}: {
  page: PageSetup
  onPageChange: (patch: Partial<PageSetup>) => void
  onEditFurniture: (area: 'header' | 'footer') => void
}) {
  const header = page.header ?? {}
  const footer = page.footer ?? {}

  return (
    <RibbonGroup label="页眉页脚">
      <div className="rgroup-row">
        <Field label="页眉距顶部" compact hint="单位 mm，留空则在页边距区内居中">
          <NumberInput
            value={header.distanceMm}
            inherited={false}
            min={0}
            step={1}
            ariaLabel="页眉距顶部 mm"
            onChange={(value) => onPageChange({ header: { ...header, distanceMm: value } })}
          />
        </Field>
        <button type="button" className="furniture-edit" onClick={() => onEditFurniture('header')}>
          编辑页眉
        </button>
        <ToggleChip
          label="首页不显示"
          checked={page.skipFurnitureOnFirstPage ?? false}
          onChange={(checked) => onPageChange({ skipFurnitureOnFirstPage: checked })}
        />
      </div>
      <div className="rgroup-row">
        <Field label="页脚距底部" compact hint="单位 mm，留空则在页边距区内居中">
          <NumberInput
            value={footer.distanceMm}
            inherited={false}
            min={0}
            step={1}
            ariaLabel="页脚距底部 mm"
            onChange={(value) => onPageChange({ footer: { ...footer, distanceMm: value } })}
          />
        </Field>
        <button type="button" className="furniture-edit" onClick={() => onEditFurniture('footer')}>
          编辑页脚
        </button>
      </div>
    </RibbonGroup>
  )
}

export function DefaultsGroup({
  defaults,
  onDefaultsChange,
}: {
  defaults: DocumentDefaults
  onDefaultsChange: (patch: Partial<DocumentDefaults>) => void
}) {
  return (
    <RibbonGroup label="文档默认值">
      <div className="rgroup-row">
        <Field label="正文字号" compact>
          <FontSizeCombo
            value={defaults.fontSizePt}
            inherited={false}
            ariaLabel="正文字号 pt"
            onChange={(value) => onDefaultsChange({ fontSizePt: value })}
          />
        </Field>
        <Field label="默认行距" compact>
          <NumberInput
            value={defaults.lineHeight.value}
            inherited={false}
            step={0.05}
            ariaLabel="默认行距"
            onChange={(value) => onDefaultsChange({ lineHeight: { mode: defaults.lineHeight.mode, value: value ?? 1.5 } })}
          />
        </Field>
        <Field label="正文颜色" compact>
          <input
            type="color"
            aria-label="正文颜色"
            value={defaults.textColor}
            onChange={(event) => onDefaultsChange({ textColor: event.target.value })}
          />
        </Field>
      </div>
    </RibbonGroup>
  )
}

/**
 * 「表格」选项卡要用到的一整套上下文。
 *
 * 与「开始」页的 StyleEditContext 不同，这里的角色是定死的（整表 / 表头单元格 / 内容单元格），
 * 不跟着光标走：光标进了表格，要改的就是这张表的表头、内容和整体版式。
 */
export interface TableEditContext {
  theme: StyleTheme
  computed: ComputedStyles
  onRoleChange: (role: string, patch: Partial<RoleStyle>) => void
  onTableChange: (patch: Partial<TableSpec>) => void
  onOpenDialog: (role: string) => void
  onOpenBorderDialog: () => void
}

/** 单元格角色的九宫格取值：横轴取段落对齐，竖轴取垂直对齐。 */
function tableCellAlign(ctx: TableEditContext, role: string): { h: CellAlignH; v: CellAlignV } {
  const paragraph = ctx.computed.roles[role]?.paragraph
  const h: CellAlignH = paragraph?.align === 'center' ? 'center' : paragraph?.align === 'right' ? 'right' : 'left'
  const v: CellAlignV = paragraph?.verticalAlign ?? 'top'
  return { h, v }
}

/** 大小：宽度模式、最小尺寸、分布行/列。 */
function TableSizeGroup({ ctx }: { ctx: TableEditContext }) {
  const table = ctx.computed.table
  const mode: 'auto' | 'full' | 'percent' = table.widthPercent !== undefined ? 'percent' : table.widthMode
  const percent = table.widthPercent ?? 100

  return (
    <RibbonGroup label="大小" className="table-group">
      <div className="rgroup-row">
        <Field
          label="宽度"
          compact
          hint="按内容：表格宽度跟着单元格内容走；撑满：铺满纸张内容区（100%）；百分比：按内容区宽度取固定比例"
        >
          <SelectInput
            ariaLabel="表格宽度"
            value={mode}
            options={[
              { value: 'auto' as const, label: '按内容' },
              { value: 'full' as const, label: '撑满 100%' },
              { value: 'percent' as const, label: '百分比' },
            ]}
            onChange={(value) =>
              value === 'percent'
                ? ctx.onTableChange({ widthPercent: percent, widthMode: 'auto' })
                : ctx.onTableChange({ widthMode: value, widthPercent: undefined })
            }
          />
        </Field>
        {/* 百分比框只在「百分比」模式下出现：按内容 / 撑满时它没有作用，摆着只会占地方。 */}
        {mode === 'percent' ? (
          <Field label="宽度 %" compact hint="占纸张内容区的百分比，最大 100%">
            <NumberInput
              value={percent}
              inherited={false}
              min={1}
              max={100}
              step={5}
              ariaLabel="表格宽度百分比"
              onChange={(value) => ctx.onTableChange({ widthPercent: Math.min(100, Math.max(1, value ?? 100)) })}
            />
          </Field>
        ) : null}
      </div>
      <div className="rgroup-row">
        <Field label="最小宽度 %" compact hint="表格至少占内容区的百分比，0 表示不限">
          <NumberInput
            value={table.minWidthPercent}
            inherited={table.minWidthPercent === 0}
            min={0}
            max={100}
            step={5}
            ariaLabel="表格最小宽度百分比"
            onChange={(value) => ctx.onTableChange({ minWidthPercent: Math.min(100, Math.max(0, value ?? 0)) })}
          />
        </Field>
        <Field label="最小高度 pt" compact hint="整张表至少这么高（多出来的高度由各行分摊），0 表示不限">
          <NumberInput
            value={table.minHeightPt}
            inherited={table.minHeightPt === 0}
            min={0}
            step={2}
            ariaLabel="表格最小高度 pt"
            onChange={(value) => ctx.onTableChange({ minHeightPt: Math.max(0, value ?? 0) })}
          />
        </Field>
        <span className="rgroup-sep" />
        <IconButton
          label="分布列"
          text="分布列"
          pressed={table.distributeColumns}
          title="分布列：各列等宽，表格总宽不变"
          onClick={() => ctx.onTableChange({ distributeColumns: !table.distributeColumns })}
        >
          <IconDistributeColumns />
        </IconButton>
        <IconButton
          label="分布行"
          text="分布行"
          pressed={table.distributeRows}
          title="分布行：各行等高（按最高的一行），预览与导出 PDF 时生效"
          onClick={() => ctx.onTableChange({ distributeRows: !table.distributeRows })}
        >
          <IconDistributeRows />
        </IconButton>
      </div>
    </RibbonGroup>
  )
}

/**
 * 布局：表头与内容共用一块面板，靠左边那列「表头 / 内容」切换要改的是哪一类单元格。
 * 两边要设的东西完全一样（九宫格对齐 + 内边距），摆两块只会把工具带撑宽；
 * 切换键竖着排成一列做成一枚"面板选择器"，跟右边的控件分开得更清楚，也省一条横向空间。
 */
function TableLayoutGroup({ ctx }: { ctx: TableEditContext }) {
  const [panel, setPanel] = useState<'header' | 'cell'>('header')
  const role = panel === 'header' ? HEADER_ROLE : CELL_ROLE
  const label = panel === 'header' ? '表头' : '内容'
  return (
    <RibbonGroup label="布局" note={`${label}单元格`} className="table-group">
      <div className="rgroup-row">
        <span className="seg vertical" role="group" aria-label="布局作用于哪类单元格">
          {(
            [
              { id: 'header' as const, label: '表头' },
              { id: 'cell' as const, label: '内容' },
            ]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`seg-button${panel === item.id ? ' on' : ''}`}
              aria-label={item.label}
              aria-pressed={panel === item.id}
              title={`切换到${item.label}单元格的对齐与内边距`}
              onClick={() => setPanel(item.id)}
            >
              {item.label}
            </button>
          ))}
        </span>
        <span className="rgroup-sep" />
        <CellAlignGrid
          label={label}
          value={tableCellAlign(ctx, role)}
          onChange={(h, v) => ctx.onRoleChange(role, { paragraph: { align: h, verticalAlign: v } })}
        />
        <Field label="内边距" compact hint={`${label}单元格四边的内边距（pt）`}>
          <NumberInput
            value={ctx.computed.roles[role]?.paddingPt ?? 0}
            inherited={false}
            min={0}
            step={1}
            ariaLabel={`${label}内边距 pt`}
            onChange={(value) => ctx.onRoleChange(role, { paddingPt: Math.max(0, value ?? 0) })}
          />
        </Field>
      </div>
    </RibbonGroup>
  )
}

/**
 * 边框：上面四个预设（点一下就按"手里这条线"铺开），下面的线型 / 粗细 / 颜色是**待应用**的线，
 * 改它们不动表格——仿 Word：换线型不会把现有四条边一起改掉，得再点预设（或到窗口里逐边刷）。
 * 这样四条外框、两条内部线才能各用各的样式。
 */
function TableBorderGroup({ ctx }: { ctx: TableEditContext }) {
  const [line, setLine] = useState<BorderLine>(() => currentLine(ctx.computed))
  const preset = (id: Parameters<typeof applyBorderPreset>[1]) => applyBorderPreset(ctx.onRoleChange, id, line)
  const current = PRESET_LABELS[presetOf(ctx.computed)]

  return (
    <RibbonGroup label="边框" note={`当前：${current}`} className="table-group">
      <div className="rgroup-row">
        {BORDER_PRESETS.map((item) => (
          <IconButton
            key={item.id}
            label={item.label}
            text={item.short}
            title={`${item.label}：${item.hint}`}
            onClick={() => preset(item.id)}
          >
            {PRESET_ICONS[item.id]}
          </IconButton>
        ))}
        <button type="button" className="furniture-edit" onClick={ctx.onOpenBorderDialog}>
          边框和底纹…
        </button>
      </div>
      <div className="rgroup-row">
        <Field label="线型" compact hint="先在这里选好线，再点上面的预设才会应用到表格上">
          <SelectInput
            ariaLabel="边框线型"
            value={line.style}
            options={BORDER_STYLE_OPTIONS}
            onChange={(value) => setLine({ ...line, style: value })}
          />
        </Field>
        <Field label="粗细 pt" compact hint="线宽（pt），同样要点预设才应用">
          <NumberInput
            value={line.widthPt}
            inherited={false}
            min={0.25}
            step={0.25}
            ariaLabel="边框粗细 pt"
            onChange={(value) => setLine({ ...line, widthPt: Math.max(0.25, value ?? 1) })}
          />
        </Field>
        <Field label="颜色" compact hint="线颜色，同样要点预设才应用">
          <input
            type="color"
            aria-label="边框颜色"
            value={line.color}
            onChange={(event) => setLine({ ...line, color: event.target.value })}
          />
        </Field>
      </div>
    </RibbonGroup>
  )
}

/**
 * 样式：表格 / 表头 / 内容单元格的样式窗口入口，外加两处底纹。
 *
 * 表格那三个结构角色不再摆进「开始」页的结构画廊（光标进表格就切到这一页），所以这里的
 * 「表格样式…」是 `table` 角色（整表盒子的字体基线、段前段后间距、分页控制）的唯一入口。
 */
function TableStyleGroup({ ctx }: { ctx: TableEditContext }) {
  const panels = [
    { role: HEADER_ROLE, label: '表头', btn: '表头样式…' },
    { role: CELL_ROLE, label: '内容', btn: '内容样式…' },
  ] as const
  return (
    <RibbonGroup label="样式" note="表头与内容单元格" className="table-group">
      <div className="rgroup-row">
        <button type="button" className="furniture-edit" onClick={() => ctx.onOpenDialog(TABLE_ROLE)}>
          表格样式…
        </button>
        {panels.map((panel) => (
          <button key={panel.role} type="button" className="furniture-edit" onClick={() => ctx.onOpenDialog(panel.role)}>
            {panel.btn}
          </button>
        ))}
      </div>
      <div className="rgroup-row">
        {panels.map((panel) => {
          const explicit = ctx.theme.styles.find((style) => style.role === panel.role)?.background?.color
          const resolved = ctx.computed.roles[panel.role]?.background.color
          return (
            <Field key={panel.role} label={`${panel.label}底纹`} compact hint="单元格底纹色">
              <input
                type="color"
                aria-label={`${panel.label}底纹色`}
                value={explicit ?? resolved ?? '#ffffff'}
                onChange={(event) => ctx.onRoleChange(panel.role, { background: { color: event.target.value } })}
              />
            </Field>
          )
        })}
        <button
          type="button"
          className="icon-button"
          aria-label="清除底纹"
          title="清除表头与内容单元格的底纹"
          onClick={() => {
            ctx.onRoleChange(HEADER_ROLE, { background: { color: undefined } })
            ctx.onRoleChange(CELL_ROLE, { background: { color: undefined } })
          }}
        >
          <IconReset />
        </button>
      </div>
    </RibbonGroup>
  )
}

/** 属性：跨页重复标题行、表格整体对齐。 */
function TablePropsGroup({ ctx }: { ctx: TableEditContext }) {
  const table = ctx.computed.table
  const alignOptions = [
    { value: 'left' as const, label: '左对齐', glyph: <IconTableAlignLeft /> },
    { value: 'center' as const, label: '居中', glyph: <IconTableAlignCenter /> },
    { value: 'right' as const, label: '右对齐', glyph: <IconTableAlignRight /> },
  ]
  return (
    <RibbonGroup label="属性" className="table-group">
      <div className="rgroup-row">
        <span className="rgroup-inline-label">表格对齐</span>
        <span className="seg" role="group" aria-label="表格对齐">
          {alignOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`seg-button${table.align === option.value ? ' on' : ''}`}
              aria-label={`表格${option.label}`}
              aria-pressed={table.align === option.value}
              title={`表格${option.label}（按内容宽度时靠自动外边距摆位）`}
              onClick={() => ctx.onTableChange({ align: option.value })}
            >
              {option.glyph}
            </button>
          ))}
        </span>
      </div>
      <div className="rgroup-row">
        <ToggleChip
          label="跨页重复标题行"
          title="表格跨页时每页都补一遍表头；关掉后首行只出现一次"
          checked={table.repeatHeaderRow}
          onChange={(checked) => ctx.onTableChange({ repeatHeaderRow: checked })}
        />
      </div>
    </RibbonGroup>
  )
}

/** 「表格」选项卡的全部栏目：大小 / 布局 / 边框 / 样式 / 属性。 */
export function TableGroups({ ctx }: { ctx: TableEditContext }) {
  return (
    <>
      <TableSizeGroup ctx={ctx} />
      <TableLayoutGroup ctx={ctx} />
      <TableBorderGroup ctx={ctx} />
      <TableStyleGroup ctx={ctx} />
      <TablePropsGroup ctx={ctx} />
    </>
  )
}
