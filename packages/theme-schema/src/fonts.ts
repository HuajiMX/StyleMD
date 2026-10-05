/**
 * 字体槽位的公共判定。
 *
 * 模型里字体现分三个槽：`latinFamily`（拉丁字母与半角标点）、`cjkFamily`（中日韩字符与全角标点）、
 * `fallbackFamilies`（尾部回退）。把「哪些字体算中文字体」放在模型层是为了让
 * 迁移（旧回退链 → 三个槽）、编译（生成 @font-face 的 unicode-range）与界面共用同一份判断，
 * 而不是各写一套正则。这里只是名字表，不含任何 CSS。
 */

/**
 * 常见中文字体族名。判断「支持中文」没有可靠 API，只能靠名字认；
 * 认不出来就当西文字体，用户可以手动把任意字体填进中文槽。
 */
const CJK_FAMILY =
  /(SimSun|NSimSun|SimHei|KaiTi|FangSong|YouYuan|LiSu|MingLiU|PMingLiU|Microsoft (YaHei|JhengHei)|DengXian|Songti|Heiti|Kaiti|PingFang|Hiragino|STSong|STKaiti|STHeiti|STFangsong|STXihei|STXinwei|STXingkai|STZhongsong|STCaiyun|STHupo|STLiti|Yu Gothic|Yu Mincho|Meiryo|MS (Gothic|Mincho|PGothic|PMincho|UI Gothic)|Malgun Gothic|Gulim|Batang|Dotum|Source Han (Serif|Sans)|Noto (Serif|Sans|Sans Mono) (SC|TC|HK|JP|KR)|Noto (Serif|Sans) CJK|WenQuanYi|Sarasa|LXGW|FZ[A-Za-z-]*|YouSheBiaoTiHei|苹方|宋体|黑体|楷体|仿宋|微软雅黑|等线|思源|文泉驿|华文|方正|汉仪|站酷|幼圆|隶书)/i

/** CSS 通用族：它们不是「某个字体」，三个槽都不该收它们。 */
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

export function isGenericFamily(name: string): boolean {
  // 大小写敏感，跟 compile-css 判定通用族的规则保持一致：
  // 小写 `fangsong` 是 CSS 通用族，`FangSong` 是 Windows 上那个仿宋字体。
  return GENERIC_FAMILY.has(name.trim())
}

export function isCjkFamily(name: string): boolean {
  return !isGenericFamily(name) && CJK_FAMILY.test(name)
}

export interface FontSlotSpec {
  /** 西文字体；空串表示跟随中文字体 */
  latinFamily: string
  /** 中文字体；空串表示链里没有中文字体 */
  cjkFamily: string
  /** 其余回退，按原顺序 */
  fallbackFamilies: string[]
}

/**
 * 把一条旧的字体回退链折成三个槽。
 *
 * 规则与旧模型一致：第一个中文字体是中文槽，它前面第一个非中文字体是西文槽，
 * 其余原样进回退。`fontSlotsToChain` 折回去能得到原链，迁移因此不会改变渲染结果。
 */
export function fontSlotsFromChain(chain: string[]): FontSlotSpec {
  const cjkIndex = chain.findIndex(isCjkFamily)
  const latinIndex = chain.findIndex(
    (family, index) => (cjkIndex === -1 || index < cjkIndex) && !isCjkFamily(family) && !isGenericFamily(family),
  )

  const slotIndexes = new Set<number>()
  if (latinIndex !== -1) slotIndexes.add(latinIndex)
  if (cjkIndex !== -1) slotIndexes.add(cjkIndex)

  return {
    latinFamily: latinIndex === -1 ? '' : (chain[latinIndex] ?? ''),
    cjkFamily: cjkIndex === -1 ? '' : (chain[cjkIndex] ?? ''),
    fallbackFamilies: chain.filter((_, index) => !slotIndexes.has(index)),
  }
}

/** 三个槽折回一条链（编译时按这个顺序生成 font-family 与 @font-face）。 */
export function fontSlotsToChain(slots: FontSlotSpec): string[] {
  return [slots.latinFamily, slots.cjkFamily, ...slots.fallbackFamilies].filter((family) => family.length > 0)
}
