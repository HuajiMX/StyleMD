#!/usr/bin/env node
/**
 * StyleMD 命令行接口。
 *
 * 存在的意义不只是"顺手加个 CLI"：它证明了核心库确实与宿主无关——
 * 同一份 build() 在无 GUI、无 Electron 的环境里照样能产出可打印的 HTML。
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { build } from '@stylemd/core'
import { BUILT_IN_THEMES, getBuiltInTheme } from '@stylemd/presets'
import { injectHeadStyle, injectPagedPolyfill, PREVIEW_CHROME_CSS, PRINT_TOOLBAR_HTML } from '@stylemd/renderer-paged'
import { migrateTheme, validateTheme, type StyleTheme } from '@stylemd/theme-schema'

interface ParsedArgs {
  command: string
  positional: string[]
  flags: Map<string, string | boolean>
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv
  const positional: string[] = []
  const flags = new Map<string, string | boolean>()
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] ?? ''
    if (token.startsWith('--')) {
      const [name, inlineValue] = token.slice(2).split('=')
      if (inlineValue !== undefined) {
        flags.set(name ?? '', inlineValue)
      } else {
        const next = rest[index + 1]
        if (next && !next.startsWith('--')) {
          flags.set(name ?? '', next)
          index += 1
        } else {
          flags.set(name ?? '', true)
        }
      }
    } else {
      positional.push(token)
    }
  }
  return { command, positional, flags }
}

function readTheme(specifier: string | undefined): StyleTheme {
  if (!specifier) {
    const fallback = getBuiltInTheme('tech-document')
    if (!fallback) throw new Error('内置样式包缺失')
    return fallback
  }
  const preset = getBuiltInTheme(specifier)
  if (preset) return preset

  const path = resolve(specifier)
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
  const { theme, notes } = migrateTheme(raw)
  for (const note of notes) console.warn(`[样式包] ${note}`)
  const result = validateTheme(theme)
  for (const warning of result.warnings) console.warn(`[警告] ${warning}`)
  if (!result.ok) {
    throw new Error(`样式包校验失败：\n  - ${result.errors.join('\n  - ')}`)
  }
  return theme
}

function loadPagedPolyfill(): string | undefined {
  try {
    const require = createRequire(import.meta.url)
    let directory = dirname(require.resolve('pagedjs'))
    for (let depth = 0; depth < 6; depth += 1) {
      const candidate = join(directory, 'dist', 'paged.polyfill.js')
      if (existsSync(candidate)) return readFileSync(candidate, 'utf8')
      directory = dirname(directory)
    }
    return undefined
  } catch {
    return undefined
  }
}

function commandRender(parsed: ParsedArgs): number {
  const input = parsed.positional[0]
  if (!input) {
    console.error('用法：stylemd render <input.md> [--theme <样式包.json|预设id>] [--out <输出.html>] [--paged] [--no-furniture]')
    return 1
  }
  const markdown = readFileSync(resolve(input), 'utf8')
  const theme = readTheme(parsed.flags.get('theme') as string | undefined)
  const usePaged = parsed.flags.get('paged') === true
  const noFurniture = parsed.flags.get('no-furniture') === true
  const effectiveTheme = noFurniture
    ? { ...theme, document: { ...theme.document, page: { ...theme.document.page, header: undefined, footer: undefined } } }
    : theme

  const result = build(markdown, effectiveTheme, { includePage: true })
  let html = result.html
  html = injectHeadStyle(html, PREVIEW_CHROME_CSS)
  html = html.replace('</body>', `${PRINT_TOOLBAR_HTML}\n</body>`)

  if (usePaged) {
    const polyfill = loadPagedPolyfill()
    if (polyfill) {
      html = injectPagedPolyfill(html, polyfill)
    } else {
      console.warn('[警告] 未找到 pagedjs/dist/paged.polyfill.js，已输出原生分页版本')
    }
  }

  const out = (parsed.flags.get('out') as string | undefined) ?? `${basename(input).replace(/\.[^.]+$/, '')}.html`
  writeFileSync(resolve(out), html, 'utf8')

  const roleSummary = Object.entries(result.stats.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => `${role}×${count}`)
    .join(', ')
  console.log(`已生成 ${out}`)
  console.log(`样式包：${theme.name}（${theme.id}）`)
  console.log(`分页方式：${usePaged ? 'Paged.js 内联' : '浏览器原生分页'}`)
  console.log(`角色统计：${roleSummary}`)
  for (const warning of result.warnings) console.warn(`[警告] ${warning}`)
  return 0
}

function commandThemes(): number {
  console.log('内置样式包：')
  for (const theme of BUILT_IN_THEMES) {
    console.log(`  ${theme.id.padEnd(16)} ${theme.name} — ${theme.description ?? ''}`)
  }
  return 0
}

function commandCheck(parsed: ParsedArgs): number {
  const target = parsed.positional[0]
  if (!target) {
    console.error('用法：stylemd check <样式包.json>')
    return 1
  }
  const { theme, notes } = migrateTheme(JSON.parse(readFileSync(resolve(target), 'utf8')) as unknown)
  const result = validateTheme(theme)
  for (const note of notes) console.log(`[迁移] ${note}`)
  for (const warning of result.warnings) console.warn(`[警告] ${warning}`)
  for (const error of result.errors) console.error(`[错误] ${error}`)
  console.log(result.ok ? '样式包校验通过' : `样式包校验失败（${result.errors.length} 个错误）`)
  return result.ok ? 0 : 1
}

function commandHelp(): number {
  console.log(`StyleMD CLI（原型）

  stylemd render <input.md> [--theme <样式包.json|预设id>] [--out <输出.html>] [--paged]
      把 Markdown 按样式包渲染成自带样式的 HTML；--paged 会内联 Paged.js 做真实分页

  stylemd themes
      列出内置样式包

  stylemd check <样式包.json>
      校验样式包并给出可读的报错
`)
  return 0
}

function main(): number {
  const parsed = parseArgs(process.argv.slice(2))
  switch (parsed.command) {
    case 'render':
      return commandRender(parsed)
    case 'themes':
      return commandThemes()
    case 'check':
      return commandCheck(parsed)
    default:
      return commandHelp()
  }
}

try {
  process.exitCode = main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
