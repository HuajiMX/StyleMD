# 桌面壳（Electron）引入实施记录

日期：2026-10-04 ｜ 关联约束：AGENTS.md 架构约束 1「core 不依赖 UI 与宿主」、README「三条架构约束」

## 目标

在不动 Web 版 demo 的前提下加一个桌面宿主：同一份 `build()` 产物既能跑在浏览器，也能跑在 Electron 壳里，
并先把「宿主能力」这条通道打通（当前只需要系统字体枚举），为后续「像 Word 一样直接选字体」的样式面板铺路。

## 决策与取舍

| 待定项 | 选择 | 理由 |
|:---|:---|:---|
| 放置位置 | 新工作区包 `apps/desktop`（`@stylemd/desktop`） | 与 `apps/demo`、`apps/cli` 平级；`core` 仍然一个字节不改，架构约束 1 保持成立 |
| 渲染产物来源 | 复用 `apps/demo/dist`，不另建一套渲染路径 | 预览与导出共用同一份 HTML 是既有约束（架构约束 3），桌面壳不该破例 |
| 打包态加载方式 | 自定义 `stylemd://` 协议（`standard + secure`），不用 `loadFile` | Vite 产出绝对路径（`/assets/...`），`file://` 下必 404；自定义协议同时让渲染进程处在安全上下文，`queryLocalFonts()` 才可能可用 |
| MIME | 自己按扩展名给 `Content-Type`，不交给 `net.fetch(file:)` | ES module 对 MIME 挑剔，声明错会被整体拒收，表现为白屏 + 一行控制台错误，排查成本高 |
| 构建 | esbuild（Vite 已带）把主进程与 preload 打成 CJS | 不引新工具链；Electron 的 main 与 sandbox preload 都以 CJS 最稳，绕开 `type: module` 的边角 |
| 宿主能力通道 | preload 只暴露一个薄对象 `window.stylemdDesktop` | 渲染进程拿不到 `ipcRenderer`，加能力必须回 `bridge.ts` 显式开频道 |
| 字体枚举位置 | 主进程（Windows 注册表 / mac·Linux `fc-list`），另放行 `local-fonts` 权限 | 注册表是「本机确实装了」的近似答案；真正与 Chromium 匹配一致的是渲染进程的 `queryLocalFonts()`，两条路都要留 |
| 安全基线 | `contextIsolation` / `sandbox` 开，`nodeIntegration` 关，权限白名单，外链走系统浏览器 | 沿用 Electron 官方推荐；预览 iframe 本来就是沙箱 + CSP，壳这层不再额外开口 |

## 代码落点

| 位置 | 改动 |
|:---|:---|
| `apps/desktop/package.json` | 新工作区包；`dev` / `build` / `start` / `smoke` 四个脚本 |
| `apps/desktop/src/main.ts` | 自定义协议注册与出包、窗口创建与安全配置、权限白名单、字体 IPC、无头自检分支 |
| `apps/desktop/src/preload.ts` | `contextBridge` 暴露薄桥 |
| `apps/desktop/src/bridge.ts` | 桥的类型契约与 IPC 频道名（主进程、preload 共用） |
| `apps/desktop/src/fonts.ts` | 系统字体枚举：Windows 注册表（含 HKCU 用户级安装）、`fc-list`、mac `system_profiler` 兜底，按平台缓存 |
| `apps/desktop/scripts/*.mjs` | `build`（esbuild）、`dev`（Vite + Electron）、`start`、`smoke` |
| `package.json` / `tsconfig.json` | 根脚本 `desktop` / `desktop:build` / `desktop:smoke`；类型检查纳入 `apps/desktop/src` |
| `README.md` / `AGENTS.md` | 结构、命令、桌面壳约定（自定义协议与 MIME、权限、沙箱外跑 GUI） |

## 验证证据

以下命令在本机 Windows + Node v24.11.1 + Electron 44.5.1 上实际执行：

| 命令 | 结果 |
|:---|:---|
| `npm.cmd install` | 212 个包，0 漏洞（Electron 二进制需单独跑一次 `node node_modules/electron/install.js`，直连失败时用 `ELECTRON_MIRROR`） |
| `npm.cmd run typecheck` | strict `tsc --noEmit` 通过（含 `apps/desktop/src`） |
| `npm.cmd run build` | Vite 构建成功；`dist/assets/index-*.js` 2.30 MB（gzip 744 kB），另有 chunk 体积告警（既有现象，未处理） |
| `npm.cmd run desktop:smoke` | **SMOKE OK (5/5)**：渲染进程已挂载（证明自定义协议出的包能被执行）、preload 桥存在、标记为桌面环境、读到 Electron 44.5.1、枚举到 **423** 个系统字体家族（样例 `Agency FB` / `Agency FB Bold` / `Algerian`）；退出码 0 |
| `STYLEMD_DEV_SERVER=http://localhost:5173 STYLEMD_SMOKE=1 electron apps/desktop` | 开发态分支 **SMOKE OK (5/5)**：同一套断言跑在 Vite dev server 的产物上 |
| `npm.cmd test` | 15 个测试文件、**132 项全部通过** |
| `node e2e/smoke.mjs` | 首次运行 95/96（一条时序敏感断言偶发失败，复跑 96/96 通过，疑为既有 flake，与本次改动无关；本次未改任何 demo 源码） |
| `node e2e/export-check.mjs` | 导出 PDF 2 页 / 498 KB，页眉页脚结论与改动前一致 |

## 已知限制与后续

- **没有安装包**：目前只有「跑起来」，没有 electron-builder / 签名 / 自动更新；`resolveRendererRoot()` 已为打包态留了 `resources/demo/dist` 这一路，但不是真打包验证过的。
- **dev server 地址按候选探测**：本机 Vite 只绑了 `[::1]:5173`（`netstat` 确认），写死 `127.0.0.1` 会 `ERR_CONNECTION_REFUSED`。`scripts/dev.mjs` 因此探 `localhost` / `127.0.0.1` / `[::1]` 三个候选。完整的 `npm.cmd run desktop` 没能实跑（5173 被已有的 dev server 占着，Vite `strictPort` 会直接退出），验证方式是拿这个 URL 直跑 Electron 的 dev 分支。
- **字体能力还没接进 UI**：`listSystemFonts()` 与 `local-fonts` 权限都已就绪，样式面板仍读的是 `apps/demo/src/lib/typePresets.ts` 里那份人工清单。下一步是让下拉「内置字体 / 本机字体」分组，并把回退链降级成进阶项。
- **导出仍走浏览器打印**：还没有改用 `webContents.printToPDF`；文件写入的 File System Access API 在壳里的行为也还没实测，`apps/demo/src/lib/document.ts` 的回落分支是否被走到需要确认。
- **枚举精度**：注册表值名去 `(TrueType)` 后缀、拆 `A & B`、去 `@` 前缀都是启发式；本地化家族名（微软雅黑 / Microsoft YaHei）可能与 Chromium 的匹配名不一致，真正的对齐要靠 `queryLocalFonts()`。
- **沙箱外才能跑**：GUI 进程在主机的文件沙箱里会 `0xC0000005` 崩溃，日常开发与自检都需要提升权限执行。
- **`MainWindowHandle` 不能用来判断窗口是否显示**：主窗口与 detached DevTools 同属一个进程时它只报一个，排查中据此误判过一次「窗口没出来」。确认可见性用 `EnumWindows`（PID + 标题）或直接问用户。
- **`spawn('npm.cmd', ...)` 会被 Node 拒绝**：v20.12 / v18.20 起不开 shell 启动 `.cmd` 直接 `spawn EINVAL`，开 shell 又会让 Ctrl+C 留下 Vite 孤儿进程。三个脚本改成用 `process.execPath` 直接跑 `vite/bin/vite.js`。
