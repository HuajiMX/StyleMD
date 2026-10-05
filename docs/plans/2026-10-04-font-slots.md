# 字体：候选来源与中西文两个槽

日期：2026-10-04 ｜ 关联约束：架构约束 2「样式模型只描述数据」、app/demo 的 UI 约定

## 目标

把「字体族」这个说法从界面上拿掉：字体下拉要列出**这台机器真的装了**的字体，
而不是手写的十六个名字；并且中文与西文能分开设置，西文默认跟随中文字体。

## 决策与取舍

| 待定项 | 选择 | 理由 |
|:---|:---|:---|
| 候选来源 | `queryLocalFonts()` 一份（系统名册，桌面与浏览器同一条路）；再退回常用清单 | 它就是系统 DirectWrite 的视图，且给出的名字正是渲染进程排版时会匹配的那套（231 个家族）。曾短暂用过注册表 `HKLM\...\Fonts`，但那份混着字重变体、还有代码页乱码，已删除 |
| 中文名 | 桌面壳提供一本「英文家族名 → 中文名」词典（DirectWrite / WPF 的 `FamilyNames`） | Chromium 只给英文名，中文名只写在字体文件的 `name` 表里；列表仍以 Chromium 为唯一来源，词典只负责显示 |
| 浏览器权限 | 不主动弹框，只在用户此前已授权时读；没授权给常用清单 | 页面一加载就弹「允许查看字体」太唐突；`loadFontCatalog(true)` 留给以后那个「加载本机字体」按钮 |
| 排序 | 常用清单原样排前面，本机其余按名称接在后面 | 直接按字母排，四百多个字体里根本找不到宋体 |
| 中西文怎么存 | 仍是一条 `FontSpec.family: string[]`，不进 schema | 一条链就能表达两个槽（西文在前、中文在后），改结构要动 `schemaVersion` 与迁移，收益不成比例 |
| 怎么判定「哪个是中文字体」 | 按字体族名匹配常见中文族（含 `FangSong` / `fangsong` 的大小写区分） | 没有可靠 API；认错了用户可以手动改，且这个判断只影响界面呈现，不影响 CSS 编译 |
| 西文的默认值 | 空串 = 「使用中文字体」 | 用户明确要求的默认；此时链里不写单独的西文家族，拉丁字符走中文那项的西文字形 |
| 功能区放几个框 | 一个（中文字体） | 用户要求功能区恢复原状：一个框就代表中文字体 |
| 回退链放哪 | 样式窗口「字体」分区里折叠的「进阶：回退链」 | 只有要精确控制中英混排时才需要动它，平时不该占版面 |

## 代码落点

| 位置 | 改动 |
|:---|:---|
| `apps/demo/src/lib/fontCatalog.ts` | 候选清单的来源探测、合并与排序；`useFontCatalog()` 订阅；`queryLocalFonts` 的最小类型声明 |
| `apps/demo/src/lib/fontChain.ts` | 中文字体判定、槽位读写（`readFontSlots` / `writeFontWestern` / `writeFontCjk`）、功能区显示值 `ribbonFontValue` |
| `apps/demo/src/components/StyleDialog.tsx` | 「中文字体 / 西文字体」两个组合框；回退链收进 `<details class="advanced-block">` |
| `apps/demo/src/components/ribbon-groups.tsx` | 布局恢复原状（字体 + 字号 / 字形两行），那个框改读写中文字体槽 |
| `apps/demo/src/styles.css` | `.font-primary-combo`、`.advanced-block` 折叠样式；修组合框输入框被 `.field.inline input[type="text"]` 压窄导致箭头飘到框外 |
| `apps/demo/test/fontCatalog.test.ts`、`fontChain.test.ts` | 合并排序、槽位读写、通用族与 `FangSong` 的大小写区分 |
| `e2e/smoke.mjs` | 候选与来源标注、中西文两个槽、西文默认值、西文设完排在链首、组合框箭头贴边；「正在渲染」那条改成 MutationObserver |
| `vitest.config.ts`、`tsconfig.json` | demo 的纯逻辑单测纳入 runner 与类型检查 |
| `apps/desktop/src/main.ts` | 自检加一条：下拉候选来自系统枚举；自检用独立 userData，避免与开发实例抢缓存目录 |

## 验证证据

| 命令 | 结果 |
|:---|:---|
| `npm.cmd test` | 17 个测试文件、**146 项全部通过**（新增 fontCatalog 5 项、fontChain 9 项） |
| `npm.cmd run typecheck` | strict `tsc --noEmit` 通过 |
| `node e2e/smoke.mjs` | **100/100 通过**（新增 5 项：候选与常用标注、中西文两个槽与西文默认值、西文设定后排在链首、组合框箭头贴边等） |
| `npm.cmd run desktop:smoke` | **SMOKE OK (9/9)**：候选 231 个家族（Chromium，含用户级安装），中文名字典 25 条（宋体/黑体/微软雅黑/方正舒体/仿宋_GB2312/方正小标宋_GBK…），无乱码、有中文名 |

## 踩过的坑

- **组合框箭头飘到框外**：`.field.inline input[type="text"]`（0,3,1）权重高于 `.combo input`（0,2,1），把输入框写死成 150px；壳（220px）比它宽时输入框不跟着长，绝对定位的箭头就停在壳的右边缘、离开输入框。字号那种 62px 窄壳看不出问题，是因为 flex 把输入框压回了壳宽。已由 `.field.inline .combo input[type="text"] { width: 100% }` 兜住。
- **`mergeFamilies` 的去重基准**：一开始用模块级的常用集合过滤本机字体，结果 Arial / KaiTi 这类既在常用清单、又装在本机的字体被过滤掉且没人补回来。去重必须对「传进来的 curated」做。
- **`FangSong` 与 `fangsong`**：CSS 通用族 `fangsong` 与 Windows 的 `FangSong` 相差一个大小写。通用族判定跟随 `compile-css.ts` 的大小写敏感规则，否则仿宋会被当成通用族。
- **「正在渲染」断言是采样式的**：每 50ms 看一眼状态栏，只在排版慢到跨过一个采样点时才算通过——这条断言在本次改动前后各假失败过一次。已改成 MutationObserver 盯文本变化，只要出现过一次就算数。
- **桌面端字体名乱码**：`reg.exe` 按控制台代码页写字节（中文 Windows 是 GBK），Node 默认按 UTF-8 解，`幼圆` 变成 `��Բ`。为此绕了三圈（改解码 → 只用 Chromium → 两份合并），最后发现根因是**多了一个不该有的来源**：注册表那份既不全（看不到家族/变体的区别）又难解，删掉它，乱码、变体、重复三类问题一起消失。
- **只留 Chromium 那份名册会丢中文名**：Chromium 的字族名是英文（方正舒体 → `FZShuTi`），中文名只写在字体文件的 `name` 表里。解法不是再找一个「列表来源」，而是补一本**名字词典**（DirectWrite 的 `FamilyNames`）——列表一个来源、名字一本词典，两边各自负责一件事。
- **别拿沙箱里的探测结果当结论**：一度根据沙箱内跑的 PowerShell 探针判定「WPF 看不到用户级安装的字体」，据此设计了合并逻辑；换到真实用户会话（Electron 主进程）后，`FangSong_GB2312` / `FZXiaoBiaoSong-B05` / `KaiTi_GB2312` 全都在词典里——沙箱读不到 `%LOCALAPPDATA%` 的字库目录才是真因。
- **注入脚本里的正则别用转义**：自检脚本要塞进模板字符串再 `executeJavaScript`，`\x00` 这类转义会被提前解成真的控制字符，正则失效（表现为「中文样例一直报空」），写注释时写不完整的转义还会让 esbuild 直接编译失败。改用 `charCodeAt` 比较。
- **西文槽塞中文字体会把中文一起改掉**：在西文字体下拉里选「宋体」，链变成 `[宋体, 微软雅黑, …]`，读回来就是「中文=宋体、西文=使用中文字体」——看起来像「选西文却改了中文」。根因是 CSS 逐字符按顺序尝试，而中文字体自带中文字形，这种组合本来就表达不了。修法：西文候选过滤掉中文字体、`writeFontWestern` 对中文字体按「使用中文字体」处理，并在样式窗口里写明这条规则。

## 已知限制与后续

- **没有内置字体**：仓库里除了 KaTeX 数学字体，没有任何正文字体文件；所以下拉里只有「常用 / 本机」两组，没有「内置（随文档走）」。要做 Word 那种「选了就一定处处一致」，得自托管一批 OFL 字体并做子集，那是体积与构建的另一个话题。
- **浏览器版拿不到本机字体**：默认只给常用清单，除非用户此前授权过 `local-fonts`。缺一个「加载本机字体」按钮（点了才弹权限框）——能力已经备好（`loadFontCatalog(true)`），界面还没接。
- **中文字体判定靠名字**：正则覆盖常见族名，冷门或改名的字体认不出来会被当成西文，需要用户手动填。判断只影响界面呈现。
- **中文名依赖 PowerShell**：词典由主进程调 `powershell.exe` 读 WPF 字体集合得到；被组策略挡住时只剩英文名（列表仍然完整）。macOS / Linux 没有这本词典，同理显示英文名。
