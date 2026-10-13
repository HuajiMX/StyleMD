# 首屏预览分页失败：定位与修复记录

日期：2026-10-13 ｜ 关联约束：架构约束 3「预览与导出共用 `build()` 产出的 HTML」、AGENTS.md「预览双画布」与「桌面壳约定」

## 现象

项目刚重启后第一屏，底部状态栏显示「分页失败」，动一下鼠标 / 点一下窗口才恢复。

## 改动前：两条来源长得一模一样

| 来源 | 位置 | 当时的表现 |
|:---|:---|:---|
| iframe 里真抛了异常 | `packages/renderer-paged/src/index.ts` 生命周期脚本的 `catch` | `reveal()` + `report('error', 0)`，**异常原文被整个吞掉**（没有 `console`，上报里也不带原因） |
| 宿主自己那份 60 秒兜底计时 | `apps/demo/src/App.tsx` 的 `setTimeout(() => setPagedStatus('error'), 60000)` | 一句上报都没收到就判失败，界面文案与上面那条完全一样 |

整条排版链都靠 `requestAnimationFrame` 推进（`stabilizeTableLayouts()` 等帧、`PagedPolyfill.preview()` 每排一页等一帧、上报前再等两帧），而全仓库没有任何可见性处理，`backgroundThrottling: false` 只写在导出 PDF 的隐藏窗口上。

## 实测结论：两条路都真实存在，而且抓到了一条真异常

**不是二选一。**加了可观测性（catch 里 `console.error` + 上报带 `message`）之后，端到端里**真的抓到过一次异常**，原文与堆栈：

```
[stylemd] 渲染失败 TypeError: Cannot read properties of null (reading 'getBoundingClientRect')
    at new Layout (about:srcdoc:1990:50)
    at Page.layout (about:srcdoc:2911:24)
    at Chunker.layout (about:srcdoc:3673:29)
    at async Chunker.renderAsync (about:srcdoc:3592:17)
```

`about:srcdoc:1990` 对应 `node_modules/pagedjs/dist/paged.polyfill.js` 的 `Layout` 构造函数第 1407 行：
`this.parentBounds = this.element.offsetParent.getBoundingClientRect();` —— `offsetParent` 是 `null`。

紧接着打出来的现场（临时诊断，已删）：

```json
{"found":true,"offsetParentNull":true,
 "chain":["DIV.pagedjs_page_content d=block v=visible cv=visible","DIV.pagedjs_area d=block v=visible cv=visible",
          "DIV.pagedjs_pagebox d=grid v=visible cv=visible","DIV.pagedjs_sheet d=grid v=visible cv=visible",
          "DIV.pagedjs_page pagedjs_first_page pagedjs_right_page d=block v=visible cv=visible",
          "DIV.pagedjs_pages d=block v=visible cv=visible","BODY.stylemd-document d=block v=visible cv=visible","HTML. d=block v=visible cv=visible"],
 "pagesInDoc":true,"state":"visible","pages":1,"innerWidth":0,"docWidth":0,"bodyWidth":0,"readyState":"complete"}
```

计算样式一路 `display: block/grid`、`visibility: visible`，可 `offsetParent` 是 `null`、`innerWidth / clientWidth / bodyWidth` **全是 0**。

### 用最小实验把这条机制钉死

`visibility: hidden` / 移到屏幕外 / `display: none` 三种 iframe 各量一遍（Chromium 143，Playwright）：

| iframe 状态 | 子文档里的 `offsetParent` | `clientWidth` / 元素宽 | `requestAnimationFrame` |
|:---|:---|:---|:---|
| 正常 | 有 | 正常（200 / 120） | 照常回调（约 250 帧 / 1.5 秒） |
| `visibility: hidden` | 有 | 正常（200 / 120） | 照常回调 |
| 移到屏幕外 | 有 | 正常（200 / 120） | 照常回调 |
| `display: none` | **null** | **0** | 照常回调（约 248 帧） |

也就是说：**「这一帧不渲染」时布局整个是空的，可 rAF 还在跑**——这时硬开排，Paged.js 一定在 `new Layout` 上炸。

再用真产物做一次确定性对照（把 demo 真跑出来的 iframe `srcdoc` 塞进一个 `display: none` 的 iframe，跑完再把 `display` 改回 `block`）：

| 版本 | 藏着时 | 露出来之后 |
|:---|:---|:---|
| 门开着（本次修复） | `pending`（**根本没开跑，也没抛错**） | `paged`，2 页 |
| 把门短路（改动前的行为） | `error`（上面那条 `TypeError`） | 仍然 `error`，1 页 |

### 两条路各自对应什么

- **宿主自己不可见**（窗口被别的窗口完全遮住 / 标签在后台 / 桌面壳还在 `show: false` 阶段）：Chromium 会停下这一帧的 rAF，分页一页也推进不了。这时宿主那份 60 秒计时到点 → 「分页失败」；用户一动（窗口回到前台、rAF 恢复）就好——**与「动一下才恢复」这个描述完全对得上**。
- **文档没有布局**（画布被从宿主摘下来、或整块 `display: none`）：量什么都是 0，硬跑会抛上面那条 `TypeError`。原先它被 `catch` 吞掉，界面上一句「分页失败」看不出是哪一条。

## 改动

| 位置 | 改动 |
|:---|:---|
| `packages/renderer-paged/src/index.ts` | ① `catch` 里 `console.error('[stylemd] 渲染失败', error)`，并 `report('error', 0, message)` 把原文带给宿主（字段可选，协议向后兼容）；② 把 `fonts.ready → stabilizeTableLayouts → installHook → preview()` 收进 `runPagination()`，外面套一道 `beginPagination()` 的门；③ 量列宽的等待循环封顶「帧数 + 约 3 秒墙钟」 |
| `apps/demo/src/App.tsx` | `pagedStatus` 加 `timeout` 一档；60 秒兜底计时**不可见时不挂表、回到可见时从零重计**；收到失败原因记 `console.error` 并挂到状态栏 `title` |
| `apps/demo/src/components/StatusBar.tsx` | 文案拆开：`error` → 「渲染失败」，`timeout` → 「排版超时」（原来两句共用「分页失败」） |
| `apps/desktop/src/main.ts` | 主窗口 `webPreferences` 加 `backgroundThrottling: false`（与导出隐藏窗口同一条理由） |
| `apps/desktop/src/pdf.ts` | 导出等待里把上报的原因带进抛出的错误（`文档渲染失败：<原文>`） |
| `e2e/smoke.mjs` | 新增「刷新后首屏仍能自己排完」「正常流程不出现『排版超时』/『渲染失败』」「画布没有布局时不分页、露出来以后仍能排完」三条；控制台错误带上「上一步跑到哪」，中途挂掉也把已收到的控制台错误打出来 |
| `packages/renderer-paged/test/lifecycle.test.ts` | 新增：门里同时有可见性与布局判断、循环里同时有帧数与时间上限、失败分支带 `console.error` 与上报原因 |

### 门的两道判断（都在 `beginPagination()` 里）

```js
if (document.visibilityState === 'hidden') {        // ① 不渲染（rAF 停摆）→ 等 visibilitychange
  document.addEventListener('visibilitychange', beginPagination);
  return;
}
if (document.documentElement.clientWidth === 0) {   // ② 还没有布局 → 拿 rAF 当心跳轮询
  requestAnimationFrame(beginPagination);
  return;
}
```

- 可见且已有布局时走的还是原来那条路（就多两次同步判断），时序一点没变。
- 桌面壳里主窗口与导出隐藏窗口都关了后台节流，两处都是「可见 + 有布局」，不会被门拦住（`desktop:smoke` 的导出 PDF 一栏守着）。
- 单靠 `visibilityState` 挡不住第 ② 种：实测 `visibility: hidden` / `display: none` 的 iframe 里 `document.visibilityState` **都是 `visible`**（子帧的可见性跟着顶层页面走）——所以这道布局判断必须单独写。

## 验证证据（都在本机跑过）

| 命令 | 结果 |
|:---|:---|
| `npm.cmd test` | 21 个文件 / **197 项全过** |
| `npm.cmd run typecheck` | 通过（`tsc --noEmit`，无输出） |
| `npm.cmd run build` | 通过（`dist/assets/index-*.js` 2.34 MB / gzip 758 kB，只有既有的 chunk 体积告警） |
| `node e2e/smoke.mjs` | **168 项全过**，含新增的三条；「运行期无控制台错误」也过（改动前这一条偶发失败，就是被 `Layout` 那条 `TypeError` 顶掉的） |
| `npm.cmd run desktop:smoke` | **19/19 通过**，含「导出 PDF 落盘成功」「导出 PDF 页数与预览一致」 |
| 确定性对照（临时脚本，已删） | 见上面那张两行表：门开着 `pending → paged 2 页`；门短路 `error → error` |

## 遗留：真机遮挡没能自动复现，要人手动确认一次

试了两条路，都没能把 `document.visibilityState` 变成 `hidden`：

| 试法 | 结果 |
|:---|:---|
| 有头 Chromium + 一个置顶黑窗口（1300×1000，盖住浏览器整块）在**加载前**盖好，15 秒后自动关掉 | 盖住期间 `visibilityState` 仍是 `visible`、`hidden: false`，首屏一次就排完（第 1 页，共 2 页），无控制台错误 |
| 无头 Chromium 里开第二个标签并 `bringToFront()` 把 demo 标签切到后台 | 后台标签里 `visibilityState` 仍是 `visible`，状态栏照常是「第 1 页，共 2 页」 |

所以「用终端把浏览器窗口完全遮住」这一步**在本机没自动复现**——无头模式没有标签页可见性，有头这一次 Chromium 也没把被遮住的窗口判成 hidden（可能是这个会话里的窗口没真正进前台）。也就是说：

- **第 ② 道门（没有布局）**有确定性对照 + e2e 断言双重证据（见上）；
- **第 ① 道门（不可见）**目前只有单测（片段里有 `visibilityState` / `visibilitychange` / `paginationStarted`）与推理支撑：rAF 在隐藏页上不跑是 Chromium 既有行为，导出的隐藏窗口正是为它关掉 `backgroundThrottling`（AGENTS.md「导出 PDF」那条）。

人工步骤（需要真人坐在机器前）：用终端把浏览器窗口（或桌面壳窗口）完全遮住，重启 `npm.cmd run dev`，等首屏加载完再把窗口切到前台——状态栏应当**直接从「正在渲染…」变成「第 1 页，共 N 页」**，中间不出现「分页失败 / 排版超时」，也不需要动鼠标。顺手可以看一眼 `document.visibilityState`：如果被遮住时它仍是 `visible`，那说明这条触发条件在这台机器上压根不成立（那才是需要另找线索的信号）。

## 附带发现（未在本轮修）

端到端在**文件沙箱里**跑时会出现丢输入事件式的偶发失败（`Ctrl+滚轮` 改字号等不到、`取消` 点不动），控制台一条错都没有；同一个命令在沙箱外连跑两轮都是 168/168。同一环境下 `node -e "require('os').userInfo()"` 会稳定报 `uv_os_get_passwd ENOMEM`（`npm.cmd run cli` 因此跑不起来）。这两件事都指向沙箱本身，不是应用代码。
