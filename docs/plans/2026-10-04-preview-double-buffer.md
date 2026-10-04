# 预览双画布：改动不闪、滚动不回文首

日期：2026-10-04 ｜ 关联：AGENTS.md「UI 约定 · 预览双画布」「滚动同步」、[开发规划](2026-09-30-stylemd-development-plan.html)

## 问题

打一个字、改一处样式都会重排预览。原来的预览只有一块 iframe，`srcDoc` 一换就整篇重新加载：

1. 旧渲染立刻被清空，新内容要等字体、表格列宽、Paged.js 分页跑完才出现——中间是一段空白，看着就是「闪一下」；
2. 换内容后滚动位置回到文首，等分页完成再由宿主把进度 postMessage 回去，又是一次可见的跳动。

两件事都是「先删后建」导致的，光靠加防抖不能消掉。

## 方案：两块画布轮流上前

`apps/demo/src/components/PreviewPane.tsx` 里放两块 iframe，在同一位置叠着。每块有三种身份，对应三个类：

- `.preview-iframe`：正在显示的那块，留着旧渲染（不换 `srcDoc`）；
- `.preview-iframe-incoming`：正在分页的那块，新一版内容在这里先排；
- `.preview-iframe-spare`：备用那块，不画。

`App.tsx` 持有 `frames = { a, b }` 与 `activeSlot`，维护两条规则：

1. 新一版渲染（新的 `previewId`）写进**另一块**；首屏没有内容时才填正在显示的那块。
2. 那块报 `stylemd:pagination` 且 id 就是当前这版时，只改 `activeSlot`——**换的是层级，不是文档**，两块 iframe 都不重新加载，所以没有空白期。

旧的那块留下来当备用画布，下一轮复用。

### 为什么分页那块必须压在最上面（这条最关键）

最初的做法是「分页那块在下」，结果正文一长就慢得离谱：15KB、18 页的文档要 8–15 秒，而同一份 HTML 在顶层页面里只要 0.3 秒。

原因是**浏览器会限流看不见的 iframe**：被完全遮住、`display:none`、`visibility:hidden`、移出屏幕的跨源 iframe，`requestAnimationFrame` 会被压到 1 帧/秒。Paged.js 的 chunker 每排一页都要等一帧（`this.tick = requestAnimationFrame`），18 页就正好是十几次等待。探针实测：被遮住那块 `rafGapMax` 正好 1000ms，可见那块 16ms；定时器不受这条限流影响（最大延迟 93ms），中招的只有 rAF。

所以正在分页的那块改成：**压在最上面（`z-index: 5`）且元素本身可见**，靠预览文档自己把内容藏起来（生命周期一进来就 `documentElement.style.visibility = 'hidden'`，分页结束再露）。元素没被遮住 → 不限流；内容没画 → 用户看到的还是下面那块旧渲染。这条只能用「元素可见 + 内容透明」绕：`opacity: 0` 一样被判成不可见（试过，还是 8 秒）。

配套时序：新文档要**加载完**（iframe 的 `load`，此时它已经开始藏内容）才把它抬成 `incoming`，而且只有 `spec.id === previewId` 的那块能抬（预览重新挂载时备用画布也会重新加载，抬错了会把更早一版露到最上面）。分页结束、内容露出来之后才上报 `paged`，宿主那时再改 `activeSlot`。

非显示的两块都设 `pointer-events: none`：`incoming` 压在最上面，要是能命中，滚轮、悬停、拖分隔条就全落到一个用户看不见的文档里去了。

### 藏在上面还会踩两个坑（连拍截图才看出来）

把分页那块压在最上面之后，分页快了，但连拍预览区截图发现有约 100ms 的空白——两个原因都得堵：

1. **文档不透明会把下面那块画布「遮」掉**：只要预览文档还被判定成不透明，合成器就会认为下面那块正在显示的画布被完全遮住，连它的绘制一起丢掉，用户看到的是灰底。所以 `conceal()` 除了 `visibility: hidden`，还要把 `html` / `body` 的背景清成 `transparent`（`reveal()` 一并还原），让那块画布不被当成遮挡物。
2. **新内容还没画出来就换层级**：`report('paged')` 会让宿主把旧画布藏起来；长文档的首次绘制要光栅化一阵，藏早了同样会闪灰底。所以 `reveal()` 之后先等两帧（`requestAnimationFrame` ×2）再上报。

判定方式：改一次正文，每 30ms 连拍一次预览区，截图字节数一旦掉到空白基线（约 4k，正常约 59k/126k）就算闪。修完连拍全程都是正常值。

### 第三个坑：原生滚动条不受 `visibility: hidden` 管

用户反馈「滚动条会跳一下」。把预览区最右侧那条滚动条连拍成联络图（Playwright 默认带 `--hide-scrollbars`，要 `ignoreDefaultArgs` 去掉才看得到）后，看到拇指在改动的瞬间被拉长又弹回——那是分页那块画布的滚动条：它的文档在分页途中高度从 9271 一路变到 10803，原生滚动条的拇指就跟着一涨一缩。

先前以为 `html { visibility: hidden }` 会把滚动条一起藏掉，用最小页面专门验了一下：**内容确实不画了，但原生滚动条照画**（换成自定义 `::-webkit-scrollbar` 才跟着藏）。它是画在图层上的原生控件，不受元素可见性影响，父层给 iframe 设 `visibility: hidden` 倒是能挡住。

修法：`conceal()` 里再加 `scrollbarColor = 'transparent transparent'`，`reveal()` 清掉。只涂透明、不做 `scrollbar-width: none`，这样滚动条**占位不变**，露出时版面宽度不动（否则居中会横跳几像素）。最小页面验证：涂透明后滚动条不画了，`innerWidth - clientWidth` 仍是 15，占位没变。

## 滚动位置：在分页结束前就恢复好

宿主在 iframe 的 `onLoad` 就把缩放与「当前进度」发过去（`handleFrameLoad`）。这时页面还没排出来，滚不动，所以
`packages/renderer-paged` 的生命周期脚本改成：

- 收到 `stylemd:scroll` 先记进 `desiredScroll`，再尝试滚一次（能给实时预览用）；
- 分页跑完、页面有高度之后再按 `desiredScroll` 补一次（同样是程序化滚动，用 `applyingScroll` 压掉上报），**然后才** `report('paged')`。

于是新一轮画布露面的那一刻就已经停在原来的位置，不会先回文首再跳回来。宿主侧还留了一条兜底：`readyId === previewId` 时再补发一次进度，值相同，再滚一次也不会跳。

宿主只把**正在显示**那块的上报同步回编辑器（背面那块是被程序滚过去的，不能反过来推编辑器）；编辑器滚动则同时发给两块，背面那块才能记住该停在哪。

宿主的类名由状态推出来：`slot === activeSlot` → `.preview-iframe`，`slot === incomingSlot` → `.preview-iframe-incoming`，其余 → `.preview-iframe-spare`。

## 两个必须守住的细节

- **分页那块要压在最上面且元素可见**（见上）。
- **非显示的两块不能接指针**：`pointer-events: none`。拖分隔条时显示那块会被设成 `pointer-events: none`（见 `lib/dragResize.ts`），上面那块要是还能命中，指针就落进 iframe 文档，父文档收不到 `pointermove`，拖动会断在半路（实测踩到过）。

## 验证

- `npm.cmd test`（132 用例，新增 `packages/renderer-paged/test/lifecycle.test.ts` 钉住「藏三样 / 还原 / 露完再上报」的顺序）、`npm.cmd run typecheck`、`npm.cmd run build` 通过。
- `node e2e/smoke.mjs` 92/92。新增五项：预览用两块画布；重排时分页画布确实进过 `.preview-iframe-incoming`；重排全程预览不掉回文首（实测 1125px → 最低 1114px）；重排全程预览区截图不空白（58986 → 最小 58774 字节，空白约 4k）；显示态滚动条样式已还原；切回双栏不会把更早一版露在最上面。
- 速度（15KB / 18 页）：从按下按键到预览更新 **8570ms → 约 610ms**（分页 8100ms → 约 260ms）；短样例仍在 300ms 内。开发模式（StrictMode）下同样验证过：滚动不回文首、不空白、拖分隔条正常。
- 滚动条：改一次正文，把预览区最右侧连拍 31 张拼成联络图，修前拇指在分页途中被拉长再弹回，修后 31 张完全一致。
