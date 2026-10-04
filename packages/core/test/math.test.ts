import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { KATEX_CSS, KATEX_VERSION, MATH_BASE_CSS, build, collectRoleSpans, parseMarkdown, renderBody } from '@stylemd/core'
import { getBuiltInTheme } from '@stylemd/presets'
import { ROLES, isKnownRole, type StyleTheme } from '@stylemd/theme-schema'

const theme = getBuiltInTheme('tech-document')!
const require = createRequire(import.meta.url)
const installedKatexVersion = (JSON.parse(readFileSync(require.resolve('katex/package.json'), 'utf8')) as { version: string }).version

describe('数学公式', () => {
  it('$...$ 渲染成行内公式，TeX 原文进 MathML 注解便于复制与无障碍', () => {
    const { html } = renderBody(parseMarkdown('质能方程 $E = mc^2$ 成立。').tree)
    expect(html).toContain('<span data-role="math-inline" class="stylemd-math stylemd-math-inline">')
    expect(html).toContain('class="katex"')
    expect(html).toContain('E = mc^2')
  })

  it('$$...$$ 渲染成独占一行的行间公式', () => {
    const { html } = renderBody(parseMarkdown('$$\n\\int_0^1 x^2 \\,\\mathrm{d}x = \\frac{1}{3}\n$$').tree)
    expect(html).toContain('<div data-role="math-block" class="stylemd-math stylemd-math-block">')
    expect(html).toContain('katex-display')
  })

  it('单行 $$...$$ 也按行间公式排版，不要求 $$ 自己占行', () => {
    const tree = parseMarkdown('前一段\n\n$$U_i = S - c \\cdot a_i$$\n\n后一段').tree
    expect(tree.children.map((node) => node.type)).toEqual(['paragraph', 'math', 'paragraph'])
    const { html } = renderBody(tree)
    expect(html).toContain('<div data-role="math-block"')
    expect(html).toContain('katex-display')
  })

  it('夹在文字中间的 $$...$$ 按 Pandoc 的做法把段落切开，不留下空段落', () => {
    const tree = parseMarkdown('价格 $$x$$ 元\n\n$$a$$ $$b$$').tree
    expect(tree.children.map((node) => node.type)).toEqual(['paragraph', 'math', 'paragraph', 'math', 'math'])
    const { html } = renderBody(tree)
    expect(html).toContain('价格')
    expect(html).toContain('元')
    expect(html.match(/data-role="math-block"/g)).toHaveLength(3)
  })

  it('单个 $...$ 独占一段时仍然是行内公式', () => {
    const tree = parseMarkdown('$x$').tree
    expect(tree.children.map((node) => node.type)).toEqual(['paragraph'])
    expect(renderBody(tree).html).toContain('data-role="math-inline"')
  })

  it('公式进入角色树，能在样式窗口里单独调', () => {
    const roles = collectRoleSpans('行内 $a+b$ 结尾\n\n$$\na^2\n$$\n').map((span) => span.role)
    expect(roles).toContain('math.inline')
    expect(roles).toContain('math.block')
    expect(isKnownRole('math.inline')).toBe(true)
    expect(isKnownRole('math.block')).toBe(true)
  })

  it('公式角色的样例是纯 TeX，交给画廊与样式窗口用 KaTeX 渲染', () => {
    const inlineRole = ROLES.find((role) => role.id === 'math.inline')
    const blockRole = ROLES.find((role) => role.id === 'math.block')
    expect(inlineRole?.sampleKind).toBe('inline-math')
    expect(blockRole?.sampleKind).toBe('display-math')
    // 反斜杠要原样保留：普通字符串里的 `\f` 会变成换页符，样例就废了
    expect(blockRole?.sample).toContain('\\Delta')
    expect(blockRole?.sample).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/)
    // 样例里不该再出现分隔符：它直接进 KaTeX，带上 `$$` 反而解析不了
    expect(blockRole?.sample).not.toContain('$')
  })

  it('行间公式默认居中：主题没声明它时也居中，声明了就以主题为准', () => {
    const withoutMath = { ...theme, styles: theme.styles.filter((style) => style.role !== 'math.block') } as StyleTheme
    expect(build('$$\na\n$$', withoutMath).computed.roles['math.block']!.paragraph.align).toBe('center')

    const overridden = {
      ...theme,
      styles: [...withoutMath.styles, { role: 'math.block', paragraph: { align: 'left' as const } }],
    } as StyleTheme
    expect(build('$$\na\n$$', overridden).computed.roles['math.block']!.paragraph.align).toBe('left')
  })

  it('KaTeX 写死的居中交还给角色样式，主题改对齐时产物跟着走', () => {
    expect(MATH_BASE_CSS).toContain('.stylemd-math-block .katex-display { margin: 0; text-align: inherit; }')
    const withoutMath = { ...theme, styles: theme.styles.filter((style) => style.role !== 'math.block') } as StyleTheme
    const rule = /\[data-role="math-block"\]\s*\{([^}]*)\}/.exec(build('$$\na\n$$', withoutMath).css)?.[1] ?? ''
    expect(rule).toContain('text-align: center;')
  })

  it('片段渲染会回报是否用到公式，便于宿主补 KaTeX 样式', () => {
    expect(renderBody(parseMarkdown('纯文字段落').tree).hasMath).toBe(false)
    expect(renderBody(parseMarkdown('带 $a+b$ 的段落').tree).hasMath).toBe(true)
  })

  it('代码块与行内代码里的美元符号不当公式解析', () => {
    const { html } = renderBody(parseMarkdown('行内 `$a$`\n\n```\n$b$\n```').tree)
    expect(html).not.toContain('katex')
    expect(html).toContain('data-role="code-inline"')
    expect(html).toContain('$a$')
    expect(html).toContain('$b$')
  })

  it('行间公式的 \\tag 编号一起排版', () => {
    const { html } = renderBody(parseMarkdown('$$\na=1 \\tag{1-1}\n$$').tree)
    expect(html).toContain('katex-tag')
    expect(html).toContain('1-1')
  })

  it('公式语法错误只降级本段并给出警告，不打断整篇渲染', () => {
    const { html, warnings } = renderBody(parseMarkdown('前面 $\\notacommand$ 后面').tree)
    expect(html).toContain('stylemd-math-error')
    expect(html).toContain('前面')
    expect(html).toContain('后面')
    expect(html).toContain('\\notacommand')
    expect(warnings.join()).toContain('无法解析')
  })
})

describe('公式样式注入', () => {
  it('只有出现公式时才附带 KaTeX 样式与内联字体', () => {
    const plain = build('# 标题\n\n正文段落', theme)
    expect(plain.html).not.toContain('katex')
    expect(plain.html).not.toContain('data:font/woff2')

    const withMath = build('行内 $a^2$ 公式', theme)
    expect(withMath.html).toContain('data-role="math-inline"')
    expect(withMath.html).toContain('data:font/woff2')
    expect(withMath.html).toContain('.stylemd-math-block')
  })

  it('行间公式的对齐与间距由主题控制，行内公式不写死字号以继承正文', () => {
    const result = build('行内 $a$ 公式\n\n$$\nb\n$$', theme)
    const blockRule = /\[data-role="math-block"\]\s*\{([^}]*)\}/.exec(result.css)?.[1] ?? ''
    expect(blockRule).toContain('text-align: center;')
    expect(blockRule).toContain('text-indent: 0em;')
    expect(blockRule).toContain('margin-block-start: 10pt;')
    // 没有字号/字体声明，说明它让公式跟着所在段落走，KaTeX 自己管数学字体。
    expect(result.css).not.toContain('[data-role="math-inline"]')
  })

  it('公式里的尖括号同样被转义，注入进不来', () => {
    const result = build('$a<b$', theme)
    expect(result.html).not.toContain('<b>')
    expect(result.html).toContain('a&lt;b')
  })

  it('内联的 KaTeX 样式与已安装版本一致（升级 katex 后要重跑生成脚本）', () => {
    expect(KATEX_VERSION).toBe(installedKatexVersion)
    expect(KATEX_CSS).toContain('@font-face')
    expect(KATEX_CSS).toContain('data:font/woff2;base64,')
    // 字体必须全部内联，留下相对路径就会在 srcdoc 预览与离线导出里 404
    expect(KATEX_CSS).not.toContain('url(fonts/')
    expect(MATH_BASE_CSS).toContain('.stylemd-math-block')
  })
})
