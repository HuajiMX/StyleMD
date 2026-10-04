/**
 * 公式渲染：把 remark-math 解析出的 TeX 源码交给 KaTeX，产出可直接进 HTML 的标记。
 *
 * 这一层是纯字符串进、纯字符串出，不碰 DOM 也不读文件，所以浏览器、CLI、CI 用的是同一份实现。
 * 字体与样式的来源见 ./math-css.generated.ts：woff2 已内联成 data URI，预览 iframe（srcdoc）
 * 与离线导出的 HTML 都能自洽显示，不依赖 CDN 或相对路径。
 * build() / renderHtmlDocument 会自动把 KATEX_CSS 注入 <head>；只取 renderBody 片段自己拼页面的
 * 调用方要自己把 KATEX_CSS 放进 <style>，否则公式只剩骨架没有字体。
 */
import katex from 'katex'
import { KATEX_CSS, KATEX_VERSION } from './math-css.generated'

export { KATEX_CSS, KATEX_VERSION }

/**
 * 公式容器的兜底样式。
 *
 * 只放三类规则：把 KaTeX 写死的外边距与对齐交还给角色样式、断页控制，以及错误提示样式。
 * 字号、颜色、对齐一律由角色样式决定，这里不抢主题的活——所以 `.katex-display` 的对齐用 inherit，
 * 让 `[data-role="math-block"]` 的 text-align 说了算：主题想改左对齐/右对齐也不会和预览打架。
 */
export const MATH_BASE_CSS = `/* StyleMD 公式容器 */
.stylemd-math-block { break-inside: avoid; }
.stylemd-math-block .katex-display { margin: 0; text-align: inherit; }
.stylemd-math-block .katex-display > .katex { text-align: inherit; }
.stylemd-math-error { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.95em; color: #cc0000; }`

export interface MathRenderResult {
  html: string
  /** TeX 解析失败的原因；调用方把它收进文档警告，不抛异常影响整篇渲染。 */
  error?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 警告里只放一小段公式，避免整条 \begin{...} 块把日志撑爆。 */
function summarize(tex: string): string {
  const oneLine = tex.replace(/\s+/g, ' ').trim()
  return oneLine.length > 40 ? `${oneLine.slice(0, 40)}…` : oneLine
}

/**
 * 渲染单个公式节点。
 * `trust: false` 关掉 \href / \htmlClass 这类能注入标记的宏，`strict: 'ignore'` 让冷门写法
 * 只影响自己而不往控制台刷警告。
 */
export function renderMath(tex: string, displayMode: boolean): MathRenderResult {
  const source = tex.trim()
  if (!source) return { html: '' }
  try {
    return {
      html: katex.renderToString(source, {
        displayMode,
        throwOnError: true,
        trust: false,
        strict: 'ignore',
      }),
    }
  } catch (error) {
    return {
      html: `<code class="stylemd-math-error">${escapeHtml(source)}</code>`,
      error: `公式「${summarize(source)}」无法解析，已按原文显示：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
