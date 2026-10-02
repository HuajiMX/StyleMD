# M0 渲染内核技术验证结论

日期：2026-09-30 ｜ 关联规划：[2026-09-30-stylemd-development-plan.html](2026-09-30-stylemd-development-plan.html) §5 D1、§10 M0

## 结论摘要

| 待验证项 | 结论 | 证据 |
|:---|:---|:---|
| Chromium + Paged.js 能否产出真实分页 | **成立** | 示例文档在预览中切成 2 页纸，状态栏报「Paged.js 已分页：2 页」 |
| 样式模型驱动 CSS 是否可行 | **成立** | 改字号 20pt → 26pt，预览中 `[data-role="heading-1"]` 的计算样式同步变化；切样式包后字号变 18pt，编号与首行缩进同时生效 |
| 一套模型能否覆盖中文论文版式 | **基本成立** | 三线表、首行缩进 2 字符、固定行距 22pt、黑体标题 + 宋体正文、`第{n}章` 自动编号都能由样式包表达 |
| 导出 PDF 是否可用 | **成立（两条路径）** | 原生分页与 Paged.js 两条 HTML 都能导出 2 页 PDF（587 KB / 474 KB） |
| 页眉页脚由谁负责 | **倾向 Paged.js，待 PDF 目视确认** | 原生路径的 `@page` 页边距盒在 DOM 中不产生任何元素（0 个），Paged.js 生成 80 个页边距元素 |

## 关键发现

### 1. 页边距盒（页眉页脚）是原生打印的薄弱点

原生路径的 HTML 里确实存在 `@page { @top-center { … } }` 规则，但页面 DOM 中没有任何对应元素。
这与既有认知一致：Chromium 的 `@page` 实现主要覆盖 `size` / `margin`，页边距盒属于 CSS Paged Media 的
进阶部分，需要 Paged.js 这类 polyfill 把它物化成真实元素，或者改用 `printToPDF` 的
`headerTemplate` / `footerTemplate`（但那样就必须放弃 CSS 侧的样式控制）。

**后续动作**：M0 收尾前用打印对话框导出的 PDF 做一次目视核对，确认「Paged.js 画的页眉页脚会被打进 PDF」。
这条结论决定 D4（Paged.js 还是原生分页）的最终取舍。

### 2. 内联脚本有两个必踩的坑（本轮都踩到了）

- **`String.replace` 的替换串会被当作模式展开**：把 944 KB 的 polyfill 拼进 HTML 时，脚本里出现的
  `$'` 被解释成「匹配之后的全部内容」，导致脚本在 `hack !== '` 处被截断、整段注入失效。
  必须改用函数式替换 `html.replace(x, () => payload)`。
- **`</script` 与 `<!--` 会破坏内联脚本**：必须转义成 `<\/script` / `<\!--`（这两处只可能出现在
  字符串或正则里，转义后语义不变）。

这两个坑都不是「想一想就能避开」的，正好说明为什么 M0 要先跑通最小通路再谈产品化。

### 3. 分页是异步的，UI 不能拍固定延时

最初用 `setTimeout(400)` 判断分页是否完成，结果状态栏在长文档上会撒谎（显示 1 页其实还在排）。
改成轮询 + 连续 3 次页数不变才落定之后，状态栏才开始可信。

### 4. 角色统计会把容器与内部段落各算一次

`::: abstract` 既给容器（负责边框底纹）也给内部段落（负责文字）打了角色，因此统计里显示 `abstract×2`。
语义上没错，但显示层最好合并计数，属于 UI 待办。

## 本轮未验证（留待后续）

- 300 页长文档的分页耗时与内存占用（需要更大的样本）。
- 表格跨页表头重复、图片不被拆分、标题孤行、脚注跨页。
- 中文字体子集嵌入与 PDF 文本可复制性（需要在真实导出流程里核对）。
- Chromium 原生打印与 Paged.js 两条路径的像素级一致性（视觉回归尚未搭建）。

## 可复现命令

```powershell
npm.cmd test                      # 63 个单元测试
npm.cmd run typecheck
npm.cmd run build
node e2e/smoke.mjs                # 10 项端到端检查，含预览刷新、样式包切换与缩放同步
npm.cmd run cli -- render examples/sample-thesis.md --theme thesis-cn --out e2e/artifacts/sample-native.html
npm.cmd run cli -- render examples/sample-thesis.md --theme tech-document --out e2e/artifacts/sample-paged.html --paged
node e2e/export-check.mjs         # 生成 PDF 并核对页眉页脚元素
```
