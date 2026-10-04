# StyleMD

A visual style manager for Markdown → PDF, with Word-like style configuration for headings,
paragraphs, lists, tables, images and pages.

目标很直接：把 Markdown 的排版样式做成 **可视化配置**——在面板里点选「一级标题 / 正文 / 列表 / 图题」这类结构角色，
直接调字体字号、颜色、边框底纹、缩进行列距，右侧分页预览即时刷新，导出的 PDF 与预览一致。

当前状态：**可运行的原型（M0/M1 垂直切片）**。规划与决策记录见
[docs/plans/2026-09-30-stylemd-development-plan.html](docs/plans/2026-09-30-stylemd-development-plan.html)，
本轮技术验证结论见 [docs/plans/m0-render-spike-findings.md](docs/plans/m0-render-spike-findings.md)。
2026-10-01 的全仓库审查与加固记录见 [docs/plans/2026-10-01-review-and-hardening.md](docs/plans/2026-10-01-review-and-hardening.md)。

## 快速开始

```powershell
npm.cmd install          # PowerShell 禁用了 npm.ps1，统一用 npm.cmd
npm.cmd run dev          # 打开 http://localhost:5173
```

其它命令：

```powershell
npm.cmd test              # 单元测试（样式继承、CSS 编译、渲染、校验、迁移、安全边界）
npm.cmd run typecheck     # TypeScript 严格模式检查
npm.cmd run build         # 构建 demo（输出 apps/demo/dist）
npm.cmd run build:math-css # 重新生成内联公式字体样式（升级 katex 后必须跑）
node e2e/smoke.mjs        # 端到端冒烟：用本机 Chromium 验证「改样式 → 预览更新」
node e2e/export-check.mjs # 导出路径检查：生成 PDF 并核对页眉页脚
```

命令行（无需图形界面，证明核心库与宿主无关）：

```powershell
npm.cmd run cli -- themes
npm.cmd run cli -- render examples/sample-thesis.md --theme thesis-cn --out out.html
npm.cmd run cli -- render examples/sample-thesis.md --theme tech-document --out out-paged.html --paged
npm.cmd run cli -- check my-theme.json
```

## 仓库结构

```
packages/theme-schema    样式模型：类型、角色注册表、校验、版本迁移（纯数据，无 CSS 字符串）
packages/core            渲染内核：解析 → 角色化 → 样式解析 → HTML → CSS（无 UI、无宿主依赖）
packages/presets         内置样式包：技术文档 / 中文学位论文
packages/editor-theme    编辑器配色：14 个色槽、5 套预设、色值校验、对比度计算、版本迁移（纯数据）
packages/renderer-paged  Paged.js 集成（纯字符串进、纯字符串出）
apps/demo                浏览器工作台：源码（CodeMirror 6）/ 分页预览 / 样式检查器（React + Vite）
apps/cli                 命令行入口（tsx）
e2e                      Chromium 端到端冒烟与导出检查
examples                 示例文档
docs/plans               开发规划与 M0 验证结论
```

## 三条架构约束

1. **核心库不依赖 UI 与宿主**：`packages/core` 是纯函数式的「输入 → 输出」，因此 CLI、CI、未来的桌面壳都能复用。
2. **样式模型不含 CSS 字符串**：所有属性用结构化字段表达，CSS 只是编译产物；换渲染后端不必动模型。
3. **预览与导出共用同一个渲染函数**：`build()` 产出的 HTML 同时用于预览和导出，避免两条路径逐渐漂移。

## 已实现 / 未实现

已实现：结构角色化（含图题/表题/参考文献的启发式识别）、继承链与「基于」关系、字体 / 段落 / 边框底纹 / 编号 / 页面
等样式属性、`@page` 纸张与页边距、页眉页脚域、标题自动编号、分页预览（Paged.js）、PDF 打印、样式包导入导出、
数学公式（`$...$` 行内、`$$...$$` 一律行间 → KaTeX，KaTeX 样式与字体随产物内联，行内随正文、行间居中且不跨页）、
公式角色在样式画廊与样式窗口里也直接渲染成公式（不是把 `$$...$$` 当纯文本摆着）、
CLI 渲染与校验，以及输入安全默认值（原始 HTML 转义、链接协议白名单、样式包严格校验、预览 iframe 沙箱 + CSP）。

编辑器侧已实现：CodeMirror 6 源码编辑器、Markdown 语法高亮、光标所在结构在源码里高亮、编辑器配色方案
（5 套内置预设：纸感 / 鲜明 / 黑白 / 夜读 / 高对比，支持自定义、导入导出、对比度提示；独立于文档样式包，
不影响预览与导出）。

未实现（见规划中的里程碑）：目录与页码联动、图表编号与交叉引用、渲染输出侧的代码块高亮（Shiki）、脚注、图文环绕、
公式编号自动递增与交叉引用（现阶段用 KaTeX 的 `\tag` 手工编号）、DOCX / Typst 后端、桌面壳打包。
