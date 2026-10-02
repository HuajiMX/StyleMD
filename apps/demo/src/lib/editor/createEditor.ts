import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  ViewPlugin,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from '@codemirror/view'
import { markdownSyntaxHighlight } from './syntaxHighlight'
import { activeRoleField, roleGutter, setRoleHighlight, type RoleHighlight } from './roleHighlight'
import type { SourceEditorHandle } from './types'

export interface SourceEditorOptions {
  parent: HTMLElement
  value: string
  /** 预览用的只读实例。 */
  readOnly?: boolean
  onChange?: (value: string) => void
  onCursor?: (offset: number) => void
  onScrollRatio?: (ratio: number) => void
}

export interface SourceEditor extends SourceEditorHandle {
  view: EditorView
  setRoleHighlight(input: RoleHighlight): void
}

/**
 * 编辑器外观。
 *
 * 必须写成 CodeMirror 的主题扩展，不能只写在 styles.css 里：CM 自带一套基础主题，
 * 是在运行时注入到文档里的，位置比我们的样式表更靠后、权重又相同——
 * 结果是 `.cm-gutters` 的底色、`.cm-activeLine` 的浅蓝、光标颜色这些都被它压过去。
 * 主题扩展会带一个专属类名前缀，权重更高，才压得住。
 *
 * 颜色一律引用 CSS 变量（由配色方案注入），所以换配色仍然不需要重建编辑器。
 */
const surfaceTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--ed-bg)',
    color: 'var(--ed-fg)',
    colorScheme: 'var(--ed-color-scheme, light)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--mono)',
    fontSize: '12.5px',
    lineHeight: '1.75',
    padding: '12px 14px',
  },
  '.cm-content': { padding: '0', caretColor: 'var(--accent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-selectionBackground': { backgroundColor: 'var(--accent-soft)' },
  '.cm-content ::selection': { backgroundColor: 'var(--accent-soft)' },
  // 行号槽：数字在左，右边留一条窄槽给「当前结构」的竖线（VS Code 改动条的位置）。
  '.cm-gutters': { backgroundColor: 'transparent', borderRight: '0', color: 'var(--syn-meta)' },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 4px',
    fontSize: '11.5px',
    fontVariantNumeric: 'tabular-nums',
  },
  // 当前行的行号加深加粗即可；底色要与编辑器一致，否则深色配色下会露出一个白方块。
  '.cm-activeLineGutter': { color: 'var(--ed-fg)', fontWeight: '600', backgroundColor: 'transparent' },
  // 当前行底色：光标在哪一行，哪一行亮一层。结构范围交给行号槽的竖线，正文不铺底色。
  '.cm-activeLine': { backgroundColor: 'var(--ed-active-line)' },
})

/**
 * 滚动进度上报。
 *
 * scroll 事件不冒泡，所以不能挂在 EditorView.domEventHandlers 上，必须直接监听滚动容器。
 */
function scrollReporter(report: (ratio: number) => void) {
  return ViewPlugin.fromClass(
    class {
      view: EditorView
      handler: () => void

      constructor(view: EditorView) {
        this.view = view
        this.handler = () => {
          const element = view.scrollDOM
          const range = element.scrollHeight - element.clientHeight
          report(range > 0 ? element.scrollTop / range : 0)
        }
        view.scrollDOM.addEventListener('scroll', this.handler, { passive: true })
      }

      update() {}

      destroy() {
        this.view.scrollDOM.removeEventListener('scroll', this.handler)
      }
    },
  )
}

export function createSourceEditor(options: SourceEditorOptions): SourceEditor {
  const readOnly = options.readOnly === true
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        // 只挂 Markdown 基础语言：用 markdown() 会连带把 HTML / JS / CSS 语言包拖进产物
        // （它默认支持在 Markdown 里高亮嵌套的 HTML 代码块），而本项目把原始 HTML 当纯文本，
        // 用不上那份体积。实测这一步能省下两百多 kB。
        markdownLanguage,
        EditorView.lineWrapping,
        surfaceTheme,
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        markdownSyntaxHighlight,
        activeRoleField,
        roleGutter,
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) options.onChange?.(update.state.doc.toString())
          if (update.docChanged || update.selectionSet) options.onCursor?.(update.state.selection.main.head)
        }),
        ...(options.onScrollRatio ? [scrollReporter(options.onScrollRatio)] : []),
      ],
    }),
  })

  const clamp = (offset: number) => Math.min(Math.max(0, Math.round(offset)), view.state.doc.length)

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue(next) {
      if (next === view.state.doc.toString()) return
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
    },
    focus: () => view.focus(),
    setCursor(offset) {
      const position = clamp(offset)
      view.dispatch({ selection: { anchor: position } })
      view.focus()
    },
    revealOffset(offset) {
      const position = clamp(offset)
      view.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: 8 }),
      })
    },
    offsetTopsFor(offsets) {
      // 内容元素当前贴在屏幕上哪儿，就是文档坐标的原点；两者之差把内容内边距折算出来。
      const paddingTop =
        view.scrollDOM.scrollTop -
        (view.scrollDOM.getBoundingClientRect().top - view.contentDOM.getBoundingClientRect().top)
      const maxScroll = Math.max(0, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight)
      return offsets.map((offset) => {
        const desired = view.lineBlockAt(clamp(offset)).top + paddingTop
        return Math.min(Math.max(0, Math.round(desired)), maxScroll)
      })
    },
    scrollTop: () => view.scrollDOM.scrollTop,
    getScrollRatio() {
      const element = view.scrollDOM
      const range = element.scrollHeight - element.clientHeight
      return range > 0 ? element.scrollTop / range : 0
    },
    setScrollRatio(ratio) {
      const element = view.scrollDOM
      const range = element.scrollHeight - element.clientHeight
      if (range <= 0) return
      element.scrollTop = Math.min(Math.max(0, ratio), 1) * range
    },
    setRoleHighlight(input) {
      view.dispatch({ effects: setRoleHighlight.of(input) })
    },
    destroy: () => view.destroy(),
  }
}
