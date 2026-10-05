# 桌面端「直接导出 PDF」实施记录

日期：2026-10-05 ｜ 关联约束：架构约束 3「预览与导出共用 `build()` 产出的 HTML」、AGENTS.md「桌面壳约定」

## 目标

桌面壳里点「导出 PDF」不再走 `window.print()`——Electron 没有浏览器那套打印预览，这条路在壳里
既不可靠也不可控。改成：**主进程直接生成 PDF，再用系统保存框问用户存到哪里**。

## 改动前的样子

- 渲染进程 `handlePrint` 给正在显示的预览 iframe 发 `stylemd:print`，iframe 里 `window.print()`。
- 预览是宿主文档里的一块 iframe，而 `printToPDF`／`webContents.print` 打的是**整个 webContents**，
  没有「只打某一个 iframe」这种能力。
- 分页（页眉页脚、跨页表格分片、题注与被注对象同页）全在 Paged.js 里完成，导出必须跑同一套，
  不能让 Chromium 的原生 `@page` 分页另起一条路径。

## 决策与取舍

| 待定项 | 选择 | 理由 |
|:---|:---|:---|
| 在哪儿渲染 | 主进程开一个隐藏 `BrowserWindow`，加载 `stylemd://export/<token>` | 拿到一份干净的、和预览完全同源的分页结果；宿主文档的编辑器、状态栏、两块画布都不会混进去 |
| HTML 怎么传 | 自定义协议 + 内存 token 表（`pdf.ts`） | `data:` URL 有几 MB 的长度上限；写临时文件等于把「离线导出」落了一次盘，还要处理清理 |
| 等到什么时候 | 轮询隐藏窗口里的 `window.__stylemdPaged.status` | 隐藏窗口里 `window.parent === window`，预览脚本不会回 postMessage，宿主只能主动问 |
| 隐藏窗口的节流 | `backgroundThrottling: false` | 隐藏窗口的 `requestAnimationFrame` 会被限流，而 Paged.js 每排一页都要等一帧——十页的文档会从一秒拖到十几秒（预览那边用「压在显示画布上面」解决的是同一个问题） |
| 纸张与页边距 | `preferCSSPageSize: true` + `margins: 0` | 纸张尺寸和页边距都由主题编译出的 `@page` 决定（Paged.js 的页眉页脚盒也在里面）；Chromium 这一层再来一次默认页边距，整页内容会整体往里缩一圈 |
| 保存框与渲染的顺序 | 先弹保存框，再渲染落盘 | 渲染要一两秒；让保存框等着，比让用户点完按钮半天没反应强 |
| 默认文件名 | 标题栏的文件名主名（`fileStem`），目录用 `app.getPath('documents')` | 与「保存 / 另存为」的名称逻辑一致；渲染进程只拿得到句柄名、拿不到目录，凭据不足就别猜路径 |
| 落盘位置的可信度 | 渲染进程只交 `html` + `suggestedName`，主进程按不可信输入处理 | 建议名里的路径分隔符会被洗掉，不能让渲染进程借它把默认目录带跑 |

## 代码落点

| 位置 | 改动 |
|:---|:---|
| `apps/desktop/src/bridge.ts` | 新契约 `PdfExportRequest` / `PdfExportResult`、新频道 `stylemd:pdf:export` |
| `apps/desktop/src/preload.ts` | 薄桥新增 `exportPdf()`（渲染进程仍然拿不到 `ipcRenderer`） |
| `apps/desktop/src/pdf.ts` | 新增：token → HTML 的协议分支、隐藏窗口分页等待、`printToPDF` |
| `apps/desktop/src/main.ts` | 协议处理器加 export 分支、`ipcMain.handle(exportPdf)`（保存框 / 自检直写临时文件）、自检新增 4 项断言 |
| `apps/demo/src/lib/desktop.ts` | 新增：渲染进程侧的桥类型与 `desktopBridge()` / `canExportPdfDirectly()` |
| `apps/demo/src/lib/fontCatalog.ts` | 字体那两处 `window` 断言改用共享的 `desktopBridge()` |
| `apps/demo/src/App.tsx` | `handlePrint` 分两条路：桌面壳交 HTML 给主进程；浏览器里仍旧 `stylemd:print` → `window.print()` |
| `apps/demo/src/components/Ribbon.tsx` | 桌面壳里按钮文案改成「导出 PDF」（浏览器版仍是「打印 / 导出 PDF」） |

## 验证证据

以下命令在本机 Windows + Node v24.11.1 + Electron 44.5.1 上实际执行：

| 命令 | 结果 |
|:---|:---|
| `npm.cmd run typecheck` | strict `tsc --noEmit` 通过 |
| `npm.cmd test` | 18 个测试文件、**153 项全部通过** |
| `npm.cmd run build` | Vite 构建成功（2.30 MB，gzip 747 kB） |
| `npm.cmd run desktop:smoke` | **SMOKE OK (13/13)**（沙箱外执行）：桥开了 PDF 导出通道、按钮文案已是「导出 PDF」、导出落盘成功、**导出 PDF 页数与预览一致（2 = 2）**；实际产物 526,048 字节 / 2 页 |
| `node e2e/smoke.mjs` | **103/103 通过**（demo UI 未受影响，新增 1 项：浏览器版导出按钮仍是「打印 / 导出 PDF」） |
| `node e2e/export-check.mjs` | 与改动前一致：Paged.js 路径 2 页 / 498 KB、打印态工具栏隐藏且分页缩放置 1 |

导出产物本身的核对（不走结论、直接看数字）：

- 用 Electron 自带的 PDF 阅读器把导出的 PDF 画出来截屏核对：2 页、白底、无灰底外壳、无屏幕缩放残余、标题与表格正常。
- 解开 PDF 的内容流量内容盒：第一笔绘制落在 x=68px（=18.00mm），内容宽 658px（=174mm）；
  与该预设的 `@page { margin: 18mm }`、页宽 210mm 完全对得上 —— 说明页边距只来自 CSS，
  Chromium 没有在打印参数里再叠一层默认页边距。

## 已知限制与后续

- **只在 Windows 上实测**：`dialog.showSaveDialog` 与隐藏窗口这条路在 mac / Linux 上未实测。
- **导出中只有按钮置灰**：没有进度提示，分页失败会以 `window.alert` 报错；长文档导出时用户看不到进度。
- **没有导出选项**：页范围、是否带页眉页脚、压缩率之类的选项都没有做。
- **打包态未验证**：`resolveRendererRoot()` 已为 `resources/demo/dist` 留了分支，但真打包（asar）后隐藏窗口还能不能走 `stylemd://export/...` 没有实测过。
- **浏览器版仍是打印对话框**：这条路只在检测到 `window.stylemdDesktop.exportPdf` 时启用，Web 版行为不变。
