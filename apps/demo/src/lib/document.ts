/** 文档级操作：从正文里取标题、改标题、以及把文本存成文件。 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/

export function documentTitle(markdown: string, fallback = '未命名文档'): string {
  const match = FRONTMATTER.exec(markdown)
  if (!match) return fallback
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const parsed = /^title\s*:\s*(.*)$/.exec(line.trim())
    if (parsed?.[1] !== undefined) return parsed[1].replace(/^["']|["']$/g, '').trim() || fallback
  }
  return fallback
}

/** 改写前置元数据里的 title；没有前置元数据就补一段。 */
export function withDocumentTitle(markdown: string, title: string): string {
  const match = FRONTMATTER.exec(markdown)
  if (!match) return `---\ntitle: ${title}\n---\n\n${markdown}`

  const lines = (match[1] ?? '').split(/\r?\n/)
  const index = lines.findIndex((line) => /^title\s*:/.test(line.trim()))
  if (index >= 0) lines[index] = `title: ${title}`
  else lines.unshift(`title: ${title}`)
  return markdown.replace(match[0], `---\n${lines.join('\n')}\n---`)
}

/** 文件名里不能出现的字符换成短横线，并补上 .md。 */
export function markdownFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]+/g, '-').trim() || '未命名文档'
  return safe.toLowerCase().endsWith('.md') ? safe : `${safe}.md`
}

export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/** 新建文档的骨架：能直接看出前置元数据和一级标题该怎么写。 */
export function blankDocument(date = new Date()): string {
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return ['---', 'title: 未命名文档', 'author: ', `date: ${stamp}`, '---', '', '# 一级标题', '', '正文段落。', ''].join('\n')
}
