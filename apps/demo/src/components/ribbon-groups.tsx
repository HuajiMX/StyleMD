import { useRef, type ReactNode } from 'react'
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
import { AlignSegmented } from './align-control'
import {
  IconChevronDown,
  IconExport,
  IconFirstLineIndent,
  IconImport,
  IconIndentDecrease,
  IconIndentIncrease,
  IconLineSpacing,
  IconPalette,
  IconReset,
  IconUndo,
} from './icons'
import { FONT_FAMILIES, primaryFamily, withPrimaryFamily } from '../lib/typePresets'

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
  onExpand?: () => void
  children: ReactNode
}

/** 功能区里的一组控件：控件在上，组名在下，右侧一条竖分隔线——照着工具带的惯例来。 */
export function RibbonGroup({ label, note, grow, onExpand, children }: RibbonGroupProps) {
  return (
    <section className={`rgroup${grow ? ' grow' : ''}`}>
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

  return (
    <RibbonGroup label="字体" note={roleLabel(role)} onExpand={() => ctx.onOpenDialog(role)}>
      <div className="rgroup-row">
        <Field
          label=""
          compact
          inherited={!font?.family}
          hint={`当前回退链：${(font?.family ?? resolved.font.family).join(', ')}\n下拉选一个字体，或直接输入字体名（只改首选字体，其余回退保留）`}
        >
          <Combo
            className="font-family-combo"
            ariaLabel="字体族"
            inherited={font?.family === undefined}
            value={primaryFamily(font?.family ?? resolved.font.family)}
            options={FONT_FAMILIES.map((family) => ({ value: family, label: family }))}
            onPick={(family) => patch({ font: { family: withPrimaryFamily(font?.family ?? resolved.font.family, family) } })}
            onCommit={(text) => {
              const family = text.trim()
              if (family) patch({ font: { family: withPrimaryFamily(font?.family ?? resolved.font.family, family) } })
            }}
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
          onChange={(checked) => patch({ paragraph: { firstLineIndentChars: checked ? 2 : 0 } })}
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
      <div className="rgroup-row">
        <Field label="页眉" compact hint="可用域：{page} {pages} {title} {date}">
          <input
            type="text"
            aria-label="页眉"
            value={page.header?.center ?? ''}
            onChange={(event) => onPageChange({ header: { ...page.header, center: event.target.value } })}
          />
        </Field>
        <Field label="页脚" compact>
          <input
            type="text"
            aria-label="页脚"
            value={page.footer?.center ?? ''}
            onChange={(event) => onPageChange({ footer: { ...page.footer, center: event.target.value } })}
          />
        </Field>
        <ToggleChip
          label="首页不显示页眉页脚"
          checked={page.skipFurnitureOnFirstPage ?? false}
          onChange={(checked) => onPageChange({ skipFurnitureOnFirstPage: checked })}
        />
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
