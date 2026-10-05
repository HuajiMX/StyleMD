# 段落「版式约定」与 `basedOn` 继承的分离

日期：2026-10-05 ｜ 关联：规划 §7「样式生效优先级」、§8 constraints、AGENTS.md 架构约束 6

## 起因

给「正文段落」打开首行缩进后，一级/二级/三级标题、列表、代码块这些**基于正文**的角色一起被缩进。
实测（技术文档预设，正文设 `firstLineIndentChars: 2`）：

```
heading.1 = 2 ← 自己没写，继承来的
heading.2 = 2 ← 自己没写，继承来的
list.item = 2 ← 自己没写，继承来的
code.block = 2 ← 自己没写，继承来的
```

内置的「中文学位论文」预设看着没这个问题，是因为它给十几个角色逐个写了 `firstLineIndentChars: 0` 挡着
——这正是要消掉的负担：改一次正文缩进，得记住给每个衍生角色补一遍 0。

## 判断

问题不在继承实现，而在于**「正文」同时背着三件事**：字体/字号的家族基类、唯一被允许的跨类继承根
（`validate.ts` 专门为 `body.text` 开的口子）、以及「中文正文首行缩进 2 字符」这条**版式约定**。
前两件是对的，第三件搭了顺风车——约定没有自己的载体，只能挂在正文样式上，于是跟着继承边一起漏。

所以做法是**给约定一个载体，而不是给继承打补丁**：

- 段落属性分两组：**家族属性**（字体、行距、段间距、分页控制…）沿 `basedOn` 继承；**版式约定**
  （`align` / `indentLeftPt` / `indentRightPt` / `firstLineIndentChars`）**不随 `basedOn` 传递**，
  只认角色自己写的值，没写就用默认（左对齐 / 0）。将来加悬挂缩进，归到同一组。
- 被否掉的两条路：**让每个角色写 0 挡**（数据重复、导入导出带着、新角色还会漏）；
  **字段级特例写进 resolver**（后端各写一遍，且清单不成规格）。也没动 `basedOn` 的 Word 式语义——
  「改正文带动衍生样式」是产品价值，只是它现在只带动家族属性。

## 代码落点

| 位置 | 改动 |
|:---|:---|
| `packages/theme-schema/src/types.ts` | `PARAGRAPH_CONVENTION_FIELDS`：版式约定字段清单（规格来源） |
| `packages/core/src/style/resolve.ts` | `mergeRoleStyle(base, style, mode)`：`mode = 'inherit'` 时不传约定字段；`computeRole` 只对链末的「角色自己」用 `'self'` |
| `packages/presets/src/index.ts` | 学位论文预设：删掉 15 处纯为挡继承而写的 `firstLineIndentChars: 0`；引用块与列表显式写上 `align: 'justify'`（约定不再继承，想跟正文一样就得自己声明） |
| `apps/demo/src/components/StyleDialog.tsx` | 对齐/缩进四项不再标「继承自」，分区说明改为「版式约定：不随『基于』继承」；段落组的回落按钮文案改成「回落到继承值 / 默认值」 |
| `packages/core/test/resolve.test.ts` | 新增 4 条：约定不继承而家族属性照旧、角色自己声明仍生效、按清单逐项验证不继承、角色注册表兜底不受影响 |
| `e2e/smoke.mjs` | 新增 1 条：光标落到正文开首行缩进，基于正文的三级标题仍是 `0px` |

## 验证证据

| 命令 | 结果 |
|:---|:---|
| `npm.cmd test` | 18 个文件、**157 项全部通过** |
| `npm.cmd run typecheck` | 通过 |
| `npm.cmd run build` | 成功 |
| `node e2e/smoke.mjs` | **110/110**（新增「版式约定不随『基于』继承」：正文 2.0 字符 / 三级标题 0px） |
| `npm.cmd run desktop:smoke` | SMOKE OK（17/17） |

改动前后把两个内置预设全部角色的约定字段解析结果做了逐条 diff，差异只有三处，都在学位论文预设：

| 角色 | 改前 | 改后 | 说明 |
|:---|:---|:---|:---|
| `heading.5` / `heading.6` | `align: justify` | `align: left` | 从正文继承来的两端对齐；小标题左对齐才是本意 |
| `code.block` | `align: justify` | `align: left` | 代码块两端对齐本来就是继承的副作用 |

引用块与列表用显式 `align: 'justify'` 保住了原样；技术文档预设逐行无变化。

## 已知限制与后续

- 约定字段目前没有「跟随正文」的表达：角色想要与正文相同的缩进，得自己写一遍值。若将来确实需要，
  可以给字段加一个显式的 `'inherit'` 哨兵值（仍走同一份清单），而不是把继承重新打开。
- `validate.ts` 里「只允许基于 `body.text` 跨类别继承」这条口子保持原样——本次不涉及继承边的合法性。
- 悬挂缩进已于同日落地：加进 `PARAGRAPH_CONVENTION_FIELDS`、在 `mergeRoleStyle` 里接了
  `convention(...)`，清单驱动的用例已覆盖它，细节见 `2026-10-05-hanging-indent.md`。
