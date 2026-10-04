# 数据存放位置笔记（打包成 App 之后）

日期：2026-10-02 ｜ 状态：**待办**（等 M2 定壳后执行）

背景：讨论「编辑器配色和会话数据最终存在用户电脑的什么地方」时的结论，记在这里免得下次重来。

## 现状（M0/M1 浏览器原型）

| 数据 | 现在存在哪 | 说明 |
|:---|:---|:---|
| 文档内容、光标、当前样式包、界面布局 | 浏览器 `localStorage`，键 `stylemd:session:v1` | 见 `apps/demo/src/lib/session.ts`；读取一律校验，坏档回落默认预设 |
| 「自动保存」开关 | 浏览器 `localStorage`，键 `stylemd:autosave:v1`（`on` / `off`） | 必须和会话分开存：关掉之后会话本来就不再写，偏好要是塞在会话里，下次打开会变回默认开启；默认 `on` |
| 文档文件本身 | 用户自己挑的位置 | 优先 File System Access API 写回原文件（Chrome/Edge）；不支持时退回 `<a download>` 下载。见 `apps/demo/src/lib/document.ts`，不受下面的改动影响 |
| 编辑器配色方案（规划中） | 计划另起一个 `localStorage` 键 `stylemd:editor-schemes:v1` | 见 [编辑器高亮规划](2026-10-02-editor-syntax-highlight.html) §7 |

`localStorage` 落在 Chromium 自己的资料目录里：普通用户找不到、打不开、也没法备份，清一次浏览数据就没了。功能上够用，长期用不合格。

## 待办（M2 打包那一步执行）

宿主选型推迟到 M2 开工前（开发规划 §5 D1b，建议 Electron）。定了壳之后：

1. **设置类数据改成用户目录下的 JSON 文件**，不再长期放 `localStorage`。
   - 位置用宿主给的用户数据目录（Electron 是 `app.getPath('userData')`）：
     - Windows：`C:\Users\<用户>\AppData\Roaming\<App 名>\`
     - macOS：`~/Library/Application Support/<App 名>/`
     - Linux：`~/.config/<App 名>/`
   - 至少两个文件：`settings.json`（界面布局、缩放、最近打开等）、`editor-schemes.json`（配色方案库 + 当前生效方案）。
2. **设置跟着人走，文档跟着文件走**：两者分开存，互不牵连。
3. **配色方案支持导出 / 导入单个 JSON**：换电脑能带走。
4. **保留「坏档一律当没有」的容错**：文件缺失、字段非法、版本未知都回落到内置预设，不能让配置问题挡住编辑。
5. **迁移**：首次启动读一次旧的 `localStorage`，搬进 JSON 后清掉旧键；搬不动就静默回落，不弹错误。

## 为什么现在不动

M0/M1 是浏览器原型，`localStorage` 是零成本方案；改成文件读写要等宿主 API 存在才有意义。所以这里只记待办，不改实现。

## 相关

- 开发规划：[2026-09-30-stylemd-development-plan.html](2026-09-30-stylemd-development-plan.html) §5 D1b（宿主选型）、§M2（本地文件打开 / 保存 / 最近文件 / 自动保存与崩溃恢复）
- 编辑器高亮与配色方案：[2026-10-02-editor-syntax-highlight.html](2026-10-02-editor-syntax-highlight.html) §7
- 现有实现：`apps/demo/src/lib/session.ts`、`apps/demo/src/lib/document.ts`
