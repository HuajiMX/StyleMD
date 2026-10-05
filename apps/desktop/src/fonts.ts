import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

let cachedAliases: Promise<Record<string, string>> | undefined

/**
 * 英文家族名 → 本地化（中文）名。
 *
 * 字体**列表**不由这里提供：渲染进程的 `queryLocalFonts()` 拿到的就是系统的完整名册
 * （Windows 上底层是 DirectWrite），而且给出的名字正是排版时会去匹配的那一套。
 * 它缺的只有名字——SimSun 中文叫「宋体」、SimHei 叫「黑体」、STCaiyun 叫「华文彩云」，
 * 这些只写在字体文件的 `name` 表里，只能问 DirectWrite 要（这里借 Windows 自带的
 * WPF 字体集合读，见 `FamilyNames`）。
 *
 * 非 Windows、或 PowerShell 被策略挡住时返回空表，界面照旧显示英文名。
 * 这份集合包含用户级安装的字体（`FangSong_GB2312` → 仿宋_GB2312 就是这么来的），
 * 因为 `queryLocalFonts` 只给英文家族名，中文名才需要单独补。
 */
export function listFontAliases(): Promise<Record<string, string>> {
  cachedAliases ??= readAliases().catch(() => ({}))
  return cachedAliases
}

async function readAliases(): Promise<Record<string, string>> {
  if (process.platform !== 'win32') return {}
  // 脚本里只用单引号：它作为单个参数穿过 cmd / powershell 的引号规则，
  // 混进双引号就容易被拆坏（宁可啰嗦也别在这里炫技巧）
  const script = [
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
    'Add-Type -AssemblyName PresentationCore',
    "$lang=[System.Windows.Markup.XmlLanguage]::GetLanguage('zh-CN')",
    'foreach($f in [Windows.Media.Fonts]::SystemFontFamilies){$n=$f.FamilyNames[$lang];if($n -and $n -ne $f.Source){$f.Source+[char]9+$n}}',
  ].join(';')
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    maxBuffer: 8 * 1024 * 1024,
  })

  const aliases: Record<string, string> = {}
  for (const line of stdout.split(/\r?\n/)) {
    const [family, localized] = line.split('\t')
    if (family && localized) aliases[family.trim()] = localized.trim()
  }
  return aliases
}
