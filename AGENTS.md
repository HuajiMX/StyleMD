# Repository Guidelines

StyleMD 是 Markdown → PDF 的可视化样式管理器。动手前先读 `docs/plans/` 下的开发规划与 M0 验证结论。

## Project Structure & Module Organization

- `packages/theme-schema/` — 样式模型：类型、角色注册表、校验、版本迁移。**纯数据，不得出现 CSS 字符串。**
- `packages/core/` — 渲染内核：解析 → 角色化 → 样式解析 → HTML → CSS。**不得 import UI 或宿主 API。**
- `packages/presets/` — 内置样式包；`packages/renderer-paged/` — Paged.js 集成（纯字符串进出）。
- `apps/demo/` — React + Vite 工作台（`src/components/`、`src/lib/`）；`apps/cli/` — 命令行入口。
- `e2e/` — 基于本机 Chromium 的端到端脚本，产物写入 `e2e/artifacts/`（已 gitignore）。
- `examples/` — 示例文档；`docs/plans/` — 规划与验证结论。

## Build, Test, and Development Commands

Windows PowerShell 禁用了 `npm.ps1`，本仓库一律用 `npm.cmd`。

```powershell
npm.cmd install        # 安装依赖
npm.cmd run dev        # 启动 demo：http://localhost:5173
npm.cmd test           # vitest 单元测试
npm.cmd run typecheck  # tsc --noEmit（strict）
npm.cmd run build      # 构建 demo 到 apps/demo/dist
node e2e/smoke.mjs     # 端到端冒烟（需本机 Chromium，可用 STYLEMD_CHROME 指定）
node e2e/export-check.mjs
npm.cmd run cli -- render examples/sample-thesis.md --theme thesis-cn --out out.html
```

## Coding Style & Naming Conventions

- TypeScript strict；2 空格缩进、单引号、不写行尾分号。
- 相对导入不写扩展名；跨包用 `@stylemd/*` 别名，新别名需同时改 `tsconfig.json` 与 `apps/demo/vite.config.ts`。
- 角色 id 用点号（`heading.1`），DOM 与 CSS 用短横线（`heading-1`，经 `cssRoleName` 转换）。
- 文件 kebab-case（`compile-css.ts`），React 组件 PascalCase（`Inspector.tsx`）。

## Testing Guidelines

- vitest，用例放在 `packages/*/test/*.test.ts`，用 `describe` / `it` 描述**行为**而非实现。
- 新增内置样式包必须能通过 `validateTheme`（`presets.test.ts` 会兜住）。
- 改动 CSS 编译或 HTML 渲染输出时同步更新断言，并说明预期变化。
- 提交前至少跑 `npm.cmd test` 与 `npm.cmd run typecheck`；涉及 UI 再跑 `node e2e/smoke.mjs`。

## Commit & Pull Request Guidelines

- 历史只有一条 `Initial commit`，尚无既定格式。建议用 Conventional Commits（`feat:` / `fix:` / `docs:` / `test:` / `chore:`），描述可用中文。
- PR 需说明动机与影响面，并附**实际执行的命令与结果**，不要只写"已测试"。
- UI 改动附截图（如 `e2e/artifacts/demo-smoke.png`）；修改样式模型结构必须同步 `schemaVersion` 与 `migrate.ts`。

## Architecture Constraints (must keep)

1. `core` 不依赖 UI 与宿主，保证 CLI / CI / 未来桌面壳可复用。
2. 样式模型只描述数据，渲染后端负责翻译；换后端不改模型。
3. 预览与导出共用 `build()` 产出的 HTML，禁止另起一套渲染路径。

## Security & Configuration Tips

- Markdown 里的原始 HTML 默认转义，仅在显式 `allowRawHtml` 时直出。
- 内联脚本需转义 `</script`、`<!--`，并用函数式替换（`replace(x, () => payload)`），否则 `$'` 会截断脚本。
- 只打包可再分发字体（思源 / Noto）。
