import { syntaxTree } from '@codemirror/language'
import type { Range, Text } from '@codemirror/state'
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view'

/**
 * Markdown 语法高亮。
 *
 * 没有用 @codemirror/language 自带的 HighlightStyle，是因为它按 lezer 标签着色，
 * 而 Markdown 里 `#`、`-`、`>`、围栏、表格竖线全都落在同一个 processingInstruction 标签上，
 * 分不出「列表符号」和「结构标记」。这里直接按语法树的节点名打类名，颜色写在 CSS 里，
 * 因此换配色只需要改 CSS 变量，编辑器本身不用重建。
 */
const NODE_CLASSES: Record<string, string> = {
  ATXHeading1: 'cm-md-heading',
  ATXHeading2: 'cm-md-heading',
  ATXHeading3: 'cm-md-heading',
  ATXHeading4: 'cm-md-heading',
  ATXHeading5: 'cm-md-heading',
  ATXHeading6: 'cm-md-heading',
  SetextHeading1: 'cm-md-heading',
  SetextHeading2: 'cm-md-heading',
  HeaderMark: 'cm-md-mark',
  Emphasis: 'cm-md-em',
  StrongEmphasis: 'cm-md-em',
  EmphasisMark: 'cm-md-mark',
  InlineCode: 'cm-md-code',
  CodeText: 'cm-md-code',
  CodeMark: 'cm-md-mark',
  CodeInfo: 'cm-md-mark',
  FencedCode: 'cm-md-code-block',
  Link: 'cm-md-link',
  Image: 'cm-md-link',
  URL: 'cm-md-link',
  LinkMark: 'cm-md-mark',
  LinkTitle: 'cm-md-meta',
  LinkLabel: 'cm-md-meta',
  QuoteMark: 'cm-md-mark',
  ListMark: 'cm-md-list',
  HorizontalRule: 'cm-md-sep',
  TableDelimiter: 'cm-md-meta',
  Escape: 'cm-md-meta',
  Entity: 'cm-md-meta',
  Comment: 'cm-md-meta',
  CommentBlock: 'cm-md-meta',
}

/**
 * 前沿元数据：`---` 开头的头部块。
 *
 * @codemirror/lang-markdown 不认 frontmatter，会把它解析成 Setext 标题 + 水平线，
 * 于是标题行会被染成标题色——和右侧预览里「前言是元数据」的认知冲突。
 * 这里单独识别一次并整块盖成次要色。
 */
function frontmatterRange(doc: Text): { from: number; to: number } | null {
  if (doc.lines < 2) return null
  const first = doc.line(1)
  if (first.text.trim() !== '---') return null
  for (let lineNumber = 2; lineNumber <= Math.min(doc.lines, 200); lineNumber += 1) {
    const line = doc.line(lineNumber)
    if (line.text.trim() === '---' || line.text.trim() === '...') return { from: first.from, to: line.to }
  }
  return null
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const frontmatter = frontmatterRange(view.state.doc)

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.from === node.to) return
        // 前言整块按元数据上色，不再叠语法色，免得两种颜色打架。
        if (frontmatter && node.from >= frontmatter.from && node.to <= frontmatter.to) return
        const className = NODE_CLASSES[node.name]
        if (!className) return
        ranges.push(Decoration.mark({ class: className }).range(node.from, node.to))
      },
    })
  }

  if (frontmatter) {
    ranges.push(Decoration.mark({ class: 'cm-md-meta' }).range(frontmatter.from, frontmatter.to))
  }

  // Decoration.set 会自己排序：语法树是「父节点先于子节点」的，直接按遍历顺序喂进去会乱序。
  return Decoration.set(ranges, true)
}

export const markdownSyntaxHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
