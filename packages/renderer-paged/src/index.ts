/**
 * Paged.js 集成层。刻意保持"纯字符串进、纯字符串出"：
 * 读取 polyfill 文件是宿主（CLI 用 fs、浏览器用打包器）的责任，本包不碰 fs/网络。
 */

export const PAGED_POLYFILL_MARKER = '<!--stylemd-pagedjs-polyfill-->'

/**
 * 内联脚本必须做两个转义：
 *  - `</script` 会让 HTML 解析器提前结束脚本块；
 *  - `<!--` 会触发脚本里的"类 HTML 注释"规则。
 * 这两处只可能出现在 JS 的字符串或正则里，因此加反斜杠转义是安全的
 * （`<\/script` 与 `<\!--` 在 JS 里等价于原文）。
 */
function escapeForInlineScript(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
}

/**
 * 屏幕预览时的纸张外观：灰底 + 白纸 + 阴影。
 *
 * 注意：Paged.js 的 polisher 会把 `@media screen` 规则整段丢掉（它只保留分页媒体相关的 CSS），
 * 所以这份样式在分页完成后由生命周期脚本重新注入，不能只靠 <head> 里那一份。
 */
export const SCREEN_CHROME_CSS = `@media screen {
  body { background: #e6e9ee; margin: 0; }
  .pagedjs_pages { display: block; zoom: var(--stylemd-zoom, 0.85); }
  .pagedjs_page {
    background: #ffffff;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.16);
    margin: 0 auto 16px;
  }
}`

/** 打印/导出时抵消屏幕外壳，保证 PDF 不受缩放与阴影影响。 */
export const PRINT_CHROME_CSS = `@media print {
  body { background: #ffffff; }
  .pagedjs_pages { zoom: 1; }
  .pagedjs_page { box-shadow: none; margin: 0; }
}`

/** 原生分页路径直接使用；Paged.js 路径会保留其中的打印规则并在分页后重新注入屏幕规则。 */
export const PREVIEW_CHROME_CSS = `${SCREEN_CHROME_CSS}\n${PRINT_CHROME_CSS}`

/**
 * 把 Paged.js polyfill 内联进 HTML。
 * 内联而不是走 CDN，是因为导出必须离线可用，且预览与导出要用同一份实现。
 *
 * 注意：必须用函数式替换。替换串里只要出现 `$'` / `` $` `` / `$&` 这类序列，
 * String.replace 会把它当成特殊模式展开，直接把脚本内容截断（这个坑真实踩到过）。
 */
export function injectPagedPolyfill(html: string, polyfillSource: string, messageId = ''): string {
  const safeSource = escapeForInlineScript(polyfillSource)
  const id = JSON.stringify(messageId).replace(/</g, '\\u003c')
  const screenCss = JSON.stringify(SCREEN_CHROME_CSS).replace(/</g, '\\u003c')
  const toolbarCss = JSON.stringify(PRINT_TOOLBAR_CSS).replace(/</g, '\\u003c')
  const lifecycle = `
window.__stylemdPaged = { status: 'pending', pages: 0 };
window.__stylemdZoom = null;
function report(status, pages) {
  window.__stylemdPaged = { status: status, pages: pages };
  if (window.parent !== window) window.parent.postMessage({ type: 'stylemd:pagination', id: ${id}, status: status, pages: pages }, '*');
}
function addStyle(css) {
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
function applyZoom() {
  var pages = document.querySelector('.pagedjs_pages');
  if (pages && typeof window.__stylemdZoom === 'number') pages.style.setProperty('--stylemd-zoom', String(window.__stylemdZoom));
}
window.addEventListener('message', function(event) {
  if (event.source !== window.parent || !event.data || event.data.id !== ${id}) return;
  if (event.data.type === 'stylemd:print' && window.__stylemdPaged.status === 'paged') window.print();
  // 编辑器滚动时跟着走：按比例定位，源文与分页后的页面对不上行，只能对进度。
  if (event.data.type === 'stylemd:scroll' && typeof event.data.ratio === 'number') {
    var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.max(0, Math.min(1, event.data.ratio)) * max);
  }
  if (event.data.type === 'stylemd:zoom' && typeof event.data.zoom === 'number') {
    window.__stylemdZoom = Math.min(2, Math.max(0.4, event.data.zoom));
    applyZoom();
  }
});
if (window.parent !== window) document.addEventListener('click', function(event) {
  if (event.target.closest && event.target.closest('a')) event.preventDefault();
});
window.addEventListener('load', async function() {
  var toolbar = document.querySelector('.stylemd-toolbar');
  if (toolbar) toolbar.remove();
  try {
    await document.fonts.ready;
    var flow = await window.PagedPolyfill.preview();
    // Paged.js 已经把 @media screen 规则丢掉了，分页完成后补回屏幕外壳与工具栏样式。
    addStyle(${screenCss});
    if (toolbar) addStyle(${toolbarCss});
    applyZoom();
    report('paged', flow.total);
  } catch (error) {
    report('error', 0);
  } finally {
    if (toolbar) document.body.appendChild(toolbar);
  }
});`
  const tag = `<script>window.PagedConfig = { auto: false };</script>\n<script>\n${safeSource}\n</script>\n<script>${lifecycle}</script>`
  return html.includes(PAGED_POLYFILL_MARKER)
    ? html.replace(PAGED_POLYFILL_MARKER, () => tag)
    : html.replace('</head>', () => `${tag}\n</head>`)
}

/** 在 <head> 里插入额外样式（预览外壳用它注入纸张阴影）。 */
export function injectHeadStyle(html: string, css: string): string {
  return html.replace('</head>', () => `<style>\n${css}\n</style>\n</head>`)
}

/** 打印/导出用的最小控制条样式；单独导出是为了让 Paged.js 生命周期能重新注入。 */
export const PRINT_TOOLBAR_CSS = `.stylemd-toolbar {
  position: fixed; inset-inline: 16px; bottom: 16px; z-index: 9999;
  display: flex; gap: 12px; align-items: center; justify-content: center;
  padding: 10px 16px; border-radius: 999px; font: 13px/1.4 system-ui, sans-serif;
  background: rgba(23, 32, 46, 0.92); color: #fff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.3);
}
.stylemd-toolbar button {
  font: inherit; padding: 4px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.4);
  background: rgba(255,255,255,0.14); color: #fff; cursor: pointer;
}
.stylemd-toolbar button:hover { background: rgba(255,255,255,0.26); }
@media print { .stylemd-toolbar { display: none; } }`

/**
 * 打印/导出用的最小控制条：屏幕可见、打印隐藏。
 * 为了让"浏览器打印"这条路径在 M0 就能被真实评估，而不是靠肉眼比对。
 */
export const PRINT_TOOLBAR_HTML = `<div class="stylemd-toolbar">
  <strong>StyleMD 原型输出</strong>
  <span>用浏览器「打印 → 另存为 PDF」导出（需勾选"背景图形"以保留底纹）</span>
  <button type="button" onclick="window.print()">打印 / 导出 PDF</button>
</div>
<style>${PRINT_TOOLBAR_CSS}</style>`
