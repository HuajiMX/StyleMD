# Repository Guidelines

StyleMD 是 Markdown → PDF 的可视化样式管理器。动手前先读 `docs/plans/` 下的开发规划与 M0 验证结论。`docs/` 是项目资料（规划、验证结论、需求、设计参考图），**必须入库**，不要再把它加进 `.gitignore`。

## Project Structure & Module Organization

- `packages/theme-schema/` — 样式模型：类型、角色注册表、校验、版本迁移。**纯数据，不得出现 CSS 字符串。**
- `packages/core/` — 渲染内核：解析 → 角色化 → 样式解析 → HTML → CSS。**不得 import UI 或宿主 API。**
- `packages/presets/` — 内置样式包；`packages/renderer-paged/` — Paged.js 集成（纯字符串进出），预览 iframe 里的生命周期脚本与 postMessage 协议也在这一层。
- `apps/demo/` — React + Vite 工作台；`apps/cli/` — 命令行入口。
  - `src/components/` — `Ribbon`（标题栏 / 选项卡 / 分组工具带）、`OutlinePanel`（大纲导航）、`SourcePane` / `PreviewPane`、`StatusBar`（全局底部栏）、`StyleDialog`（样式配置窗口）、`fields.tsx`（表单控件与组合框）、`icons.tsx`。
  - `src/lib/` — `session.ts`（会话存档）、`textareaScroll.ts`（光标与滚动定位）、`outline.ts`（目录）、`dragResize.ts`（分隔条）、`document.ts`（文档级操作）、`themeOps.ts`、`typePresets.ts`。
- `e2e/` — 基于本机 Chromium 的端到端脚本，产物写入 `e2e/artifacts/`（已 gitignore）。
- `examples/` — 示例文档；`docs/plans/` — 规划、验证结论、需求与参考图。

## UI 约定（apps/demo）

布局：顶部功能区（标题栏 + 选项卡 + 分组工具带）、左侧可折叠大纲、中间编辑器与右侧分页预览（两条可拖动分隔条）、底部全局状态栏。样式配置在**弹窗**里，没有右侧常驻面板——不要把它改回去。

- **CSS 权重**：`.ribbon button` 这类通用规则的权重高于组件类，会把组件的内边距压掉。功能区里的组件样式要带前缀写，例如 `.ribbon .ribbon-tab`、`.rgroup .popover-trigger`、`.rgroup .seg-button`。
- **分隔条拖动**：指针走进预览 iframe 后，父文档收不到 `pointermove`（`setPointerCapture` 也不跨 iframe）。拖动期间给 `body` 加 `is-dragging-pane`，让 iframe `pointer-events: none`，见 `lib/dragResize.ts`。
- **文本定位**：textarea 里按「行号 × 行高」估算会被软换行带偏，必须用 `lib/textareaScroll.ts` 的镜像元素 + Range 测量。大纲跳转用单点、滚动高亮用批量 `scrollTopsForOffsets`，都走这一套。
- **滚动同步**：宿主与预览 iframe 之间走 postMessage（`stylemd:scroll` / `stylemd:scroll-report` / `stylemd:zoom` / `stylemd:print` / `stylemd:pagination`）。双向同步要用两层 `requestAnimationFrame` 做静默窗口，否则两边互相推着抖。
- **预览双画布**：预览是**两块 iframe 叠着轮流上前**，三种身份对应三个类——`.preview-iframe`（正在显示）、`.preview-iframe-incoming`（正在分页，压在最上面）、`.preview-iframe-spare`（备用，不画）。改动先在 incoming 那块分页，排完只换层级、不重新加载，所以看不到「先清空再重排」的闪白，滚动进度也在换上来之前就恢复好。
  - **分页那块必须压在最上面且元素本身可见**：被完全遮住 / `display:none` / `visibility:hidden` / `opacity:0` / 移出屏幕的 iframe，浏览器会把它的 `requestAnimationFrame` 限流到 1 帧/秒，而 Paged.js 每排一页都要等一帧——18 页的文档会从 0.3 秒变成 15 秒。
  - 它自己的内容由预览文档在分页期间藏起来（`renderer-paged` 里 `conceal()`，分页完 `reveal()` 还原），所以要压在上面也看不见，一共藏三样：`html` 的可见性、`html`/`body` 的背景、**原生滚动条的 `scrollbar-color`**。背景不清 → 文档被判成不透明，合成器会把下面那块正在显示的画布当成被完全遮住而丢掉绘制，用户看到灰底闪一下；滚动条不涂透明 → 它是画在图层上的原生控件，`visibility: hidden` 盖不住它，而分页途中文档高度一页一变，拇指就会在预览右边一涨一缩（用户看到的就是「滚动条跳一下」）。只涂透明、不做 `scrollbar-width: none`，是为了保持占位、不让版面宽度跳。露内容后要**等两帧再上报** `paged`，否则宿主藏旧画布时新版还没画出来，同样会闪。
  - 非显示的两块都要 `pointer-events: none`，否则滚轮、悬停、拖分隔条都会打到一个看不见的文档里。
  - 只有 `spec.id === previewId` 的那块才能在 `load` 之后抬成 incoming（预览重新挂载时备用画布也会重新加载，抬错了会把更早一版露到最上面）。
- **会话存档**：`localStorage` 的 `stylemd:session:v1` 保存文档、光标、文件名、样式包与界面布局；读取必须经 `migrateTheme` + `validateTheme`，坏档回落默认预设。
- **样式窗口**：可拖标题栏移动、可拖右下角缩放，外层只有透明挡板（不压暗底色但要挡住底层点击）；「预览」是每个选项卡表单末尾的一个分区，不要改回固定在窗口底部。
- **标题栏**：正中是大字**文件名**（不含 `.md`，点开就地改，回车生效）+ 灰色小字**文档标题**。两者是两回事：文件名决定保存 / 下载用什么名字（`localStorage` 会话里的 `fileName`），文档标题写在前置元数据里、供页眉页脚域使用；「重命名」不再放在「文件」菜单里。
- **文件写入**：优先 File System Access API（打开后「保存」写回原句柄），不支持时退回下载；改这一块看 `lib/document.ts`，别在组件里各写一套。

## Build, Test, and Development Commands

Windows PowerShell 禁用了 `npm.ps1`，本仓库一律用 `npm.cmd`。

```powershell
npm.cmd install        # 安装依赖
npm.cmd run dev        # 启动 demo：http://localhost:5173
npm.cmd test           # vitest 单元测试
npm.cmd run typecheck  # tsc --noEmit（strict）
npm.cmd run build      # 构建 demo 到 apps/demo/dist
npm.cmd run build:math-css   # 重新生成内联公式字体样式（升级 katex 后必须跑）
node e2e/smoke.mjs     # 端到端冒烟（需本机 Chromium，可用 STYLEMD_CHROME 指定）
node e2e/export-check.mjs
npm.cmd run cli -- render examples/sample-thesis.md --theme thesis-cn --out out.html
```

## Coding Style & Naming Conventions

- TypeScript strict；2 空格缩进、单引号、不写行尾分号。
- 相对导入不写扩展名；跨包用 `@stylemd/*` 别名，新别名需同时改 `tsconfig.json` 与 `apps/demo/vite.config.ts`。
- 角色 id 用点号（`heading.1`），DOM 与 CSS 用短横线（`heading-1`，经 `cssRoleName` 转换）。
- 文件 kebab-case（`compile-css.ts`），React 组件 PascalCase（`StyleDialog.tsx`）。
- 注释写「为什么」，不要复述代码；踩过的坑（CSS 权重、iframe 指针事件、软换行定位）在注释里点出来，避免下次再踩。

## Testing Guidelines

- vitest，用例放在 `packages/*/test/*.test.ts`，用 `describe` / `it` 描述**行为**而非实现。
- UI 交互由 `node e2e/smoke.mjs` 兜住（当前 96 项：分页、跨页表格分片、题注与对象同页、公式排版与内联字体、公式样例在画廊与样式窗口里的渲染与居中、页眉页脚弹窗与域插入/样式入口、数字框增减箭头常驻与页边距框宽度、样式窗口下拉点别处收起、光标定位、样式编辑、行内与段落控件、布局与分隔条、文件菜单的悬停/固定展开、标题栏文件名就地重命名、文件保存（写回文件与退回下载两条路）、自动保存开关与状态栏措辞（「已保存 / 已自动保存」、排版途中「正在渲染」）、会话恢复（含文件名）、双向滚动同步、改动重排时预览不闪回文首/不空白/滚动条还原、重排时分页画布压在最上面、切回双栏不露旧版、大纲跳转与滚动高亮）。改了 UI 就同步改断言，别让断言失效成空转。
- 新增内置样式包必须能通过 `validateTheme`（`presets.test.ts` 会兜住）。
- 改动 CSS 编译或 HTML 渲染输出时同步更新断言，并说明预期变化。
- 提交前至少跑 `npm.cmd test` 与 `npm.cmd run typecheck`；涉及 UI 再跑 `node e2e/smoke.mjs`。

## Commit & Pull Request Guidelines

- 用 Conventional Commits（`feat:` / `fix:` / `style:` / `docs:` / `test:` / `chore:`），标题中文，正文列改动要点，并附**实际执行过的命令与结果**（例如「node e2e/smoke.mjs（69/69）」）。
- 提交前确认暂存区没有生成物：`node_modules/`、`dist/`、`e2e/artifacts/` 由 `.gitignore` 覆盖，但 `git add -A` 后仍要扫一眼。
- PR 需说明动机与影响面；UI 改动附截图（如 `e2e/artifacts/demo-smoke.png`）；修改样式模型结构必须同步 `schemaVersion` 与 `migrate.ts`。

## Architecture Constraints (must keep)

1. `core` 不依赖 UI 与宿主，保证 CLI / CI / 未来桌面壳可复用。
2. 样式模型只描述数据，渲染后端负责翻译；换后端不改模型。
3. 预览与导出共用 `build()` 产出的 HTML，禁止另起一套渲染路径。
4. 编辑器与预览的定位、滚动同步只走 `lib/textareaScroll.ts` 与 postMessage 协议，不要在别处另写一套估算逻辑。
5. 公式由 `core` 的 remark-math → KaTeX 产出（`$...$` 行内、`$$...$$` 一律行间，单行 `$$` 也算，由 `promoteDisplayMath` 统一），KaTeX 样式与 woff2 字体内联在 `packages/core/src/render/math-css.generated.ts`（`npm.cmd run build:math-css` 重新生成）。别改成 CDN 或相对路径：预览是 srcdoc（没有自己的文档地址），离线导出的 HTML 也可能被搬到任意目录。

## Security & Configuration Tips

- Markdown 里的原始 HTML 默认转义，仅在显式 `allowRawHtml` 时直出。
- 内联脚本需转义 `</script`、`<!--`，并用函数式替换（`replace(x, () => payload)`），否则 `$'` 会截断脚本。
- 会话存档写在 `localStorage`，读取一律校验；存档损坏或超配额时静默回落，不能让编辑功能受影响。
- 只打包可再分发字体（思源 / Noto / KaTeX，均为 OFL）。
