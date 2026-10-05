# Repository Guidelines

StyleMD 是 Markdown → PDF 的可视化样式管理器。动手前先读 `docs/plans/` 下的开发规划与 M0 验证结论。`docs/` 是项目资料（规划、验证结论、需求、设计参考图），**必须入库**，不要再把它加进 `.gitignore`。

## Project Structure & Module Organization

- `packages/theme-schema/` — 样式模型：类型、角色注册表、字体槽判定（`fonts.ts`）、校验、版本迁移。**纯数据，不得出现 CSS 字符串。**
- `packages/core/` — 渲染内核：解析 → 角色化 → 样式解析 → HTML → CSS。**不得 import UI 或宿主 API。**
- `packages/presets/` — 内置样式包；`packages/renderer-paged/` — Paged.js 集成（纯字符串进出），预览 iframe 里的生命周期脚本与 postMessage 协议也在这一层。
- `apps/demo/` — React + Vite 工作台；`apps/cli/` — 命令行入口。
  - `src/components/` — `Ribbon`（标题栏 / 选项卡 / 分组工具带）、`OutlinePanel`（大纲导航）、`SourcePane` / `PreviewPane`、`StatusBar`（全局底部栏）、`StyleDialog`（样式配置窗口）、`fields.tsx`（表单控件与组合框）、`icons.tsx`。
  - `src/lib/` — `session.ts`（会话存档）、`textareaScroll.ts`（光标与滚动定位）、`outline.ts`（目录）、`dragResize.ts`（分隔条）、`document.ts`（文档级操作）、`themeOps.ts`、`typePresets.ts`。
- `apps/desktop/` — Electron 桌面壳，包同一个 demo 产物。`src/main.ts`（主进程：自定义协议、权限、IPC）、`src/preload.ts`（薄桥）、`src/bridge.ts`（桥的契约与频道名）、`src/pdf.ts`（导出 PDF：隐藏窗口分页 + `printToPDF`）、`src/fonts.ts`（字体中文名字典）、`scripts/*.mjs`（dev / build / start / smoke）。
- `e2e/` — 基于本机 Chromium 的端到端脚本，产物写入 `e2e/artifacts/`（已 gitignore）。
- `examples/` — 示例文档；`docs/plans/` — 规划、验证结论、需求与参考图。

## UI 约定（apps/demo）

布局：顶部功能区（标题栏 + 选项卡 + 分组工具带）、左侧可折叠大纲、中间编辑器与右侧分页预览（两条可拖动分隔条）、底部全局状态栏。样式配置在**弹窗**里，没有右侧常驻面板——不要把它改回去。

- **CSS 权重**：`.ribbon button` 这类通用规则的权重高于组件类，会把组件的内边距压掉。功能区里的组件样式要带前缀写，例如 `.ribbon .ribbon-tab`、`.rgroup .popover-trigger`、`.rgroup .seg-button`。
- **组合框的输入框要跟着壳走**：`.field.inline input[type="text"]`（0,3,1）压过 `.combo input`（0,2,1），壳比 150px 宽时输入框不会跟着长，绝对定位的箭头就飘到框外面（字号那种窄壳看不出来，因为 flex 会把输入框压回去）。`styles.css` 里用 `.field.inline .combo input[type="text"] { width: 100% }` 兜住，e2e 有断言守着。
- **字体是三个槽，不是回退链**：`FontSpec` 存 `latinFamily`（西文，空串 = 跟随中文字体）/ `cjkFamily`（中文）/ `fallbackFamilies`（尾部回退）。旧的 `family: string[]` 由 `migrate.ts` 折成三个槽（`fontSlotsFromChain`），折回去能得到原链，迁移不改变渲染结果。两槽相同（含「西文跟随中文」）时编译器直接给回退链；**两槽不同时生成一对 `@font-face`**：同一个生成名、各自 `src: local(...)` 加 `unicode-range` 按字符区段分派——「西文用宋体、中文用微软雅黑」因此成立，中文字体也能放进西文槽。
  - `local()` 引用本机已装字体，不打包文件；没装时该 `@font-face` 整体失效，落到 `font-family` 里的下一个家族。预览 iframe 的 CSP（`font-src data:`）不拦它（实测过）。
  - 区段表在 `packages/core/src/style/font-faces.ts`：拉丁段刻意挖掉 `—`(U+2014) 与 `…`(U+2026)，按中文习惯归给中日韩段。
  - **样式窗口与画廊里的样本要自己注入 `@font-face`**：它们是内联样式，拿不到编译产物里那对规则；两个槽不同时不注入的话，样本里的中文会被西文槽那个中文字体接管（样本显示宋体、预览显示黑体，真踩过）。`App.tsx` 用 `specimenFontFaces`（core 的 `planFontFamily`）把同一套规则写进宿主文档，两条渲染路径共用同一份规划。
  - 改 `FontSpec` 结构必须同步 `schemaVersion` 与 `migrate.ts`（当前 v3）。
- **功能区只放中文字体一个框**（`ribbonFontValue` 取值，没有中文字体时退回西文/回退家族，避免代码角色显示成空框），中西文分开设只在样式窗口里。候选来自 `lib/fontCatalog.ts`：`queryLocalFonts`（桌面壳已放行权限，浏览器里要先授权、不主动弹框）→ 常用清单，常用的排在最前。
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
- **导出 PDF**：桌面壳里点一下就出 PDF 并弹系统保存框，浏览器里仍是打印对话框；两条路都从 `App.tsx` 的 `handlePrint` 进出，交出去的 HTML 就是预览那份 `previewHtml`（同一个 `build()` 产物），别为导出另起一条渲染路径。宿主能力统一从 `lib/desktop.ts` 的 `desktopBridge()` / `canExportPdfDirectly()` 取，别在组件里各写一遍 `window.stylemdDesktop` 断言。

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
npm.cmd run desktop        # 桌面壳开发态窗口（复用已在跑的 dev server）
npm.cmd run desktop:start  # 桌面壳打包态窗口（每次重建 demo 产物）
npm.cmd run desktop:build  # 只打主进程与 preload 到 apps/desktop/dist
npm.cmd run desktop:smoke  # 桌面壳无头自检（13 项：出包 / 桥 / 直接导出 PDF / 字体枚举）
```

## 桌面壳约定（apps/desktop）

- **打包态走 `stylemd://` 自定义协议**，不用 `loadFile`：Vite 产出的是绝对路径（`/assets/...`），`file://` 下必 404。协议注册成 `standard + secure`，渲染进程才在安全上下文里，`queryLocalFonts()`、剪贴板这类能力以后才用得上。
- **自定义协议自己算 `Content-Type`**（`MIME_TYPES`）。ES module 对 MIME 挑剔，声明错了整个 bundle 被拒收，表现是白屏 + 控制台一行错，很容易误判成打包坏了。
- **导出 PDF 走隐藏窗口 + `printToPDF`，不复用预览那块 iframe**：渲染进程把与预览同一份 HTML（`previewHtml`）经 `stylemd:pdf:export` 交给主进程，主进程把它挂在自定义协议的 `stylemd://export/<token>` 上（`src/pdf.ts` 里的内存 token 表，不写临时文件），开一个 `show: false` 的窗口加载它、轮询 `window.__stylemdPaged.status` 等分页跑完，再 `printToPDF` 写盘，位置由 `dialog.showSaveDialog` 决定。四个必须保持的点：隐藏窗口要 `backgroundThrottling: false`（隐藏窗口的 rAF 会被限流，而 Paged.js 每排一页都要等一帧，十页文档会从一秒拖到十几秒）；`printToPDF` 要 `preferCSSPageSize: true` + `margins: 0`（纸张与页边距只由主题编译出的 `@page` 决定——实测导出 PDF 的绘制起点 68px=18.00mm、内容宽 658px=174mm，与预设 `marginMm: 18` 完全对得上，再叠一层 Chromium 默认页边距会整体往里缩）；先弹保存框再渲染（渲染要一两秒，让保存框等着比按钮没反应强）；`printToPDF` 打的是整个 webContents，没有「只打某一个 iframe」的能力，所以别想直接把预览 iframe 打出来。浏览器版没有这条通道，仍是 `stylemd:print` → `window.print()`，`apps/demo` 用 `canExportPdfDirectly()` 区分（文案也随之在「打印 / 导出 PDF」与「导出 PDF」之间切换）。
- **权限只放行 `local-fonts` 与 `clipboard-sanitized-write`**，其余一律拒。加新能力要同时改 `ALLOWED_PERMISSIONS` 与 `bridge.ts` 的契约，别在渲染进程里偷偷挂全局。
- **preload 保持薄**：只 `contextBridge.exposeInMainWorld` 一个对象，不把 `ipcRenderer` 交出去；新能力必须在 `bridge.ts` 里显式开一个频道。
- **窗口安全基线**：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`；外链交给系统浏览器（`setWindowOpenHandler` + `will-navigate` 拦截）。
- **本机跑 GUI 要在沙箱外**：Electron 在主机的文件沙箱里会以 `0xC0000005` 崩溃，`npm.cmd run desktop` / `desktop:smoke` 需要提升权限执行；另外 PowerShell 里 `npm.cmd ... 2>&1` 会把 stderr 当异常，退出码会被带偏，看退出码别套 `2>&1`。
- **改主进程代码必须重启窗口**：`src/main.ts` 与 `src/preload.ts` 走 esbuild 打成 `dist/main.cjs` / `preload.cjs`，HMR 只管渲染进程。只热更渲染层会出现「主进程还是旧代码、界面已经换了」的状态，排查时极易误判（真被「注册表解码修好了但界面上还是乱码」坑过一次）。`scripts/dev.mjs` 现在监听 `src/`，主进程改动会自动重建并重启窗口。
- **dev server 地址不能写死 `127.0.0.1`**：Vite 的 host 默认是 `localhost`，IPv6 优先的机器上它只绑 `[::1]`，写死 IPv4 会连接被拒。`scripts/dev.mjs` 探 `localhost` / `127.0.0.1` / `[::1]` 三个候选，谁先应就用谁；探到已经有人在服务就直接复用，不再另起（`strictPort` 撞上会直接退出，表现是「命令跑完了但没有窗口」）。
- **自检要挡「失败页也算加载完」**：加载错误时 Chromium 同样会触发 `did-finish-load`，不记一个 `loadFailed` 标记就会对着正在销毁的 webContents 跑断言，报出来的是 `Object has been destroyed` 而不是真正的失败原因。
- **别用 `MainWindowHandle` 判断窗口有没有出来**：一个 Electron 进程同时拥有主窗口和 detached DevTools 时，.NET 的 `MainWindowHandle` 只会报其中一个，看上去就像「主窗口没显示」，据此改代码会白改一轮。要确认就用 `EnumWindows` 列可见顶层窗口，或者直接问用户。`main.ts` 把 `show()` 收进 `reveal()`、放在 `openDevTools` 之前，并加 3 秒兜底，是防另一个已知坑（`show: false` 时提前开 DevTools 可能不触发 `ready-to-show`），跟上面那个误判无关。
- **字体列表只有一个来源：渲染进程的 `queryLocalFonts()`**；桌面壳只额外提供一本**中文名字典**（`listFontAliases`）。Chromium 只给英文家族名（`SimSun` 而不是「宋体」），中文名写在字体文件的 `name` 表里，只能问 DirectWrite 要——主进程用 Windows 自带的 WPF 字体集合（`[Windows.Media.Fonts]::SystemFontFamilies` 的 `FamilyNames`）读一遍，`fonts.ts` 里按平台缓存，非 Windows 或 PowerShell 被挡就返回空表，界面显示英文名。浏览器里没有词典，且 `queryLocalFonts` 要先授权。
  - 别再走注册表：`HKLM\...\Fonts` 那份混着字重变体（428 条对 231 个家族），而且 `reg.exe` 按控制台代码页（中文 Windows 是 GBK）输出字节，按 UTF-8 解必乱码（`幼圆` → `��Բ`，真踩过两次）。这些坑随着那份名册一起删掉了。
  - 判断中文字体、给候选排序都用**显示名**（有中文名用中文名），样式里存的仍是家族名——CSS 匹配以家族名为准。

## Coding Style & Naming Conventions

- TypeScript strict；2 空格缩进、单引号、不写行尾分号。
- 相对导入不写扩展名；跨包用 `@stylemd/*` 别名，新别名需同时改 `tsconfig.json` 与 `apps/demo/vite.config.ts`。
- 角色 id 用点号（`heading.1`），DOM 与 CSS 用短横线（`heading-1`，经 `cssRoleName` 转换）。
- 文件 kebab-case（`compile-css.ts`），React 组件 PascalCase（`StyleDialog.tsx`）。
- 注释写「为什么」，不要复述代码；踩过的坑（CSS 权重、iframe 指针事件、软换行定位）在注释里点出来，避免下次再踩。

## Testing Guidelines

- vitest，用例放在 `packages/*/test/*.test.ts`，用 `describe` / `it` 描述**行为**而非实现。
- UI 交互由 `node e2e/smoke.mjs` 兜住（当前 103 项：分页、跨页表格分片、题注与对象同页、公式排版与内联字体、公式样例在画廊与样式窗口里的渲染与居中、页眉页脚弹窗与域插入/样式入口、数字框增减箭头常驻与页边距框宽度、字体候选与中西文两个槽（含按 unicode-range 分派的实测、样本与预览一致）、组合框箭头位置、样式窗口下拉点别处收起、光标定位、样式编辑、行内与段落控件、布局与分隔条、文件菜单的悬停/固定展开、标题栏文件名就地重命名、文件保存（写回文件与退回下载两条路）、自动保存开关与状态栏措辞（「已保存 / 已自动保存」、排版途中「正在渲染」）、会话恢复（含文件名）、双向滚动同步、改动重排时预览不闪回文首/不空白/滚动条还原、重排时分页画布压在最上面、切回双栏不露旧版、大纲跳转与滚动高亮、浏览器版导出按钮文案）。改了 UI 就同步改断言，别让断言失效成空转。
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
