/**
 * 工具带用的小图标：14px、1.6 线宽、方头方角，线条硬朗一点，
 * 视觉上更接近专业排版软件的工具条，而不是网页里的圆角图标。
 */
const BASE = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'square' as const,
  strokeLinejoin: 'miter' as const,
  'aria-hidden': true,
}

/** 打开文件：文件夹开口，表示「从磁盘取一份文档进来」。 */
export function IconOpenFile() {
  return (
    <svg {...BASE}>
      <path d="M2 12.5V3.5h4l1.4 2H14v7z" />
      <path d="M2 12.5h12" />
    </svg>
  )
}

/** 载入示例：带文本行的文档。 */
export function IconSampleDoc() {
  return (
    <svg {...BASE}>
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M9.5 1.5v3.2h3.1" />
      <path d="M5.5 8h5M5.5 10.5h5" />
    </svg>
  )
}

/** 撤销：逆时针回退箭头。 */
export function IconUndo() {
  return (
    <svg {...BASE}>
      <path d="M3 7.5h6.2a3.3 3.3 0 0 1 0 6.6H5.4" />
      <path d="M5.6 4.6 2.7 7.5l2.9 2.9" />
    </svg>
  )
}

/** 清除该组设置：回到继承值的重置符号。 */
export function IconReset() {
  return (
    <svg {...BASE}>
      <path d="M13 8a5 5 0 1 1-1.7-3.75" />
      <path d="M13 2.4V5.6h-3.2" />
    </svg>
  )
}

/** 样式卡片上的「打开配置」提示。 */
export function IconPencil() {
  return (
    <svg {...BASE}>
      <path d="M11.4 2.3 13.7 4.6 5.6 12.7 2.6 13.4l.7-3z" />
    </svg>
  )
}

/** 导航面板：一个带目录行的侧栏。 */
export function IconOutline() {
  return (
    <svg {...BASE}>
      <path d="M2.5 2.5h11v11h-11z" />
      <path d="M6 2.5v11" />
      <path d="M7.6 5.4h4.2M7.6 8h4.2M7.6 10.6h2.6" />
    </svg>
  )
}

/** 仅编辑器：分隔线靠右，只有左边有文字行。 */
export function IconEditorOnly() {
  return (
    <svg {...BASE}>
      <path d="M2.2 3h11.6v10H2.2z" />
      <path d="M10.4 3v10" />
      <path d="M3.8 5.6h4.8M3.8 8h4.8M3.8 10.4h3" />
    </svg>
  )
}

/** 同时展示：中间一条分隔线，两边都有文字行。 */
export function IconBothPanes() {
  return (
    <svg {...BASE}>
      <path d="M2.2 3h11.6v10H2.2z" />
      <path d="M8 3v10" />
      <path d="M3.6 5.6h3M3.6 8h3M9.4 5.6h3M9.4 8h3" />
    </svg>
  )
}

/** 仅预览：分隔线靠左，只有右边有文字行。 */
export function IconPreviewOnly() {
  return (
    <svg {...BASE}>
      <path d="M2.2 3h11.6v10H2.2z" />
      <path d="M5.6 3v10" />
      <path d="M7.2 5.6h5M7.2 8h5M7.2 10.4h3.2" />
    </svg>
  )
}

/** 打印 / 导出 PDF。 */
export function IconPrint() {
  return (
    <svg {...BASE}>
      <path d="M4.5 6V2.5h7V6" />
      <path d="M2.5 6h11v5h-2.5" />
      <path d="M4.5 9.5h-2V6" />
      <path d="M4.5 9h7v4.5h-7z" />
    </svg>
  )
}

/** 导入样式包：往箱子里落。 */
export function IconImport() {
  return (
    <svg {...BASE}>
      <path d="M8 2v6.4" />
      <path d="M5.4 6.2 8 8.8l2.6-2.6" />
      <path d="M2.5 10.5v3h11v-3" />
    </svg>
  )
}

/** 导出样式包：从箱子里出。 */
export function IconExport() {
  return (
    <svg {...BASE}>
      <path d="M8 8.8V2.4" />
      <path d="M5.4 4.8 8 2.2l2.6 2.6" />
      <path d="M2.5 10.5v3h11v-3" />
    </svg>
  )
}

/** 高亮配色：调色板轮廓里三个色块。 */
export function IconPalette() {
  return (
    <svg {...BASE}>
      <path d="M8 2.2c3.2 0 5.8 2.3 5.8 5.2 0 1.7-1.4 2.6-2.7 2.6h-1c-.8 0-1.4.6-1.4 1.3 0 .5.2.8.2 1.3 0 .7-.5 1.2-1.3 1.2-3 0-5.4-2.5-5.4-5.8S4.8 2.2 8 2.2z" />
      <path d="M5.8 6.2h.02M8.4 4.9h.02M10.7 6.6h.02" />
    </svg>
  )
}

/** 行距：三条线 + 右侧双向箭头。 */
export function IconLineSpacing() {
  return (
    <svg {...BASE}>
      <path d="M2.5 3.5h9M2.5 8h9M2.5 12.5h9" />
      <path d="M14 3.5v9" />
      <path d="M12.6 5 14 3.4 15.4 5M12.6 11 14 12.6 15.4 11" />
    </svg>
  )
}

/** 段前距：向下的箭头压在段落上方。 */
export function IconSpaceBefore() {
  return (
    <svg {...BASE}>
      <path d="M8 2.6v4.2" />
      <path d="M6.4 5.4 8 7l1.6-1.6" />
      <path d="M3 9.6h10M3 12.6h6.5" />
    </svg>
  )
}

/** 段后距：段落下方一个向下撑开的箭头。 */
export function IconSpaceAfter() {
  return (
    <svg {...BASE}>
      <path d="M3 3.4h10M3 6.4h6.5" />
      <path d="M8 9.2V13.4" />
      <path d="M6.4 11.8 8 13.4l1.6-1.6" />
    </svg>
  )
}

/** 减少缩进：左括号箭头 + 右侧三行。 */
export function IconIndentDecrease() {
  return (
    <svg {...BASE}>
      <path d="M6 4.4 2.8 8 6 11.6" />
      <path d="M7.6 3.6h6M7.6 8h6M7.6 12.4h6" />
    </svg>
  )
}

/** 增加缩进：右侧三行 + 右括号箭头。 */
export function IconIndentIncrease() {
  return (
    <svg {...BASE}>
      <path d="M2.4 3.6h6M2.4 8h6M2.4 12.4h6" />
      <path d="M10 4.4 13.2 8 10 11.6" />
    </svg>
  )
}

/** 首行缩进：第一行短、往后缩，下面两行顶格。 */
export function IconFirstLineIndent() {
  return (
    <svg {...BASE}>
      <path d="M6 3.6h7.4" />
      <path d="M2.6 8h10.8M2.6 12.4h10.8" />
    </svg>
  )
}

/** 悬挂缩进：第一行顶格，下面两行右移——首行缩进的反面。 */
export function IconHangingIndent() {
  return (
    <svg {...BASE}>
      <path d="M2.6 3.6h10.8" />
      <path d="M6 8h7.4M6 12.4h7.4" />
    </svg>
  )
}

export function IconChevronDown() {
  return (
    <svg {...BASE} width={10} height={10} strokeWidth={1.8}>
      <path d="M4 6.4 8 10.2l4-3.8" />
    </svg>
  )
}
