# 字体：用 unicode-range 让中西文两个槽互不干扰（方案）

日期：2026-10-05 ｜ 状态：待实施 ｜ 关联：`docs/plans/2026-10-04-font-slots.md`、AGENTS.md 架构约束 2/3

## 要解决的问题

现在的模型是一条有序回退链（`FontSpec.family: string[]`），「西文槽 / 中文槽」是从链里**推导**出来的：
第一个非中文字体算西文、第一个中文字体算中文。于是「西文用宋体、中文用微软雅黑」这种组合存不下——
宋体自带中文字形，排到链的最前面会把中文一起接管，用户看到的就是「选了西文却改了中文」。
目前只能在界面上把中文字体从西文候选里过滤掉规避（见 font-slots 记录），但这是权宜之计：
中文字体内部本来就带西文字形，西文槽允许放中文字体是合理需求。

## 实测结论（headless Chromium，本机装了这些字体）

`@font-face` 的 `src: local(...)` 引用本机字体不需要打包字体文件，配 `unicode-range` 可以按字符区段分派：

| 写法 | `A` 宽度 | `中` 宽度 |
|:---|:---|:---|
| 参照：Times New Roman / 宋体 | 46.22 / 32 | 64 |
| `unicode-range`：拉丁段 → Times、中日韩段 → 宋体 | 46.22 ✓ | 64 ✓ |
| `unicode-range`：拉丁段 → 黑体、中日韩段 → 宋体 | 32 ✓ | 64 ✓ |
| 普通链 `Times New Roman, SimSun` | 46.22 ✓ | 64 ✓ |
| 普通链 `SimSun, Times New Roman` | 32 ✗（被宋体接管） | 64 |

两条要点：

1. 常规混排（拉丁字体 + 中文字体）**普通回退链已经等价**于 unicode-range，不必改。
2. unicode-range 真正多出来的是「两个槽与字形覆盖解耦」——西文槽可以放中文字体，
   以及把标点归属变成显式规则（现在是谁排前面谁说了算）。

## 模型改动

把「从链里推导」换成显式字段：

```ts
interface FontSpec {
  /** 西文字体；缺省 = 跟随中文字体 */
  latinFamily?: string
  /** 中文字体 */
  cjkFamily?: string
  /** 尾部回退（serif / sans-serif 等） */
  fallbackFamilies?: string[]
}
```

- `schemaVersion` +1，`migrate.ts` 加一步：旧链 → 三个字段（`cjkFamily` = 首个中文字体，
  `latinFamily` = 它前面那个非中文字体，其余进 `fallbackFamilies`），迁移后渲染结果不变。
  样式包、会话存档、导出的 `.stylemd.json` 都走同一条迁移。
- 中文字体判定（现在是 `apps/demo/src/lib/fontChain.ts` 的正则表）要挪到 `theme-schema`，
  让迁移、编译、界面共用一份——模型层只是数据表，不违反「不得出现 CSS 字符串」。

## 编译改动（core）

每个用到的 `(latinFamily, cjkFamily)` 组合生成一对规则，再让角色引用生成名：

```css
@font-face { font-family: "StyleMD heading-1 latin"; src: local("Arial"); unicode-range: <拉丁段> }
@font-face { font-family: "StyleMD heading-1 latin"; src: local("SimSun"); unicode-range: <中日韩段> }
[data-role="heading-1"] { font-family: "StyleMD heading-1 latin", serif; }
```

- 区段草案：拉丁段 `U+0000-024F`、`U+1E00-1EFF`、`U+2000-206F`、`U+20A0-20CF`、`U+2100-214F`；
  中日韩段 `U+2E80-303F`、`U+3040-30FF`、`U+31C0-31EF`、`U+3400-4DBF`、`U+4E00-9FFF`、
  `U+F900-FAFF`、`U+FF00-FFEF`、`U+AC00-D7AF`。`——`(U+2014) 与 `……`(U+2026) 按 Word 的习惯归中文字体。
- 字体没装时该 `@font-face` 整体失效，浏览器落到 `font-family` 列表里的下一个家族——与现在行为一致。

## 界面改动（apps/demo）

- 西文候选**解除**「不列中文字体」的过滤，两个槽都能选任意字体。
- 样式窗口里那句「西文一栏只列拉丁字体……」的说明改写成新语义：西文只管拉丁字母与半角标点，
  中日韩字符与全角标点走中文那一项。
- 回退链进阶项改为编辑 `fallbackFamilies`（其余回退），不再是整条链。

## 风险

- `src: local()` 在 Firefox / Safari 上的家族名匹配历来有差异（Safari 有时要 PostScript 名），
  web 版要单独验一遍；Chromium 已验。
- 导出产物每个角色多两条 `@font-face`，体积略增（几十到几百字节级别）。
- 迁移必须做到渲染结果不变，否则用户已存的文档会莫名变样——theme-schema 的迁移单测要覆盖默认栈、
  纯等宽栈（没有中文字体）与自定义链三种情况。
