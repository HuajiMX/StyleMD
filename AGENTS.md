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
- **会话存档**：`localStorage` 的 `stylemd:session:v1` 保存文档、光标、样式包与界面布局；读取必须经 `migrateTheme` + `validateTheme`，坏档回落默认预设。
- **样式窗口**：可拖标题栏移动、可拖右下角缩放，外层只有透明挡板（不压暗底色但要挡住底层点击）；「预览」是每个选项卡表单末尾的一个分区，不要改回固定在窗口底部。

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
- UI 交互由 `node e2e/smoke.mjs` 兜住（当前 84 项：分页、跨页表格分片、题注与对象同页、公式排版与内联字体、公式样例在画廊与样式窗口里的渲染与居中、页眉页脚弹窗与域插入/样式入口、光标定位、样式编辑、行内与段落控件、布局与分隔条、文件菜单的悬停/固定展开、文件保存（写回文件与退回下载两条路）、自动保存开关与状态栏的「已保存 / 已自动保存」措辞、会话恢复、双向滚动同步、大纲跳转与滚动高亮）。改了 UI 就同步改断言，别让断言失效成空转。
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
