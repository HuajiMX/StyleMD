import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ROLES,
  roleCategory,
  roleLabel,
  type ComputedStyles,
  type RoleStyle,
  type StyleTheme,
} from '@stylemd/theme-schema'
import { computedToInlineStyle } from '../lib/inlineStyle'
import { explicitStyle, resolvedStyle } from '../lib/roleStyle'
import { clamp, useDialogFrame } from '../lib/dialogFrame'
import {
  canRequestSystemFonts,
  fontLabel,
  fontOptions,
  loadFontCatalog,
  resolveFontInput,
  useFontCatalog,
} from '../lib/fontCatalog'
import { FOLLOW_CJK_LABEL, currentSlots } from '../lib/fontChain'
import { FONT_FAMILIES, FONT_WEIGHTS } from '../lib/typePresets'
import { AlignSegmented } from './align-control'
import { Combo, Field, FontSizeCombo, IconToggle, NumberInput, Row, Section, SelectInput, ToggleChip } from './fields'
import { isMathSample, MathSample } from './MathSample'

type DialogTab = 'font' | 'paragraph' | 'border' | 'numbering' | 'advanced'

const DIALOG_TABS: { id: DialogTab; label: string; hint: string }[] = [
  { id: 'font', label: '字体', hint: '字族、字号、字重、颜色' },
  { id: 'paragraph', label: '段落', hint: '对齐、行距、缩进、分页' },
  { id: 'border', label: '边框与底纹', hint: '四边、圆角、底色、内边距' },
  { id: 'numbering', label: '编号', hint: '章节自动编号与间距' },
  { id: 'advanced', label: '进阶', hint: '继承关系、实时样本、移除' },
]

const BORDER_STYLE_OPTIONS = [
  { value: 'none' as const, label: '无' },
  { value: 'solid' as const, label: '实线' },
  { value: 'dashed' as const, label: '虚线' },
  { value: 'dotted' as const, label: '点线' },
  { value: 'double' as const, label: '双线' },
]

const SIDES = [
  { key: 'top' as const, label: '上' },
  { key: 'right' as const, label: '右' },
  { key: 'bottom' as const, label: '下' },
  { key: 'left' as const, label: '左' },
]

const MIN_WIDTH = 620
/** 预览区和页脚是固定高度的，窗口再小也要给表单留出空间。 */
const MIN_HEIGHT = 380
/** 首次打开时的最小高度，比手动缩放的下限宽裕一点，免得一进来就要往下滚。 */
const FIT_MIN_HEIGHT = 420

interface StyleDialogProps {
  theme: StyleTheme
  computed: ComputedStyles
  role: string
  documentTitle: string
  onRoleChange: (role: string, patch: Partial<RoleStyle>) => void
  onClearGroup: (role: string, group: keyof RoleStyle) => void
  onResetRole: (role: string) => void
  onClose: () => void
}

/**
 * 样式配置窗口。
 *
 * 表单照着排版软件的老规矩排：顶部选项卡，下面按「分区标题 + 细线」分块，
 * 块内一行并排放几组「标签: 控件」，数值带单位，不画卡片框。
 *
 * 窗口可以拖标题栏移动、拖右下角缩放；外层只有一层透明挡板，不压暗底色，
 * 但会吃掉点击，避免改样式时误操作到下面的正文。
 */
export function StyleDialog(props: StyleDialogProps) {
  const { theme, computed, role } = props
  const [tab, setTab] = useState<DialogTab>('font')
  const dialogRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  // 拖动、缩放、会话内记住位置：与编辑器配色窗口共用同一套实现。
  const {
    frame,
    setFrame,
    adjusted: adjustedRef,
    restored,
    beginDrag,
    beginResize,
    frameStyle,
  } = useDialogFrame({
    key: 'style-dialog',
    measure: () => ({
      width: clamp(window.innerWidth - 200, MIN_WIDTH, 1000),
      height: clamp(window.innerHeight - 180, MIN_HEIGHT, 720),
    }),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
  })

  const resolved = resolvedStyle(computed, role)
  const explicit = explicitStyle(theme, role)
  const definition = ROLES.find((item) => item.id === role)
  // hook 必须在下面那个「未知角色」的提前 return 之前调用
  const catalog = useFontCatalog()

  // 只在挂载时接管焦点与 Esc：这个 effect 不能挂在 props 上，
  // 否则每次输入都会重新聚焦对话框，正在编辑的输入框会被顶掉。
  const closeRef = useRef(props.onClose)
  closeRef.current = props.onClose
  useEffect(() => {
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // 高度贴着内容走：开窗时和每次切选项卡都重新量一次，用户一旦手动拖过就不再插手。
  useLayoutEffect(() => {
    if (adjustedRef.current || restored) return
    const dialog = dialogRef.current
    const body = bodyRef.current
    if (!dialog || !body) return
    const style = getComputedStyle(body)
    // body 是 flex 撑满的，scrollHeight 量不到真实内容高度，改量子元素总高。
    let content = 0
    for (const child of body.children) content += (child as HTMLElement).offsetHeight
    const chrome =
      dialog.offsetHeight - body.offsetHeight + Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
    setFrame((current) => ({
      ...current,
      height: clamp(content + chrome + 2, FIT_MIN_HEIGHT, window.innerHeight - 80),
    }))
  }, [tab])

  // 切角色时回到第一个选项卡，免得停在上一次角色的「编号」页上找不着北。
  useEffect(() => setTab('font'), [role])

  if (!resolved) {
    return (
      <div className="dialog-layer" onMouseDown={props.onClose}>
        <div className="style-dialog" role="dialog" aria-modal="true" aria-label="样式配置">
          <p className="dialog-empty">未知角色：{role}</p>
        </div>
      </div>
    )
  }

  const patch = (next: Partial<RoleStyle>) => props.onRoleChange(role, next)
  const slots = currentSlots(explicit?.font, resolved.font)
  const options = fontOptions(catalog)
  // 两个槽都列全部字体：编译期用 unicode-range 按字符区段分派，
  // 所以西文槽放中文字体也成立（拉丁用它、中文仍走中文那一项）
  const slotOptions = [
    { value: '', label: FOLLOW_CJK_LABEL, hint: '默认' },
    ...options,
  ]
  const allowedBasedOn = ROLES.filter(
    (item) => item.id !== role && (roleCategory(item.id) === roleCategory(role) || item.id === 'body.text'),
  )
  const inheritanceText =
    resolved.inheritanceChain.length > 1
      ? resolved.inheritanceChain.slice(1).map((item) => roleLabel(item)).join(' → ')
      : '文档默认值'

  /** 每个分区末尾都挂一条「回落到继承值」，符合表单里「这一块可以整个清掉」的预期。 */
  const inheritRow = (group: keyof RoleStyle, label: string, action = '回落到继承值') => (
    <Section title="继承" note={explicit?.[group] !== undefined ? `已显式声明${label}` : `继承自 ${inheritanceText}`}>
      <Row>
        <button
          type="button"
          className="mini ghost"
          disabled={explicit?.[group] === undefined}
          onClick={() => props.onClearGroup(role, group)}
          title={`清除这一组设置，${action}`}
        >
          ← {action}
        </button>
      </Row>
    </Section>
  )

  const tabBody: Record<DialogTab, ReactNode> = {
    font: (
      <>
        <Section title="字体" note={catalog.note}>
          <Row>
            <Field
              label="中文字体"
              inline
              inherited={explicit?.font?.cjkFamily === undefined}
              hint="中文（以及日韩）字符用这一项"
            >
              <Combo
                className="font-primary-combo"
                ariaLabel="中文字体"
                inherited={explicit?.font?.cjkFamily === undefined}
                value={fontLabel(slots.cjkFamily, catalog.aliases)}
                options={options}
                onPick={(family) => patch({ font: { cjkFamily: family } })}
                onCommit={(text) => {
                  const family = resolveFontInput(text, catalog)
                  if (family) patch({ font: { cjkFamily: family } })
                }}
              />
            </Field>
            <Field
              label="西文字体"
              inline
              inherited={explicit?.font?.latinFamily === undefined}
              hint="拉丁字母与半角标点用这一项；默认「使用中文字体」，也就是不单独指定"
            >
              <Combo
                className="font-primary-combo"
                ariaLabel="西文字体"
                inherited={explicit?.font?.latinFamily === undefined}
                value={slots.latinFamily ? fontLabel(slots.latinFamily, catalog.aliases) : FOLLOW_CJK_LABEL}
                options={slotOptions}
                onPick={(family) => patch({ font: { latinFamily: family } })}
                onCommit={(text) => {
                  const typed = text.trim()
                  const family = typed === FOLLOW_CJK_LABEL ? '' : resolveFontInput(typed, catalog)
                  patch({ font: { latinFamily: family } })
                }}
              />
            </Field>
          </Row>
          <Row>
            <span className="field-label">常用</span>
            {FONT_FAMILIES.slice(0, 8).map((family) => (
              <button
                key={family}
                type="button"
                className="family-hint"
                onClick={() => patch({ font: { cjkFamily: family } })}
              >
                {fontLabel(family, catalog.aliases)}
              </button>
            ))}
            {/* 浏览器里读本机字体要先授权，而权限框必须由用户手势触发：
                没授权时给个入口，别让人以为「只有这几个字体」。桌面壳不需要这一步。 */}
            {canRequestSystemFonts() && catalog.source !== 'browser' ? (
              <button
                type="button"
                className="family-hint"
                onClick={() => void loadFontCatalog(true)}
                title="浏览器会先问一次「是否允许查看本机字体」"
              >
                加载本机字体
              </button>
            ) : null}
          </Row>
          {/* 平时不该看见的东西：只有要精确控制中英混排时才动它，折叠起来不占版面 */}
          <details className="advanced-block">
            <summary>进阶：回退链</summary>
            <Row>
              <Field
                label="其余回退"
                inline
                wide
                inherited={explicit?.font?.fallbackFamilies === undefined}
                hint="逗号分隔，两个槽都没字体可用时按顺序尝试（例如末尾留一个 serif / sans-serif）。"
              >
                <input
                  type="text"
                  aria-label="字体族回退链"
                  value={slots.fallbackFamilies.join(', ')}
                  onChange={(event) =>
                    patch({
                      font: {
                        fallbackFamilies: event.target.value
                          .split(',')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </Field>
            </Row>
          </details>
        </Section>

        <Section title="字号与字形">
          <Row>
            <Field label="字号" inline inherited={explicit?.font?.sizePt === undefined}>
              <FontSizeCombo
                value={explicit?.font?.sizePt ?? resolved.font.sizePt}
                inherited={explicit?.font?.sizePt === undefined}
                ariaLabel="字号 pt"
                onChange={(value) => patch({ font: { sizePt: value } })}
              />
            </Field>
            <Field label="字重" inline inherited={explicit?.font?.weight === undefined}>
              <SelectInput
                ariaLabel="字重"
                inherited={explicit?.font?.weight === undefined}
                value={String(explicit?.font?.weight ?? resolved.font.weight)}
                options={FONT_WEIGHTS.map((weight) => ({ value: String(weight.value), label: weight.label }))}
                onChange={(value) => patch({ font: { weight: Number(value) } })}
              />
            </Field>
            <Field label="字距" inline inherited={explicit?.font?.letterSpacingPt === undefined}>
              <span className="field-control">
                <NumberInput
                  value={explicit?.font?.letterSpacingPt ?? resolved.font.letterSpacingPt}
                  inherited={explicit?.font?.letterSpacingPt === undefined}
                  step={0.1}
                  ariaLabel="字距 pt"
                  onChange={(value) => patch({ font: { letterSpacingPt: value } })}
                />
                <span className="unit">pt</span>
              </span>
            </Field>
          </Row>
          <Row>
            <span className="field-label">字形</span>
            <IconToggle
              label="倾斜"
              glyph="I"
              className="glyph-italic"
              checked={explicit?.font?.italic ?? resolved.font.italic}
              onChange={(checked) => patch({ font: { italic: checked } })}
            />
            <IconToggle
              label="下划线"
              glyph="U"
              className="glyph-underline"
              checked={explicit?.font?.underline ?? resolved.font.underline}
              onChange={(checked) => patch({ font: { underline: checked } })}
            />
          </Row>
        </Section>

        <Section title="颜色">
          <Row>
            <Field label="文字颜色" inline inherited={explicit?.font?.color === undefined}>
              <span className="field-control">
                <input
                  type="color"
                  value={explicit?.font?.color ?? resolved.font.color}
                  onChange={(event) => patch({ font: { color: event.target.value } })}
                />
                <code>{explicit?.font?.color ?? resolved.font.color}</code>
              </span>
            </Field>
          </Row>
        </Section>
        {inheritRow('font', '字体')}
      </>
    ),
    paragraph: (
      <>
        <Section title="常规" note="版式约定：不随「基于」继承">
          <Row>
            <Field label="对齐方式" inline>
              <AlignSegmented
                value={explicit?.paragraph?.align ?? resolved.paragraph.align}
                onChange={(value) => patch({ paragraph: { align: value } })}
              />
            </Field>
          </Row>
        </Section>

        <Section title="缩进" note="按字符数计的随字号缩放；版式约定，不随「基于」继承">
          <Row>
            <Field label="左侧" inline>
              <span className="field-control">
                <NumberInput
                  value={explicit?.paragraph?.indentLeftPt ?? resolved.paragraph.indentLeftPt}
                  inherited={false}
                  ariaLabel="左缩进 pt"
                  onChange={(value) => patch({ paragraph: { indentLeftPt: value } })}
                />
                <span className="unit">pt</span>
              </span>
            </Field>
            <Field label="右侧" inline>
              <span className="field-control">
                <NumberInput
                  value={explicit?.paragraph?.indentRightPt ?? resolved.paragraph.indentRightPt}
                  inherited={false}
                  ariaLabel="右缩进 pt"
                  onChange={(value) => patch({ paragraph: { indentRightPt: value } })}
                />
                <span className="unit">pt</span>
              </span>
            </Field>
            <Field label="首行缩进" inline>
              <span className="field-control">
                <NumberInput
                  value={explicit?.paragraph?.firstLineIndentChars ?? resolved.paragraph.firstLineIndentChars}
                  inherited={false}
                  step={0.5}
                  ariaLabel="首行缩进 字符"
                  onChange={(value) => patch({ paragraph: { firstLineIndentChars: value } })}
                />
                <span className="unit">字符</span>
              </span>
            </Field>
          </Row>
        </Section>

        <Section title="间距">
          <Row>
            <Field label="段前" inline inherited={explicit?.paragraph?.spaceBeforePt === undefined}>
              <span className="field-control">
                <NumberInput
                  value={explicit?.paragraph?.spaceBeforePt ?? resolved.paragraph.spaceBeforePt}
                  inherited={explicit?.paragraph?.spaceBeforePt === undefined}
                  ariaLabel="段前 pt"
                  onChange={(value) => patch({ paragraph: { spaceBeforePt: value } })}
                />
                <span className="unit">pt</span>
              </span>
            </Field>
            <Field label="段后" inline inherited={explicit?.paragraph?.spaceAfterPt === undefined}>
              <span className="field-control">
                <NumberInput
                  value={explicit?.paragraph?.spaceAfterPt ?? resolved.paragraph.spaceAfterPt}
                  inherited={explicit?.paragraph?.spaceAfterPt === undefined}
                  ariaLabel="段后 pt"
                  onChange={(value) => patch({ paragraph: { spaceAfterPt: value } })}
                />
                <span className="unit">pt</span>
              </span>
            </Field>
            <Field label="行距" inline inherited={explicit?.paragraph?.lineHeight === undefined}>
              <span className="field-control">
                <SelectInput
                  ariaLabel="行距模式"
                  inherited={explicit?.paragraph?.lineHeight === undefined}
                  value={explicit?.paragraph?.lineHeight?.mode ?? resolved.paragraph.lineHeight.mode}
                  options={[
                    { value: 'multiple' as const, label: '倍数' },
                    { value: 'fixed' as const, label: '固定值' },
                  ]}
                  onChange={(value) =>
                    patch({
                      paragraph: {
                        lineHeight: {
                          mode: value,
                          value: explicit?.paragraph?.lineHeight?.value ?? resolved.paragraph.lineHeight.value,
                        },
                      },
                    })
                  }
                />
                <NumberInput
                  value={explicit?.paragraph?.lineHeight?.value ?? resolved.paragraph.lineHeight.value}
                  inherited={explicit?.paragraph?.lineHeight === undefined}
                  min={0.5}
                  step={0.05}
                  ariaLabel="行距值"
                  onChange={(value) =>
                    patch({
                      paragraph: {
                        lineHeight: {
                          mode: explicit?.paragraph?.lineHeight?.mode ?? resolved.paragraph.lineHeight.mode,
                          value: value ?? 1.5,
                        },
                      },
                    })
                  }
                />
                <span className="unit">
                  {(explicit?.paragraph?.lineHeight?.mode ?? resolved.paragraph.lineHeight.mode) === 'fixed' ? 'pt' : '倍'}
                </span>
              </span>
            </Field>
          </Row>
        </Section>

        <Section title="分页" note="分页器支持度有限，尽力而为">
          <Row>
            <ToggleChip
              label="与下段同页"
              checked={explicit?.paragraph?.keepWithNext ?? resolved.paragraph.keepWithNext}
              onChange={(checked) => patch({ paragraph: { keepWithNext: checked } })}
            />
            <ToggleChip
              label="段前分页"
              checked={explicit?.paragraph?.pageBreakBefore ?? resolved.paragraph.pageBreakBefore}
              onChange={(checked) => patch({ paragraph: { pageBreakBefore: checked } })}
            />
          </Row>
        </Section>
        {/* 段落这一组里既有家族属性（行距、段间距）也有版式约定（对齐、缩进），清掉以后一个回继承、一个回默认 */}
        {inheritRow('paragraph', '段落', '回落到继承值 / 默认值')}
      </>
    ),
    border: (
      <>
        <Section title="边框" note="样式 / 线宽 pt / 颜色">
          <Row>
            {SIDES.map((side) => {
              const current = explicit?.border?.[side.key]
              const effective = current ?? resolved.border[side.key]
              return (
                <Field key={side.key} label={side.label} inline inherited={current === undefined}>
                  <span className="field-control">
                    <SelectInput
                      value={effective?.style ?? 'none'}
                      inherited={current === undefined}
                      options={BORDER_STYLE_OPTIONS}
                      onChange={(value) =>
                        patch({
                          border: { [side.key]: { ...resolved.border[side.key], style: value } } as RoleStyle['border'],
                        })
                      }
                    />
                    <NumberInput
                      value={effective?.widthPt ?? 1}
                      inherited={current === undefined}
                      min={0.25}
                      step={0.25}
                      onChange={(value) =>
                        patch({
                          border: {
                            [side.key]: { ...resolved.border[side.key], widthPt: value ?? 1 },
                          } as RoleStyle['border'],
                        })
                      }
                    />
                    <input
                      type="color"
                      value={effective?.color ?? '#000000'}
                      onChange={(event) =>
                        patch({
                          border: {
                            [side.key]: { ...resolved.border[side.key], color: event.target.value },
                          } as RoleStyle['border'],
                        })
                      }
                    />
                  </span>
                </Field>
              )
            })}
          </Row>
        </Section>

        <Section title="底纹与内边距">
          <Row>
            <Field label="底纹色" inline inherited={explicit?.background?.color === undefined}>
              <span className="field-control">
                <input
                  type="color"
                  value={explicit?.background?.color ?? resolved.background.color ?? '#ffffff'}
                  onChange={(event) => patch({ background: { color: event.target.value } })}
                />
                <code>{explicit?.background?.color ?? resolved.background.color ?? '继承'}</code>
              </span>
            </Field>
            <Field label="内边距" inline inherited={explicit?.paddingPt === undefined}>
              <span className="field-control">
                <NumberInput
                  value={explicit?.paddingPt ?? resolved.paddingPt}
                  inherited={explicit?.paddingPt === undefined}
                  ariaLabel="内边距 pt"
                  onChange={(value) => patch({ paddingPt: value })}
                />
                <span className="unit">pt</span>
              </span>
            </Field>
            <Field label="圆角" inline inherited={explicit?.border?.radiusPt === undefined}>
              <span className="field-control">
                <NumberInput
                  value={explicit?.border?.radiusPt ?? resolved.border.radiusPt}
                  inherited={explicit?.border?.radiusPt === undefined}
                  ariaLabel="圆角 pt"
                  onChange={(value) => patch({ border: { radiusPt: value } })}
                />
                <span className="unit">pt</span>
              </span>
            </Field>
          </Row>
        </Section>
        {inheritRow('border', '边框')}
      </>
    ),
    numbering: (
      <>
        <Section title="章节编号" note="对 1–3 级标题生效，{n} 代表序号">
          <Row>
            <ToggleChip
              label="启用自动编号"
              checked={explicit?.numbering?.enabled ?? resolved.numbering.enabled ?? false}
              onChange={(checked) => patch({ numbering: { enabled: checked } })}
            />
          </Row>
          <Row>
            <Field label="编号模板" inline>
              <input
                type="text"
                aria-label="编号模板"
                placeholder="第{n}章"
                value={explicit?.numbering?.pattern ?? resolved.numbering.pattern ?? ''}
                onChange={(event) => patch({ numbering: { pattern: event.target.value } })}
              />
            </Field>
            <Field label="编号间距" inline inherited={explicit?.numbering?.gapPt === undefined}>
              <span className="field-control">
                <NumberInput
                  value={explicit?.numbering?.gapPt ?? resolved.numbering.gapPt}
                  inherited={explicit?.numbering?.gapPt === undefined}
                  ariaLabel="编号间距 pt"
                  onChange={(value) => patch({ numbering: { gapPt: value } })}
                />
                <span className="unit">pt</span>
              </span>
            </Field>
          </Row>
        </Section>
        {inheritRow('numbering', '编号')}
      </>
    ),
    advanced: (
      <>
        <Section title="基于样式" note="跨类别继承只允许以「正文段落」为基础">
          <Row>
            <Field label="基础样式" inline>
              <select
                aria-label="基于样式"
                value={explicit?.basedOn ?? ''}
                onChange={(event) => patch({ basedOn: event.target.value || undefined })}
              >
                <option value="">（不额外继承）</option>
                {allowedBasedOn.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
          </Row>
        </Section>

        <Section title="移除样式">
          <Row>
            <span className="section-text">
              移除后「{roleLabel(role)}」回到完全继承的状态，样式包里的其它角色不受影响。
            </span>
            <button type="button" className="mini danger" onClick={() => props.onResetRole(role)}>
              移除 {roleLabel(role)} 的样式
            </button>
          </Row>
        </Section>
      </>
    ),
  }

  return (
    <div className="dialog-layer" onMouseDown={props.onClose}>
      <div
        className="style-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${roleLabel(role)} 样式配置`}
        tabIndex={-1}
        ref={dialogRef}
        style={frameStyle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head" onPointerDown={beginDrag} title="按住拖动窗口">
          <h2 className="dialog-title">{roleLabel(role)}</h2>
          <code className="role-id">{role}</code>
          <span className="inherit-chain">
            继承链：{resolved.inheritanceChain.map((item) => roleLabel(item)).join(' → ')}
          </span>
          <button type="button" className="dialog-close" aria-label="关闭样式窗口" onClick={props.onClose}>
            ✕
          </button>
        </header>

        <nav className="dialog-tabs" role="tablist" aria-label="样式类别">
          {DIALOG_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              title={item.hint}
              className={`dialog-tab${tab === item.id ? ' active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="dialog-body" ref={bodyRef}>
          <div className="form">
            {tabBody[tab]}
            {/* 预览放在主体表单后面，每个选项卡里都有；不固定在窗口底部。 */}
            <Section title="预览" note="用当前计算样式渲染，不进分页器">
              <div className="sample-box">
                <div style={computedToInlineStyle(resolved)}>
                  {definition && isMathSample(definition) ? (
                    <MathSample definition={definition} />
                  ) : (
                    definition?.sample || roleLabel(role)
                  )}
                </div>
              </div>
            </Section>
          </div>
        </div>

        <footer className="dialog-foot">
          <span className="dialog-note">改动即时生效，可用工具栏的「撤销样式修改」回退</span>
          <code className="dialog-doc">{props.documentTitle}</code>
          <button type="button" className="primary" onClick={props.onClose}>
            完成
          </button>
        </footer>
        <span className="dialog-resize" onPointerDown={beginResize} role="presentation" />
      </div>
    </div>
  )
}
