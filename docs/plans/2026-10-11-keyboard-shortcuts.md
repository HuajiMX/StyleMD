# 键盘快捷键（含桌面端 Ctrl+S 保存）

日期：2026-10-11 ｜ 关联：AGENTS.md「UI 约定（apps/demo）」「桌面壳约定（apps/desktop）」、
[文件菜单与自动保存](2026-10-04-file-menu-and-autosave.md)

## 需求

桌面端要能按 Ctrl+S 保存；顺带把「一份文档编辑器还该有哪些键」定下来。

## 为什么不做成 Electron 的菜单加速键

桌面壳在 Windows / Linux 上 `Menu.setApplicationMenu(null)` 去掉了默认菜单栏（macOS 保留，否则
Cmd+C / Cmd+V 一起没），加速键没有宿主可挂。而**渲染进程自己听 `keydown` 在两个环境里都成立**：
浏览器里同样能用，一条实现管两处，也不必为桌面壳另起一套。

Chromium 不会替我们处理 Ctrl+S / Ctrl+P（那是 Chrome 浏览器层的命令，Electron 里没有这两个），
这两个键会原样送到页面上；Ctrl+= / Ctrl+- / Ctrl+0 的整页缩放属于浏览器默认行为，由
`preventDefault` 拦掉。所以 `apps/desktop/src/main.ts` 一行都不用改，只在自检里加了一条断言。

单点定义在 `apps/demo/src/lib/shortcuts.ts`：「有哪些键」只写在 `SPECS` 这一张表里，
菜单上的提示文案（`acceleratorLabel`）与 `aria-keyshortcuts` 都从这张表取，加一条不会漏掉某一处。

## 快捷键清单

| 键 | 动作 | 接在哪儿 |
|:---|:---|:---|
| `Ctrl+S` | 保存（写回打开的文件；没有句柄就按另存为） | `handleSaveDocument` |
| `Ctrl+Shift+S` | 另存为 | `handleSaveDocumentAs` |
| `Ctrl+O` | 打开 Markdown | `handleOpenDocument` |
| `Ctrl+N` | 新建（空白文档骨架） | `handleNewDocument` |
| `Ctrl+P` | 打印 / 导出 PDF（桌面壳里直接出 PDF；浏览器里是预览的 `window.print()`） | `handlePrint`，与按钮共用 `canPrint` 这道闸 |
| `Ctrl+=` / `Ctrl+Shift+=` | 放大预览 | `stepZoom(+1)` |
| `Ctrl+-` | 缩小预览 | `stepZoom(-1)` |
| `Ctrl+0` | 预览缩放回到 100% | `setZoom(1)` |
| `Ctrl+滚轮` | 指针在编辑器上改**编辑器字号**，在预览上等于 `Ctrl+=` / `Ctrl+-` | 宿主 `wheel` 监听 + 预览转发 `stylemd:zoom-wheel` |

主修饰键 Ctrl 与 Cmd 都认（macOS 上两种习惯都常见），显示文案按平台给 `Ctrl+S` / `⌘S`。
带 Alt 的一律不认——有些键盘的 AltGr 会报成 Ctrl+Alt，抢下来会吃掉输入法组合键。
Shift 逐条对上，否则 `Ctrl+Shift+S` 会先撞上 `Ctrl+S`。

### 刻意没接的键

- **`Ctrl+Z` / `Ctrl+Y`**：编辑器是 CodeMirror，撤销栈在它自己手里（`historyKeymap`）；
  全局抢下来会让编辑器的撤销失灵。工具带上那个「撤销」只管样式包的改动，两套栈合不成一个。
- **`Ctrl+R` / `F5`**：在桌面壳里等于重载页面。关掉自动保存时按一下，没写盘的内容全丢。
- **`Ctrl+W`**：关窗口是外壳的事，不该由页面悄悄做掉。

### 浏览器与桌面壳的差别（真实按键，不是 Playwright）

`Ctrl+S` / `Ctrl+P` / `Ctrl+=` / `Ctrl+-` / `Ctrl+0` 在 Chrome 里都是「页面先拿到、preventDefault 就拦下」
这类命令，两边表现一致。`Ctrl+N` / `Ctrl+O` 在真实 Chrome 里会被浏览器自己吃掉（开新窗口 / 打开文件），
页面收不到——这两个键在桌面壳里才真正属于应用；浏览器里不生效也不比现在差（浏览器做的是它自己的事）。
Playwright 走 CDP 把按键直接送进渲染进程，验的是「按键到了页面上会做什么」，验不了这层浏览器仲裁。

## 顺带改掉的两处

1. **打开文件的入口收进 App**：隐藏的 `<input type=file>` 原在 `FileMenu` 里，只有菜单项能走到；
   `Ctrl+O` 也要走这条路，于是把它连同 `openMarkdownFile` 的调用一起搬到 `App.tsx`
   （`fileInputRef` + `pickWithInput` + `handleOpenDocument`），`FileMenu` 只剩「点一下，交给 App」。
   顺手让「打开…」跟其它命令一样，点完就收起面板。
2. **`Ctrl+P` 与按钮共用一道闸**：原先「能不能导出」的判断直接写在 JSX 的 `canPrint` 属性里，
   现在提成变量，快捷键也用它——排版没排完时按键不动作（按钮那时也是禁用的），不会把半成品 HTML 交出去。

## 界面上的提示

- 「文件」菜单每条命令右边写按法（`.file-item-keys`，右对齐靠 `.file-item-label` 撑满剩余宽度），
  同时挂 `aria-keyshortcuts`。片段带 `aria-hidden="true"`，菜单项的可访问名仍然是「保存」这种干净的名字。
  e2e 原来按整行文本断「菜单里有这几项」，现在改成读 `.file-item-label`，别退回整行文本。
- 「导出 PDF / 打印」按钮与状态栏那两个缩放按钮的 `title` 里也带上按法。

## 验证证据

本机 Windows (Node v24.11.1 / Electron 44.5.1) 实际执行：

| 命令 | 结果 |
|:---|:---|
| `npm.cmd test` | 21 个文件 / 194 个用例通过（新增 `apps/demo/test/shortcuts.test.ts` 8 项：匹配、Shift 区分、Alt 与无修饰键放过、显示文案、注入预览的键位表；`apps/demo/test/zoom.test.ts` 7 项：范围与步长、滚轮累积与余量；`renderer-paged` 的 `lifecycle.test.ts` 2 项守按键转发；纸张尺寸 3 项） |
| `npm.cmd run typecheck` | 通过 |
| `npm.cmd run build` | 通过 |
| `node e2e/smoke.mjs` | **165/165** 通过，新增 13 项：菜单右侧的快捷键提示与 `aria-keyshortcuts`、Ctrl+S 写回文件、Ctrl+Shift+S 弹选择框、Ctrl+= 放大、Ctrl+0 回到 100%、Ctrl+N 新建、Ctrl+O 打开并换标题栏文件名、焦点在预览 iframe 里时的 Ctrl+= 与 Ctrl+S、编辑器上 Ctrl+滚轮放大字号、行号字号跟着动、不带 Ctrl 的滚轮只滚动、字号写进会话、预览上 Ctrl+滚轮与 Ctrl+= 同步长 |
| `npm.cmd run desktop:smoke` | **19/19** 通过，新增：Ctrl+S 在桌面壳里走完保存（`shortcutSave: written:1439`）、放行 `fileSystem` 权限（见下） |

桌面壳那条断言把 `window.showSaveFilePicker` 换成假句柄再按键：真弹系统保存框的话自检会卡在对话框上。
换不掉就不按键，报 `cannot-stub` 而不是把自检挂死。

## Ctrl+滚轮（2026-10-13 补）

指针在**编辑器**上 → 改编辑器字号（9–24px，一档 1px）；在**预览**上 → 与 `Ctrl+=` / `Ctrl+-` 同一步长（一档 0.1）。
两处的范围与步长都收在 `lib/zoom.ts`，状态栏那两个按钮也改用它，免得下限各写一份、从按钮滑到底再按快捷键会跳一下。

三个要点：

1. **编辑器字号是 CSS 变量**（`--ed-font-size`，`.cm-scroller` 的主题引用它），所以改字号不用重建编辑器；
   改完要 `editorRef.current.remeasure()` —— 不请 CodeMirror 重量一次，滚动同步与大纲跳转还按旧行高算。
   字号随会话存（`editorFontPx`）。
2. **按累积量过 100px 才算一档**：鼠标滚一格正好 100px = 一档（与 `Ctrl+=` 同步长），
   触控板捏合一次会来几十条小事件，攒够才动一次、余量留着下次接着攒；编辑器与预览各一个累积器。
   宿主里除编辑器外一律 `preventDefault`（浏览器会拿 Ctrl+滚轮缩放整个界面）。
3. **预览那一片又要转发**：指针停在 iframe 里时宿主收不到 `wheel`（还是「另一个文档」那条），
   帧里拦下默认行为（**必须非被动监听**，被动监听里 `preventDefault` 是空的）再把滚轮量
   postMessage `stylemd:zoom-wheel` 给宿主，宿主按与快捷键相同的步长走。

顺带修掉一个真踩到的：**行号字号原来写死 `11.5px`**，Ctrl+滚轮只把正文放大、行号不动，
两边行高对不上就会错行；改成 `0.92em`（= 12.5px 下的 11.5px）跟着走，e2e 里有一条守着。

## 踩到的坑：桌面壳里「保存」写不进去

按 Ctrl+S 接上之后，桌面壳里弹出了系统保存框、选完位置却报
`保存失败：Failed to execute 'createWritable' on 'FileSystemFileHandle': The request is not allowed by the user agent
or the platform in the current context.`。根因不在保存代码：**File System Access 的读写权限也走 Electron 的
`setPermissionRequestHandler` / `setPermissionCheckHandler`**，而壳里那张放行表只有 `local-fonts` 与
`clipboard-sanitized-write`，于是被自己人挡下（`showSaveFilePicker` 能拿到句柄是因为保存框本身就是授权动作，
真正卡住的是随后的 `createWritable()`）。放行 `fileSystem` 即可，判定收进 `isPermissionAllowed()`，
自检里有一条守着这张表。详见 [Electron 壳笔记](2026-10-04-electron-shell.md) 的「已知限制与后续」。

## 踩到的坑二：点过预览之后快捷键失灵

现象：先点一下编辑器或大纲，Ctrl+= / Ctrl+- 正常；先点一下预览区域，再按就毫无反应。

根因不是缩放代码：**宿主与预览 iframe 是两个文档**。点过预览之后焦点落在预览那个文档里，
键事件只在那个文档里派发与冒泡，宿主 `window` 上的 keydown 监听器一个字都收不到——
这跟「指针进了预览，父文档收不到鼠标事件」是同一件事，只是那次用 `stylemd:pointer` 绕过去了。

解法沿用同一套：键位表由宿主注入预览（`previewShortcuts()` → `injectPagedPolyfill` 的第 4 个参数），
预览在 `keydown` 里就地认一遍，认出来 `postMessage({ type: 'stylemd:shortcut', id, shortcut })` 转回宿主，
宿主用同一个 `runShortcut(id)` 跑同一份处理函数——表与动作都只有一份。
两个必须守住的细节：

1. **帧里必须同步 `preventDefault()`**：等宿主的回执再拦就晚了，Chromium 收到 keydown 之后会立刻把
   Ctrl+= / Ctrl+- / Ctrl+0 当成整页缩放执行掉。
2. **只拦表里有的组合**：Ctrl+C / Ctrl+A 留给预览自己——预览里的文字要能选中、复制，
   一刀切成「带 Ctrl 就拦」会把它们一起吃掉。

顺带修好的：焦点在预览里时 Ctrl+S / Ctrl+P 也没反应，现在一并转回来了。

