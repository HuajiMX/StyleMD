/**
 * 文档级操作：从正文里取标题、改标题、打开与保存文件。
 *
 * 浏览器里「保存文件」有两条路：
 *  1. File System Access API（Chromium）——拿到文件句柄后能真正写回**原文件**，「保存」与「另存为」才是两件事；
 *  2. 传统下载（`<a download>`）——Firefox / Safari 以及拿不到句柄时的兜底，每次都是另存一份副本。
 * M2 打包成桌面壳后换成宿主 API，这一层的接口可以照用。
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/
const MARKDOWN_TYPES = [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }]
const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024

/** File System Access API 的最小类型：lib.dom 里还没有 showSaveFilePicker 与 createWritable。 */
export interface FileWriteStream {
  write(data: string): Promise<void>
  close(): Promise<void>
}

export interface FileHandle {
  name: string
  createWritable(): Promise<FileWriteStream>
  getFile(): Promise<File>
}

interface PickerOptions {
  suggestedName?: string
  multiple?: boolean
  types?: { description: string; accept: Record<string, string[]> }[]
}

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FileHandle[]>
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileHandle>
}

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

function pickerWindow(): PickerWindow {
  return window as PickerWindow
}

/** 能不能真正写回文件（决定「保存」是写回原文件还是下载一份副本）。 */
export function canWriteFiles(): boolean {
  return typeof pickerWindow().showSaveFilePicker === 'function'
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

async function readMarkdown(file: File): Promise<string> {
  if (file.size > MAX_MARKDOWN_BYTES) throw new Error('Markdown 文件不能超过 5 MB')
  return file.text()
}

export interface OpenedFile {
  name: string
  text: string
  /** 走系统文件对话框时带回句柄，「保存」就能写回这个文件；用 `<input type=file>` 时是 null。 */
  handle: FileHandle | null
}

/**
 * 打开 Markdown：优先系统文件对话框（能拿到句柄），不支持或调用失败时退回 `<input type=file>`。
 * `pickWithInput` 由调用方提供（隐藏的文件选择框），返回 null 表示用户取消。
 */
export async function openMarkdownFile(pickWithInput: () => Promise<File | null>): Promise<OpenedFile | null> {
  const picker = pickerWindow().showOpenFilePicker
  if (typeof picker === 'function') {
    try {
      const [handle] = await picker.call(pickerWindow(), { multiple: false, types: MARKDOWN_TYPES })
      if (handle) return { name: handle.name, text: await readMarkdown(await handle.getFile()), handle }
    } catch (error) {
      // 用户取消就当没点过；其它失败（权限、浏览器限制）落回文件选择框。
      if (isAbort(error)) return null
    }
  }
  const file = await pickWithInput()
  return file ? { name: file.name, text: await readMarkdown(file), handle: null } : null
}

/** 写回已有句柄指向的文件。 */
export async function writeToHandle(handle: FileHandle, text: string): Promise<void> {
  const stream = await handle.createWritable()
  await stream.write(text)
  await stream.close()
}

export type SaveOutcome = 'written' | 'downloaded' | 'cancelled'

/**
 * 另存为：能写文件就弹系统对话框（句柄带回去供「保存」复用），否则退回下载。
 * 用户取消返回 `cancelled`，不当错误。
 */
export async function saveMarkdownAs(
  text: string,
  suggestedName: string,
): Promise<{ outcome: SaveOutcome; handle: FileHandle | null }> {
  const picker = pickerWindow().showSaveFilePicker
  if (typeof picker !== 'function') {
    downloadText(suggestedName, text)
    return { outcome: 'downloaded', handle: null }
  }
  try {
    const handle = await picker.call(pickerWindow(), { suggestedName, types: MARKDOWN_TYPES })
    await writeToHandle(handle, text)
    return { outcome: 'written', handle }
  } catch (error) {
    if (isAbort(error)) return { outcome: 'cancelled', handle: null }
    throw error
  }
}

/** 新建文档的骨架：能直接看出前置元数据和一级标题该怎么写。 */
export function blankDocument(date = new Date()): string {
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return ['---', 'title: 未命名文档', 'author: ', `date: ${stamp}`, '---', '', '# 一级标题', '', '正文段落。', ''].join('\n')
}
