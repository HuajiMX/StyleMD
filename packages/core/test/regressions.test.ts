import { describe, expect, it } from 'vitest'
import { build, parseMarkdown, renderBody, resolveStyles, compileCss } from '@stylemd/core'
import { createEmptyTheme, migrateTheme, validateTheme } from '@stylemd/theme-schema'
import { getBuiltInTheme } from '@stylemd/presets'

describe('untrusted document and theme boundaries', () => {
  it('blocks executable links and unsafe image protocols, including reference syntax', () => {
    const { html, warnings } = renderBody(parseMarkdown('[bad](javascript:alert%281%29)\n\n![bad](file:///secret)\n\n[ref][x]\n\n[x]: javascript:alert%281%29').tree)
    expect(html).not.toMatch(/(?:href|src)="(?:javascript|file):/i)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('keeps a frontmatter title inside the stylesheet string', () => {
    const theme = getBuiltInTheme('tech-document')!
    const result = build('---\ntitle: </style><script>throw 1</script>\n---\ntext', theme)
    expect(result.html).not.toContain('<script>throw 1</script>')
    expect(result.html.match(/<\/style>/g)).toHaveLength(1)
  })

  it.each([
    { font: { sizePt: '12; color:red' } },
    { font: { family: [null] } },
    { font: { sizePt: Infinity } },
    { paragraph: { align: 'left; background:url(https://example.invalid)' } },
    { background: { color: '</style><script>throw 1</script>' } },
    { numbering: { pattern: 12 } },
    { border: { left: 'invalid' } },
  ])('rejects malformed style values without throwing in validation: %j', (patch) => {
    const raw = { ...createEmptyTheme(), styles: [{ role: 'body.text', ...patch }] }
    expect(validateTheme(raw as never).ok).toBe(false)
  })

  it('does not discard invalid style entries or invalid versions during migration', () => {
    expect(() => migrateTheme({ schemaVersion: -1, styles: [] })).toThrow()
    expect(() => migrateTheme({ styles: [null] })).toThrow()
  })
})

describe('Markdown fidelity', () => {
  it('assigns inline roles also inside table cells', () => {
    const result = build('**bold** *em* `code`\n\n| a |\n|---|\n| **bold** |', createEmptyTheme())
    expect(result.body.match(/data-role="inline-strong"/g)).toHaveLength(2)
    expect(result.body).toContain('data-role="inline-emphasis"')
    expect(result.body).toContain('data-role="code-inline"')
  })

  it('renders reference links, reference images, tasks and GFM column alignment', () => {
    const result = build('[link][x]\n\n![alt][img]\n\n[x]: https://example.com "Title"\n[img]: https://example.com/a.png\n\n- [x] done\n- [ ] todo\n\n| a | b |\n|:---|---:|\n| x | y |', createEmptyTheme())
    expect(result.body).toContain('href="https://example.com"')
    expect(result.body).toContain('src="https://example.com/a.png"')
    expect(result.body).toContain('type="checkbox" disabled checked')
    expect(result.body).toContain('text-align: right')
  })

  it('does not classify all subsequent prose as figure captions', () => {
    const result = build('![a](a.png)\n\n图 1 Caption\n\nNormal prose', createEmptyTheme())
    expect(result.body).toContain('<p data-role="body-text">Normal prose</p>')
  })

  it('preserves spaced directives inside code fences', () => {
    const result = build('```md\n::: abstract\ntext\n:::\n```', createEmptyTheme())
    expect(result.body).toContain('::: abstract')
  })

  it('honors zero paragraph spacing and landscape custom paper sizes', () => {
    const theme = createEmptyTheme()
    theme.document.page.size = { widthMm: 100, heightMm: 200 }
    theme.document.page.orientation = 'landscape'
    const css = compileCss(resolveStyles(theme))
    expect(css).toContain('size: 200mm 100mm')
    expect(css).toContain('margin-block-end: 0pt')
    expect(css).toContain('text-indent: 0em')
  })
})
