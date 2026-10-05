# 悬挂缩进

日期：2026-10-05 ｜ 关联：AGENTS.md 架构约束 6 / 7、`docs/plans/2026-10-05-paragraph-conventions.md`（版式约定）

## 目标

补上悬挂缩进（首行顶格、其余行缩进，参考文献条目、术语表常用），并把它的位置一次性放对：
它属于**版式约定**那一组，不随 `basedOn` 继承。

## 决策与取舍

| 待定项 | 选择 | 理由 |
|:---|:---|:---|
| 数据形状 | 新字段 `hangingIndentChars`，与 `firstLineIndentChars` **互斥**（同时大于 0 报错） | 对应 Word / OOXML 的 `firstLine` / `hanging` 一对属性，将来 DOCX 后端能 1:1 映射；比"允许负数"或"改成一个 `indent: { kind, chars }` 联合类型"都更省，也不必动 `schemaVersion` |
| 单位 | "字符"（编译成 `em`），与首行缩进一致 | 中文排版里这两个值天然按字算，且要随字号缩放 |
| 继承 | 归入 `PARAGRAPH_CONVENTION_FIELDS` | 与对齐/左右缩进/首行缩进同理：正文的缩进约定不该外溢到标题与列表 |
| 渲染落法 | 悬挂 = `text-indent: -Nem` + `padding-inline-start`（有左缩进时 `calc(<left>pt + Nem)`） | 段落整体右移、首行拉回内容边界；这是 CSS 里唯一不靠定位就能表达悬挂的写法 |
| UI | 样式窗口把两个字段合成「特殊格式：无 / 首行缩进 / 悬挂缩进 + 字符数」；功能区各自一个开关，互相归零 | 数据是两字段、心智是一个三态；功能区给常用的一键操作 |

## 代码落点

| 位置 | 改动 |
|:---|:---|
| `packages/theme-schema/src/types.ts` | `ParagraphSpec.hangingIndentChars`、并入 `PARAGRAPH_CONVENTION_FIELDS`、加进计算样式的必填项 |
| `packages/theme-schema/src/shape.ts` / `validate.ts` | 校验：非负、且不能与首行缩进同时大于 0 |
| `packages/core/src/style/resolve.ts` | 默认 0，走 `convention(...)`（继承那一步不传） |
| `packages/core/src/style/compile-css.ts` | `indentDeclarations`：首行缩进 / 悬挂缩进两种落法 |
| `apps/demo/src/lib/inlineStyle.ts` | 样式窗口实时样本的同一套落法 |
| `apps/demo/src/components/{icons,ribbon-groups,StyleDialog}.tsx` | 悬挂缩进图标与开关、「特殊格式」三态控件、互斥归零 |
| 测试 | `validate.test.ts` 互斥与负值；`compile-css.test.ts` 两种落法；`resolve.test.ts` 的清单守卫现在覆盖悬挂；`e2e/smoke.mjs` 一条端到端 |

## 验证证据

| 命令 | 结果 |
|:---|:---|
| `npm.cmd test` | 18 个文件、**160 项全部通过**（新增 3 条） |
| `npm.cmd run typecheck` | 通过 |
| `npm.cmd run build` | 成功 |
| `node e2e/smoke.mjs` | **111/111**（新增「悬挂缩进把首行拉回、其余行缩进，并与首行缩进互斥」：首行 −2.0 字符 / 左内边距 2.0 字符 / 首行缩进开关 false） |
| `npm.cmd run desktop:smoke` | SMOKE OK（17/17） |

## 已知限制与后续

- 悬挂缩进目前只作用于段落本身；列表项符号与文本的对齐仍由 `list.*` 角色的左缩进控制，两者叠加时的观感需要用户自己调（列表项目符号的悬挂排版是另一件事，将来单独做）。
- 内置预设没有改渲染：参考文献条目等仍是原先的样子，悬挂缩进是新提供的选项（改预设会静默改变已有文档的排版）。
- 若将来要做"首行缩进跟随正文"这类反向需求，仍按 `PARAGRAPH_CONVENTION_FIELDS` 的机制走（显式哨兵值），不要重新打开整条继承链。
