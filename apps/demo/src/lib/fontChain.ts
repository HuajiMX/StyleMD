/**
 * 「中文字体 / 西文字体」两个槽位与 CSS 回退链之间的换算。
 *
 * 数据模型里存的仍然是一条有序回退链（`FontSpec.family: string[]`），
 * 这里负责把它呈现成 Word 那样的两个槽——**西文写在前面，中文跟在后面**，
 * 这正是 CSS 表达「西文用 A、中文用 B」的唯一办法（逐字符按顺序尝试）。
 *
 * 不在 schema 里加两个字段：一条链本身就够表达两个槽，改结构要动
 * `schemaVersion` 与迁移，收益不成比例。
 */

/**
 * 常见中文字体族名。判断「支持中文」没有可靠 API，只能靠名字认；
 * 认不出来就当西文字体，用户可以手动把任意字体填进中文槽。
 */
const CJK_FAMILY =
  /(SimSun|NSimSun|SimHei|KaiTi|FangSong|YouYuan|LiSu|MingLiU|PMingLiU|Microsoft (YaHei|JhengHei)|DengXian|Songti|Heiti|Kaiti|PingFang|Hiragino|STSong|STKaiti|STHeiti|STFangsong|Yu Gothic|Yu Mincho|Meiryo|MS (Gothic|Mincho|PGothic|PMincho|UI Gothic)|Malgun Gothic|Gulim|Batang|Dotum|Source Han (Serif|Sans)|Noto (Serif|Sans|Sans Mono) (SC|TC|HK|JP|KR)|Noto (Serif|Sans) CJK|WenQuanYi|Sarasa|LXGW|苹方|宋体|黑体|楷体|仿宋|微软雅黑|等线|思源|文泉驿|华文|方正|汉仪|站酷)/i

/** CSS 通用族：它们不是「某个字体」，两个槽位都不该收它们。 */
const GENERIC_FAMILY = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'emoji',
  'math',
  'fangsong',
])

/** 西文槽用这个文案表示「跟随中文字体」，也就是链里不写单独的西文家族。 */
export const FOLLOW_CJK_LABEL = '使用中文字体'

export interface FontSlots {
  /** 西文字体；空串表示「使用中文字体」 */
  western: string
  /** 中文字体；空串表示链里没有任何中文字体 */
  cjk: string
}

export function isGenericFamily(name: string): boolean {
  // 大小写敏感，跟 compile-css 判定通用族的规则保持一致：
  // 小写 `fangsong` 是 CSS 通用族，`FangSong` 是 Windows 上那个仿宋字体。
  return GENERIC_FAMILY.has(name.trim())
}

export function isCjkFamily(name: string): boolean {
  return !isGenericFamily(name) && CJK_FAMILY.test(name)
}

/**
 * 功能区那个字体框显示什么：优先中文字体；链里没有中文字体时退回主字体
 * （代码类角色整条链都是等宽西文，不能显示成空框）。
 */
export function ribbonFontValue(chain: string[]): string {
  const slots = readFontSlots(chain)
  return slots.cjk || slots.western || chain[0] || ''
}

/**
 * 从链里读出两个槽。只在「第一个中文字体之前」找西文家族：
 * 排在中文后面的西文家族是中文缺失时的兜底，不算西文槽，
 * 否则默认主题里那条 `..., "Times New Roman", serif` 会被误读成显式设了西文。
 */
export function readFontSlots(chain: string[]): FontSlots {
  const cjkIndex = chain.findIndex(isCjkFamily)
  const beforeCjk = cjkIndex === -1 ? chain : chain.slice(0, cjkIndex)
  const western = beforeCjk.find((family) => !isCjkFamily(family) && !isGenericFamily(family)) ?? ''
  const cjk = cjkIndex === -1 ? '' : (chain[cjkIndex] ?? '')
  return { western, cjk }
}

/**
 * 设置西文槽；`western` 传空串表示回到「使用中文字体」。
 *
 * 中文字体传进来会按「使用中文字体」处理：CSS 里排在最前面的字体对每个字符都先试一遍，
 * 而中文字体自带中文字形，把它放到西文位置等于连中文一起接管——「西文用宋体、中文用微软雅黑」
 * 这种组合 CSS 根本表达不了。想中英文都用同一种，把它设到中文字体即可。
 */
export function writeFontWestern(chain: string[], western: string): string[] {
  const current = readFontSlots(chain).western
  const rest = current ? chain.filter((family) => family !== current) : [...chain]
  if (!western || isCjkFamily(western)) return rest
  // 插在第一个中文字体之前；整条链没有中文字体时就放最前面
  const cjkIndex = rest.findIndex(isCjkFamily)
  const at = cjkIndex === -1 ? 0 : cjkIndex
  return [...rest.slice(0, at), western, ...rest.slice(at)]
}

/** 设置中文槽；链里原本没有中文字体时，插在西文槽之后。 */
export function writeFontCjk(chain: string[], cjk: string): string[] {
  const current = readFontSlots(chain).cjk
  const next = [...chain]

  if (!current) {
    if (!cjk) return next
    const western = readFontSlots(chain).western
    const westernIndex = western ? chain.indexOf(western) : -1
    const at = westernIndex === -1 ? 0 : westernIndex + 1
    return [...next.slice(0, at), cjk, ...next.slice(at)]
  }

  const index = next.indexOf(current)
  if (cjk) next[index] = cjk
  else next.splice(index, 1)
  return next
}
