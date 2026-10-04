# 数学公式渲染实施记录

日期：2026-10-03 ｜ 关联约束：规划 §7「预览与导出共用同一份产物」、§12 风险清单、AGENTS.md 架构约束 5

## 目标

Markdown 里的行内公式 `$...$` 与行间公式 `$$...$$` 在**预览**和**导出**里都排成真正的数学排版，且来自同一份 `build()` 产物；公式的字号、配色、间距、对齐跟其它结构角色一样，在样式窗口里可调。

## 决策与取舍

| 待定项 | 选择 | 理由 |
|:---|:---|:---|
| 语法解析 | `remark-math` 接进既有 unified 链 | 与 `remark-parse/gfm/directive` 同一条 micromark 管线，产出 `inlineMath` / `math` 节点，围栏代码块里的 `$` 不受影响 |
| 分隔符语义 | `$...$` 行内，`$$...$$` **一律行间** | micromark 只把「`$$` 单独起行 + 单独收尾」认成行间公式，单行 `$$E=mc^2$$` 会退化成行内；Pandoc / MathJax / KaTeX auto-render / Typora 都按行间处理，用户也是这个直觉。解析后统一提升，段落里夹着 `$$` 时按 Pandoc 的做法切成「文字 → 公式块 → 文字」 |
| 排版引擎 | KaTeX `renderToString`（纯字符串进、字符串出） | 不需要 DOM，落在 `core` 里不违反「不依赖 UI 与宿主」；输出自带 MathML 注解，公式可复制、可读屏 |
| 字体与样式 | KaTeX CSS + 20 个 woff2 **内联成 data URI**，随 `build()` 产物进 `<head>` | 预览是 `srcdoc`（没有自己的文档地址），离线导出的 HTML 也会被搬到任意目录；相对路径和 CDN 都会 404 |
| 角色模型 | 新增 `公式` 类别与 `math.inline` / `math.block` | 复用现有角色 → 样式 → CSS 链路，样式窗口与画廊自动出现这两张卡片，无需改 UI |
| 行内公式字号 | 不在主题里声明字号 | 行内角色只输出显式声明过的字体属性，公式随所在段落缩放；数学字体由 KaTeX 自己管 |
| 行间公式居中 | 做成**角色自带兜底**（`RoleDefinition.defaults`），不是主题的义务 | 行间公式居中是这个角色的语义，不该依赖每个样式包都记得声明；老样式包（还没有 `math.block` 这一项）也不会排版歪，主题显式声明对齐后仍以主题为准 |
| 行间公式断页 | `break-inside: avoid` | 行间公式是块级内容，断页控制和图片同类 |
| 对齐归属 | `.katex-display` 的 `text-align` 用 `inherit`，交还给角色样式 | KaTeX 自己把 display 写死居中：不还回来的话，主题改成左对齐时对话框预览与产物会各说各话 |

### 为什么不用原生 MathML / Temml

Chromium 能渲染 MathML，但要用到哪个数学字体取决于系统；Windows 上不保证有可用的数学字体，打印结果不稳定。KaTeX 自带可再分发字体（OFL，Computer Modern 系），离线与打印结果一致，代价是产物变大——见下。

## 产物体积与边界

- KaTeX 样式 + 内联字体合计 **约 361 KB**（20 个 woff2，原始 254 KB）。它放在 `packages/core/src/render/math-css.generated.ts`，由 `npm.cmd run build:math-css` 从 `node_modules/katex/dist` 生成，升级 katex 后必须重跑（单测会核对版本号）。
- **只在文档里出现公式时才注入** `<style>`：`hasMath` 由渲染过程记录，非公式文档的 HTML 与改动前逐字节一致。
- demo 主包因此增加约 640 KB（gzip 后约 150 KB），换来预览与导出共用同一份自包含产物；这是有意的取舍，不是漏优化。
- 该文件在 `.gitattributes` 里标记为 `-diff linguist-generated`，避免 300+ KB 单行 base64 污染代码评审。

## 代码落点

| 位置 | 改动 |
|:---|:---|
| `packages/core/src/parse/markdown.ts` | unified 链加 `remark-math`；`promoteDisplayMath` 把 `$$` 公式统一提升成块级节点并切分段落 |
| `packages/theme-schema/src/roles.ts` | `公式` 类别、`math.inline` / `math.block` 角色、导出 `isInlineRole` |
| `packages/core/src/roles/annotate.ts` | `inlineMath` → `math.inline`，`math` → `math.block` |
| `packages/core/src/render/math.ts` | KaTeX 封装 + `MATH_BASE_CSS`；失败降级为 `<code class="stylemd-math-error">` 并回传警告 |
| `packages/core/src/render/html.ts` | 渲染两个节点类型；有公式时把 KaTeX 样式注入 `<head>`（沿用 `</style>` 转义规则） |
| `packages/core/src/render/math-css.generated.ts` | 生成物：KaTeX CSS + 内联 woff2 |
| `scripts/build-math-css.mjs` | 生成脚本（`npm.cmd run build:math-css`） |
| `packages/core/src/style/compile-css.ts` | 行内角色判定改用 `isInlineRole`；无可写声明时不再输出空规则 |
| `packages/theme-schema/src/roles.ts` | `RoleDefinition.defaults`：角色自带兜底样式，`math.block` 用它声明「默认居中」；样例改用 `String.raw` 保住 TeX 反斜杠 |
| `packages/core/src/style/resolve.ts` | 把角色兜底夹在「文档默认值」与「主题声明」之间合并 |
| `packages/presets/src/index.ts` | 两个内置样式包给 `math.block` 补居中与段间距 |
| `apps/demo/src/lib/inlineStyle.ts` | 画廊样本带上角色的对齐，行间公式卡片才看得出「居中」这个特征 |
| `apps/demo/src/components/MathSample.tsx` | 公式角色的样例用 KaTeX 真渲染（画廊卡片与样式窗口预览共用） |
| `apps/demo/src/main.tsx` | 工作台宿主页面注入 `MATH_BASE_CSS + KATEX_CSS`，样例才有字体与排版 |
| `examples/sample-thesis.md` | 「代码与公式」章节补行内公式、行间公式与 `\tag` 编号 |
| `packages/core/test/math.test.ts` | 解析、角色、渲染、降级、样式注入、转义与生成物新鲜度 |
| `e2e/smoke.mjs` | 预览里真的排版、字体内联生效、行间公式居中且不跨页、`\tag` 编号 |
| `packages/renderer-paged/src/index.ts` | 顺带修掉的分页竞态，见下 |

## 顺带修掉的既有问题

### 1. 行间公式的居中原本要靠每个样式包自己声明

第一版把「居中」写在内置样式包的 `math.block` 里。后果是：主题只要没声明这个角色（例如改动前存下的会话样式包），`resolveStyles` 就会按文档默认值给出 `text-align: left`——虽然 KaTeX 的 `.katex-display` 恰好也写了居中，肉眼看不出来，但样式窗口显示「左对齐」、产物和声明对不上。

现在「行间公式默认居中」是角色注册表里的兜底（`RoleDefinition.defaults`），主题一声明就被盖过。对应的，`.katex-display` 的对齐改成 `inherit`，谁说了算只有一处：角色样式。

顺带修了那条断言：原先的「居中」测量把整宽的外层 `div` 也算进范围，等于恒真；现在只量 `.katex-base` 组成的公式本体，位置真的歪了才会红。

### 2. 样例 TeX 的反斜杠被字符串转义吃掉

`sample: '$$\int_0^1 x^2 \,\mathrm{d}x = \frac{1}{3}$$'` 里 `\i`、`\,` 会被解释成转义序列，`\f` 更是直接变成换页符——画廊卡片与样式窗口的预览显示成 `$$int_0^1 x^2 ,mathrm{d}x = frac{1}{3}$$`。改用 `String.raw`，并加了单测盯住。

顺带把画廊样本的对齐带上（`specimenStyle` 原先只带字体，不带段落对齐），「行间公式」卡片现在会按角色居中显示。

### 2.1 公式样例只是纯文本，没渲染

改完转义之后，卡片上确实能看到完整的 `\int_0^1 …` 了，但那仍然是**当文字摆出来的**：`$$` 和反斜杠都在，看不出居中、也看不出字号，还容易被误读成「公式坏了」。

现在 `RoleDefinition` 多一个 `sampleKind: 'inline-math' | 'display-math'`，公式角色的 `sample` 存纯 TeX（不带 `$$` 分隔符）。工作台用 `MathSample` 组件调 `renderMath` 真渲染，画廊卡片与样式窗口预览共用同一个组件；卡片上仍套 `specimenStyle`（字号、颜色、对齐），所以换主题时样例跟着变。宿主页面自己也要有 KaTeX 样式，`main.tsx` 里把 `MATH_BASE_CSS + KATEX_CSS` 注入一次（预览 iframe 用的是 `build()` 产物里那一份，两边互不影响）。

### 3. 单行 `$$...$$` 被当成行内公式

第一版只接 `remark-math`，于是「`$$` 自己占两行」才是行间公式；写成单行 `$$U_i = S - c \cdot a_i$$`（最常见、也是论文里的写法）会落到 `inlineMath`，既不居中、也不吃 `math.block` 的样式，`\tag` 还会因为不在 display 模式而报错。

现在解析后统一提升：段落里任何 `$$` 公式都变成块级 `math` 节点，夹在文字中间时按 Pandoc 的做法把段落切成「文字 → 公式块 → 文字」。行内公式只认 `$...$`。示例文档里那条 `\tag` 公式特意改写成单行，e2e 的「`\tag` 编号」断言顺带成了这条语义的守卫（`\tag` 只在 display 模式有效，退化就会变成错误回退、断言即红）。

### 4. iframe 首帧量不到页面宽度

示例文档补上公式后，表格被推到跨页，`e2e` 的「跨页表格分片列宽一致、行不越页且没有孤行表头」立刻变红：续页分片既没有补表头，列宽也和首页对不上。

排查结论不是公式本身：宿主（React）刚挂上预览 iframe 时，`load` 里 `pageContentWidth()` 探针量出来是 **0**（此时 iframe 还没有布局视口），而 `stabilizeTableLayouts()` 是「量不到宽度就 return」。于是列宽没定死、`data-stylemd-table` 没写、续页补表头的钩子全部空转——表格此前没跨页，所以这个坑一直没被踩到。

修法是在 `pageContentWidth()` 之后加一个等待循环：只有「变量存在但暂时量不出宽度」才按帧重试（最多 60 帧），变量本身不存在（`includePage: false` 的文档）直接返回，不引入无谓延迟。

## 安全与降级

- KaTeX 以 `trust: false` 渲染，`\href` / `\htmlClass` 这类可注入标记的宏不可用；`\includegraphics` 同样被挡住。
- `strict: 'ignore'` 让冷门写法不往控制台刷警告；真实语法错误走 `throwOnError`，只把**这一段**降级成红字原文并在 `warnings` 里给出原因，不打断整篇渲染。
- 输出经过 KaTeX 自身转义（`a<b` → `a&lt;b`，连 MathML 注解一起），注入进不来。
- 围栏代码块与行内代码中的 `$` 仍是代码：`remark-math` 不解析代码区，`normalizeDirectiveSyntax` 也照旧保护代码行。

## 未做

- 编辑器里对 `$...$` 的语法高亮（CodeMirror 的 markdown 语言包不认公式，需要自写 lezer 扩展）。
- 公式自动编号与交叉引用——现阶段用 KaTeX 的 `\tag{1-1}` 手工编号。
- 非 HTML 后端（DOCX / Typst）的公式输出。

## 验证证据

本机 Windows + Node v24.11.1 实际执行：

| 命令 | 结果 |
|:---|:---|
| `npm.cmd test` | 14 个文件 / 128 个用例通过（新增 `math.test.ts` 17 个） |
| `npm.cmd run typecheck` | 通过 |
| `npm.cmd run build` | 构建通过（仅剩既有的 chunk > 500 KB 提示） |
| `node e2e/smoke.mjs` | 75/75 通过，含 6 项公式断言：`1 个行内 / 2 个行间，3 条 TeX 注解`、`document.fonts.check(KaTeX_Main) = true`、`行内 display=inline，行间 break-inside=avoid，居中=true，同页=true`、`1 个公式编号`、`样式画廊的行间公式样例真渲染成公式并居中`（溢出 1px）、`样式窗口的预览里公式同样是渲染出来的`；跨页表格分片的列宽一致性同时转绿 |
| `npm.cmd run cli -- render examples/sample-thesis.md --theme thesis-cn --out e2e/artifacts/sample-math.html` | 生成 386 KB 自包含 HTML；角色统计含 `math.block×2, math.inline×1` |

视觉核对：`e2e/artifacts/math-shot.png`（行内 `E = mc^2` 与正文同排、行间 `∫₀¹x²dx = 1/3` 居中）与 `e2e/artifacts/math-shot-block.png`（`\tag{1-1}` 编号贴右、公式主体仍居中）。
