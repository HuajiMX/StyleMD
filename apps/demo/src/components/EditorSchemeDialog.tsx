import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  CONTRAST_MINIMUM,
  MAX_SCHEME_NAME_LENGTH,
  TOKEN_HINTS,
  TOKEN_LABELS,
  TOKEN_NAMES,
  TOKEN_TIERS,
  formatContrast,
  getBuiltInScheme,
  isSchemeColor,
  markSchemeAdded,
  markSchemeUsed,
  migrateSchemeLibrary,
  orderSchemeIds,
  orderSchemesByFrozenIds,
  orderSchemesByRecent,
  type EditorScheme,
  type EditorSchemeLibrary,
  type EditorTokenName,
} from '@stylemd/editor-theme'
import { createSourceEditor } from '../lib/editor/createEditor'
import { activeScheme, cloneSchemeTokens, tokenContrast } from '../lib/editor/scheme'
import { clamp, useDialogFrame } from '../lib/dialogFrame'

interface EditorSchemeDialogProps {
  library: EditorSchemeLibrary
  onChange: (library: EditorSchemeLibrary) => void
  onClose: () => void
}

/** 预览用的固定样本：每种会着色的语法都出现一次，包括结构块与当前行。 */
const SAMPLE = [
  '# 一级标题',
  '## 二级标题',
  '',
  '正文里有 **加粗**、*斜体* 与 `行内代码`，还有 [链接](https://example.com)。',
  '',
  '- 列表项一',
  '- 列表项二',
  '',
  '> 引用块',
  '',
  '```ts',
  "const theme = loadTheme('thesis-cn')",
  '```',
  '',
  '---',
  '',
].join('\n')

const SAMPLE_ACTIVE_TEXT = '正文里有 **加粗**、*斜体* 与 `行内代码`，还有 [链接](https://example.com)。'

/** 左边是预览、右边是 14 行色槽，窗口再小也要装得下这两栏。 */
const MIN_WIDTH = 720
const MIN_HEIGHT = 420

/**
 * 编辑器配色面板：上面切预设，下面逐色槽调，右边始终有真实编辑器当预览。
 *
 * 预览不是手写的「像编辑器」的 HTML，而是同一个 createSourceEditor 起的只读实例，
 * 所以将来新增语法类型时预览会自动跟上，不会和真身漂移。
 *
 * 窗口的拖动与缩放走 useDialogFrame，跟样式窗口是同一份实现。
 */
export function EditorSchemeDialog({ library, onChange, onClose }: EditorSchemeDialogProps) {
  const current = useMemo(() => activeScheme(library), [library])
  /**
   * 面板内的顺序在打开那一刻定格。
   *
   * 点选会立刻改「最近使用」，但面板自己先不重排——用户正在这里调色，卡片突然跳位很难受。
   * 新出现的方案（改内置色自动生成的副本、导入的方案）追加在末尾，不会挤走正在看的卡片；
   * 下次打开面板时再按最新顺序排。
   */
  const frozenIdsRef = useRef<string[] | null>(null)
  frozenIdsRef.current ??= orderSchemeIds(library)
  const orderedSchemes = useMemo(
    () => orderSchemesByFrozenIds(library.schemes, frozenIdsRef.current ?? []),
    [library],
  )
  const previewHost = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const { beginDrag, beginResize, frameStyle } = useDialogFrame({
    key: 'editor-scheme-dialog',
    measure: () => ({
      width: clamp(window.innerWidth - 320, MIN_WIDTH, 980),
      height: clamp(window.innerHeight - 200, MIN_HEIGHT, 700),
    }),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
  })

  useEffect(() => {
    const host = previewHost.current
    if (!host) return
    const start = SAMPLE.indexOf(SAMPLE_ACTIVE_TEXT)
    const editor = createSourceEditor({
      parent: host,
      value: SAMPLE,
      readOnly: true,
      onScrollRatio: () => {},
    })
    // 预览里的光标也放到那一段上：当前行底色与结构竖线要落在同一处，才看得出实际效果。
    // 用 dispatch 而不是 setCursor——后者会把焦点抢出对话框。
    editor.view.dispatch({ selection: { anchor: start + 1 } })
    editor.setRoleHighlight({
      spans: [{ role: 'body.text', start, end: start + SAMPLE_ACTIVE_TEXT.length, depth: 0, parent: -1 }],
      cursor: start + 1,
    })
    return () => editor.destroy()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  /** 改内置方案时自动落一份副本：用户不用先理解「副本」这个概念才敢调色。 */
  const writeTokens = useCallback(
    (tokens: ReturnType<typeof cloneSchemeTokens>) => {
      const scheme = activeScheme(library)
      if (scheme.builtIn) {
        // 改内置方案 = 落一份副本，并让它排到最前、立刻生效。
        const copy = {
          ...scheme,
          id: nextSchemeId(library, scheme.id),
          name: nextSchemeName(library, `${scheme.name} 副本`),
          builtIn: false,
          basedOn: scheme.id,
          tokens,
        }
        onChange(markSchemeAdded({ ...library, schemes: [...library.schemes, copy] }, copy.id))
        return
      }
      onChange({
        ...library,
        activeId: scheme.id,
        schemes: library.schemes.map((entry) => (entry.id === scheme.id ? { ...entry, tokens } : entry)),
      })
    },
    [library, onChange],
  )

  const patchToken = useCallback(
    (name: EditorTokenName, value: string) => {
      if (!isSchemeColor(value)) return
      writeTokens({ ...cloneSchemeTokens(current.tokens), [name]: value.toLowerCase() })
    },
    [current, writeTokens],
  )

  const renameActive = useCallback(
    (name: string) => {
      const trimmed = name.slice(0, MAX_SCHEME_NAME_LENGTH)
      onChange({
        ...library,
        schemes: library.schemes.map((entry) => (entry.id === current.id ? { ...entry, name: trimmed } : entry)),
      })
    },
    [current.id, library, onChange],
  )

  const resetActive = useCallback(() => {
    const source = getBuiltInScheme(current.basedOn ?? '') ?? getBuiltInScheme('paper')
    if (source) writeTokens(cloneSchemeTokens(source.tokens))
  }, [current.basedOn, writeTokens])

  const removeActive = useCallback(() => {
    if (current.builtIn) return
    onChange({
      ...library,
      activeId: library.schemes.find((entry) => entry.builtIn)?.id ?? 'paper',
      schemes: library.schemes.filter((entry) => entry.id !== current.id),
      recentIds: library.recentIds.filter((entry) => entry !== current.id),
    })
  }, [current, library, onChange])

  const exportActive = useCallback(() => {
    const payload = JSON.stringify({ schemaVersion: 1, activeId: current.id, schemes: [current] }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${current.id}.stylemd-editor.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [current])

  const importScheme = useCallback(
    async (file: File) => {
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error('配色文件不能超过 2 MB')
        const { library: imported, notes } = migrateSchemeLibrary(JSON.parse(await file.text()) as unknown)
        const scheme = imported.schemes.find((entry) => !entry.builtIn)
        if (!scheme) throw new Error('文件里没有自定义配色方案')
        const id = nextSchemeId(library, scheme.id)
        const next: EditorScheme = { ...scheme, id, name: nextSchemeName(library, scheme.name) }
        onChange(markSchemeAdded({ ...library, schemes: [...library.schemes, next] }, id))
        setMessage(notes.length > 0 ? `已导入（${notes.join('；')}）` : `已导入「${next.name}」`)
      } catch (error) {
        setMessage(`导入失败：${error instanceof Error ? error.message : String(error)}`)
      } finally {
        if (fileInput.current) fileInput.current.value = ''
      }
    },
    [library, onChange],
  )

  return (
    <div className="dialog-layer" onPointerDown={onClose}>
      {/* 面板得套在挡板里面：挡板是 z-index 50 的整屏层，放它外面会被吃掉点击。 */}
      <section
        className="style-dialog scheme-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="编辑器配色"
        style={frameStyle}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head" onPointerDown={beginDrag} title="按住拖动窗口">
          <h2 className="dialog-title">编辑器配色</h2>
          <span className="dialog-sub">只影响源码编辑区，不影响预览与导出</span>
          <button type="button" className="dialog-close" aria-label="关闭" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="scheme-presets" role="radiogroup" aria-label="配色方案">
          {orderedSchemes.map((scheme) => (
            <button
              key={scheme.id}
              type="button"
              role="radio"
              aria-checked={scheme.id === current.id}
              className={`scheme-card${scheme.id === current.id ? ' on' : ''}`}
              onClick={() => onChange(markSchemeUsed(library, scheme.id))}
            >
              <span className="scheme-card-name">
                {scheme.name}
                {scheme.builtIn ? <small>内置</small> : <small>自定义</small>}
              </span>
              <span className="scheme-strip" aria-hidden="true">
                {(['heading', 'emphasis', 'code', 'listMarker', 'activeBlockBar'] as EditorTokenName[]).map((name) => (
                  <i key={name} style={{ background: scheme.tokens[name] }} />
                ))}
              </span>
            </button>
          ))}
        </div>

        <div className="scheme-body">
          <div className="scheme-preview">
            <div className="scheme-preview-label">实时预览</div>
            <div className="scheme-preview-host" ref={previewHost} />
          </div>

          <div className="scheme-tokens">
            <div className="scheme-name-row">
              <input
                type="text"
                aria-label="配色方案名称"
                value={current.name}
                readOnly={current.builtIn === true}
                maxLength={MAX_SCHEME_NAME_LENGTH}
                onChange={(event) => renameActive(event.target.value)}
              />
              {current.builtIn ? <span className="scheme-hint">内置方案：改任一颜色会自动存成副本</span> : null}
            </div>

            {TOKEN_NAMES.map((name) => {
              const tier = TOKEN_TIERS[name]
              const minimum = CONTRAST_MINIMUM[tier]
              const ratio = tokenContrast(current.tokens, name)
              const weak = minimum > 0 && ratio !== null && ratio < minimum
              return (
                <div className="scheme-token-row" key={name}>
                  <span className="scheme-token-name" title={TOKEN_HINTS[name]}>
                    {TOKEN_LABELS[name]}
                  </span>
                  <input
                    type="color"
                    aria-label={`${TOKEN_LABELS[name]}颜色`}
                    value={current.tokens[name].slice(0, 7)}
                    onChange={(event) => patchToken(name, event.target.value)}
                  />
                  <HexField
                    label={`${TOKEN_LABELS[name]}色值`}
                    value={current.tokens[name]}
                    onCommit={(next) => patchToken(name, next)}
                  />
                  <span className={`badge ${weak ? 'warn' : 'ok'}`}>
                    {minimum === 0 ? '底色' : `对比度 ${formatContrast(ratio)}`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <footer className="dialog-foot">
          <button type="button" className="secondary" onClick={resetActive}>
            恢复初始值
          </button>
          <button type="button" className="secondary" onClick={exportActive}>
            导出 JSON
          </button>
          <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>
            导入 JSON
          </button>
          <button type="button" className="secondary danger" onClick={removeActive} disabled={current.builtIn === true}>
            删除该方案
          </button>
          {message ? <span className="dialog-note">{message}</span> : null}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importScheme(file)
            }}
          />
        </footer>
        <span className="dialog-resize" role="presentation" onPointerDown={beginResize} />
      </section>
    </div>
  )
}

/** 生成不与现有方案冲突的 id：paper-copy、paper-copy-2 …… */
/**
 * 十六进制输入框。
 *
 * 直接受控于配色值的话，用户每敲一个字符都会被校验挡回去、光标乱跳——只有整段粘贴才进得来。
 * 这里留一份草稿：合法就提交，非法就先放着，失焦时再回到真正的值。
 */
function HexField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      type="text"
      className="scheme-token-hex"
      aria-label={label}
      spellCheck={false}
      value={draft}
      onChange={(event) => {
        const next = event.target.value.trim()
        setDraft(event.target.value)
        if (isSchemeColor(next)) onCommit(next.toLowerCase())
      }}
      onBlur={() => setDraft(value)}
    />
  )
}

function nextSchemeId(library: EditorSchemeLibrary, base: string): string {
  const taken = new Set(library.schemes.map((scheme) => scheme.id))
  const cleaned = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'scheme'
  if (!taken.has(cleaned)) return cleaned
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${cleaned}-${index}`
    if (!taken.has(candidate)) return candidate
  }
  return `${cleaned}-${Date.now()}`
}

function nextSchemeName(library: EditorSchemeLibrary, base: string): string {
  const taken = new Set(library.schemes.map((scheme) => scheme.name))
  if (!taken.has(base)) return base.slice(0, MAX_SCHEME_NAME_LENGTH)
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base} ${index}`.slice(0, MAX_SCHEME_NAME_LENGTH)
    if (!taken.has(candidate)) return candidate
  }
  return base.slice(0, MAX_SCHEME_NAME_LENGTH)
}
