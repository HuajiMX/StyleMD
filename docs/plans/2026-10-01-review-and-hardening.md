# StyleMD 全仓库审查与加固报告

日期：2026-10-01 ｜ 审查对象：`packages/*`、`apps/demo`、`apps/cli`、`e2e`、根配置与文档

方法：静态代码审查 + 威胁模型推演 + 边界用例复现（先写失败测试再修）+ 单元 / 类型 / 构建 / 浏览器 / PDF 导出实测 + `npm audit`。

## 威胁模型（审查时的假设）

- 入口：用户粘贴或打开任意 Markdown；导入任意 `*.stylemd.json` 样式包；CLI 读取任意文件路径。
- 信任边界：文档与样式包都视为不可信输入；渲染出的 HTML 进 `<style>`、iframe 预览与后续打印流程。
- 资产：本机文件、编辑器会话、导出 PDF 的内容完整性；本机开发环境（依赖链）。
- 攻击者目标：通过文档或样式包在预览/导出环境中执行脚本、读取本机文件、破坏渲染完整性。

## 结论

加固后判定为**可运行的原型通过本轮审查**：核心链路（解析 → 角色化 → 样式解析 → HTML/CSS → 分页预览 → PDF 导出）实测可用，输入边界、预览隔离与依赖链问题已修复并通过回归测试。架构三条硬约束保持成立，未发现需要重构才能继续演进的阻塞问题。

## 已修复问题

### 安全

1. **预览缺少隔离（High）**：iframe 原先与编辑器同源且无沙箱，文档里的脚本可以触达宿主页面。现在预览 iframe 加了 `sandbox="allow-scripts allow-modals"`，并注入 CSP 限制脚本、样式、图片与表单来源；文档内链接点击被拦截，避免预览页跳走。见 `apps/demo/src/App.tsx`、`apps/demo/src/components/PreviewPane.tsx`。
2. **链接与图片协议未过滤（High）**：`[x](javascript:…)` 会原样进入 `href`，点击即可在当前页执行；`file:` / `data:` 图片扩大本机探测面。现在链接只允许 `http/https/mailto/tel` 与相对路径，图片只允许 `http/https/data:image(png|jpeg|gif|webp)` 与相对路径，其余丢弃并写入警告。见 `packages/core/src/render/html.ts`。
3. **样式包可注入 CSS 与标记（High）**：颜色、字体族、编号模板、对齐等字符串原先直接拼进 `<style>`，`</style><script>…</script>` 可逃逸出样式块。现在所有已知字段走严格形状校验（类型、枚举、非负/正有限数、颜色语法白名单），CSS 字符串统一转义，`<`、`>`、控制字符在写回样式块前再兜底转义。见 [shape.ts](../../packages/theme-schema/src/shape.ts)、[validate.ts](../../packages/theme-schema/src/validate.ts)、[compile-css.ts](../../packages/core/src/style/compile-css.ts)。
4. **校验会被畸形类型绕过（High）**：`font.sizePt: "12; color:red"`、`font.family: [null]`、`border: "invalid"` 等原先通过校验或在校验中抛异常。现在统一返回可读错误；`validateTheme` 不再因输入不是对象而崩溃。
5. **迁移会静默丢弃非法样式（Medium）**：`migrateTheme` 原先 `filter(isPlainObject)` 丢掉非法条目，用户会以为导入成功但少样式。现在非法条目直接报错；`schemaVersion` 必须是正整数，缺失的 `document.page.marginMm`、`defaults.lineHeight` 按字段补齐而不是整块替换。
6. **原型污染面（Low）**：`styles` 用普通对象建索引，`__proto__` / `constructor` 这类角色 id 有污染风险。角色 id 现在限制为小写字母、数字、点号、短横线，渲染与样式索引改用无原型字典；frontmatter 也改用无原型对象。
7. **导入缺少体积上限（Low）**：样式包与 Markdown 导入各加 2 MB / 5 MB 上限，超限给出可读报错而不是卡死页面。
8. **依赖链漏洞（High，仅开发环境）**：`npm audit` 原先报告 Vitest（critical）、Vite（high）、esbuild（moderate）。升级 Vitest 5.0.3、Vite 8.3.2、`@vitejs/plugin-react` 6.1.1 并 `npm audit fix` 后为 **0 个已知漏洞**。

### 正确性与功能

1. **引用式链接/图片完全丢失**：`[文本][x]` 与 `![图][img]` 渲染成纯文本。现在解析定义表并在渲染期展开，引用式图片同时参与图题识别。
2. **GFM 表格列对齐失效**：`align` 实际挂在 `tableRow` 上，渲染却在单元格上取值，导致 `:---:` 全部丢失。改为按列索引取对齐。
3. **行内角色没有标注**：`**加粗**`、`*斜体*`、行内代码、链接、图片原先没有 `data-role`，样式面板里的行内样式形同虚设；表格内部因为遍历时跳过了 `table` 更加明显。现在补齐行内角色并恢复表格内遍历。
4. **图题识别级联**：`previousRole === 'figure.caption'` 会让图片后的所有后续段落一直被判为图题。现在只认「紧跟前一段是图片」。
5. **行内样式继承了整段落样式**：`inline.emphasis` 只声明了斜体，却会继承正文的字体、字号、颜色、行距等一大串声明。现在只输出该角色显式声明过的字体属性。
6. **代码块内的 `::: name` 被改写**：空白规范化原先按行正则处理，会改动代码示例。现在先解析出代码区间再跳过。
7. **BOM 与缩进 frontmatter**：UTF-8 BOM 会让前置元数据失效；缩进行被误判为字段。均已处理。
8. **自定义纸张横向尺寸不对**：`PageSetup.size` 用对象表达时未按 orientation 交换宽高。
9. **0 值被静默丢弃**：`spaceBeforePt: 0`、`firstLineIndentChars: 0`、`letterSpacingPt: 0` 等原先因真值判断不输出，样式无法覆盖回零值。
10. **分页状态会撒谎**：原先用「连续 3 次页数不变」判断完成，长文档可能提前报完成。现在由 Paged.js 生命周期回调 + `postMessage` 通知宿主，60 秒未完成则报错；分页完成前打印按钮禁用。
11. **打印按钮时机**：分页未完成时打印会得到半成品；现在需 `readyId === previewId && pagedStatus === 'paged'` 且 Markdown 已完成防抖。
12. **撤销与错误处理**：样式改动无法回退、非法样式包会让整个预览崩溃。现在有 50 步撤销栈；渲染异常显示为用户可读的横幅并保留上一份有效预览。
13. **分页稳定性**：补充了图片不被拆分、表格最大宽度、长 URL/代码换行、备注段内的段落不被正文样式重复覆盖等基础规则。
14. **预览外壳从未生效（分页路径）**：Paged.js 的 polisher 会丢弃 `@media screen` 规则、并把 `@media print` 规则展平成常态规则，导致灰底、纸张阴影和缩放只在原生路径出现；展平后的 `!important` 还会反过来隐藏屏幕上的工具栏。现在屏幕外壳在分页完成后由生命周期脚本重新注入，打印规则去掉 `!important` 以保证「屏幕态优先、打印态复位」。

### 便捷性

- 源文档区域新增「打开 .md」，可直接载入本地 Markdown。
- 「文档默认值」的继承按钮现在真正恢复默认值（原先绑定了一个空操作）。
- CLI 的 `--no-furniture` 从帮助文案里的空承诺变为真实实现。
- 预览 iframe 加了标题、状态区加了 `role="status"`，缩放按钮补 `aria-label`。

## 验证证据

以下命令在本机 Windows + Node v24.11.1 上实际执行：

| 命令 | 结果 |
|:---|:---|
| `npm.cmd test` | 8 个测试文件、**63 项全部通过**（本轮新增 15 项回归测试） |
| `npm.cmd run typecheck` | strict `tsc --noEmit` 通过 |
| `npm.cmd run build` | Vite 8.3.2 构建成功；JS 1256.98 kB（gzip 267.33 kB）、CSS 6.41 kB |
| `node e2e/smoke.mjs` | **10/10 通过**：Paged.js 分页 2 页、改字号即时刷新、切换样式包编号与缩进生效、缩放 0.85 → 0.95、无控制台错误 |
| `node e2e/export-check.mjs` | 原生 2 页 / 580 KB，Paged.js 2 页 / 462 KB，Paged.js 生成 80 个页边距元素；屏幕态工具栏可见，打印态工具栏隐藏且缩放复位为 1 |
| `npm.cmd run cli -- themes` | 列出 2 个内置样式包 |
| `npm.cmd run cli -- render … --theme thesis-cn` | 生成原生分页 HTML，角色统计包含行内代码 |
| `npm.cmd run cli -- render … --paged` | 内联 Paged.js 生成分页 HTML |
| `npm.cmd run cli -- render … --no-furniture` | 输出中不再出现 `@top-center` / `@bottom-center` |
| `npm.cmd run cli -- check 有效样式包` | 通过，退出码 0 |
| `npm.cmd run cli -- check 非法样式包` | 报出可读错误（字体族类型、字号、颜色），退出码 1 |
| `npm.cmd audit` | **0 个已知漏洞** |

新增的 15 项回归测试覆盖：危险协议、引用式链接/图片、表格对齐、行内角色、图题级联、代码围栏、BOM、畸形样式包、原型污染键、自定义纸张、零值输出、frontmatter 转义等。见 [regressions.test.ts](../../packages/core/test/regressions.test.ts)。

## 已知限制与后续建议

- **未实现**（规划内）：目录与页码联动、图表编号与交叉引用、代码高亮、脚注、图文环绕、DOCX / Typst 后端、桌面壳打包。
- **未验证**：300 页文档的分页耗时与内存、视觉回归像素比对、中文字体子集嵌入与 PDF 文本可复制性、macOS 字体矩阵。建议按规划 §11 补基准脚本与视觉回归。
- **工程化缺口**：仓库尚无 ESLint / Prettier 配置与 CI 工作流；测试脚本已稳定，可以先把 `test` + `typecheck` + `build` + `smoke` 固化成流水线。
- **体积**：demo 单包 1.26 MB，主要来自内联的 Paged.js polyfill。预览按需加载 polyfill 可以显著降低首屏体积，建议在 M2 处理。
- **安全默认值是有取舍的**：绝对 `file://` 图片与 `data:` 非图片地址被有意拦截，相对路径图片照常工作；`allowRawHtml` 仍是显式开关，开启后风险的最终边界由宿主决定。
- **环境注意**：本沙箱内 Node 的 `os.userInfo()` 会返回 `ENOMEM`，导致 tsx 无法在沙箱内启动 CLI；这不是项目缺陷，在沙箱外执行 `npm.cmd run cli` 正常。
