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
var applyingScroll = false;
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
    applyingScroll = true;
    window.scrollTo(0, Math.max(0, Math.min(1, event.data.ratio)) * max);
    // 等两帧再放行上报：scroll 事件是异步派发的，过早清标记会把同步滚当成用户滚动。
    requestAnimationFrame(function() { requestAnimationFrame(function() { applyingScroll = false; }); });
  }
  if (event.data.type === 'stylemd:zoom' && typeof event.data.zoom === 'number') {
    window.__stylemdZoom = Math.min(2, Math.max(0.4, event.data.zoom));
    applyZoom();
  }
});
// 预览自己滚动时把进度报给宿主，让编辑器跟着走（双向同步）。
// 程序化滚动（上面的 stylemd:scroll）要跳过上报，否则两边会互相推着抖。
window.addEventListener('scroll', function() {
  if (applyingScroll) return;
  var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  var ratio = max > 0 ? window.scrollY / max : 0;
  if (window.parent !== window) window.parent.postMessage({ type: 'stylemd:scroll-report', id: ${id}, ratio: ratio }, '*');
}, { passive: true });
if (window.parent !== window) document.addEventListener('click', function(event) {
  if (event.target.closest && event.target.closest('a')) event.preventDefault();
});
// 指针停在预览上时，父文档既收不到鼠标事件、:hover 也停在原处，宿主的悬停面板（例如「文件」菜单）
// 就没法自己判断指针已经离开。这里替它通报一声。
// 只能当「事件」用：父文档冻结 hover 的同时，子文档也收不到 mouseleave，所以进出的电平不可靠，
// 改成在预览里移动指针就按节流重复通报，宿主每收到一次就把悬停面板收起来。
var lastPointerReport = 0;
function reportPointer(over) {
  if (window.parent !== window) window.parent.postMessage({ type: 'stylemd:pointer', id: ${id}, over: over }, '*');
}
document.documentElement.addEventListener('mouseenter', function() { reportPointer(true); });
document.documentElement.addEventListener('mouseleave', function() { reportPointer(false); });
document.documentElement.addEventListener('pointermove', function() {
  var now = Date.now();
  if (now - lastPointerReport < 300) return;
  lastPointerReport = now;
  reportPointer(true);
});
// 跨页表格：Paged.js 把一张表按页切成多个独立 <table>，每片只按自己那部分内容算列宽，跨页就对不齐。
// 注意不能等分页完再统一列宽：那会把行重新排高、把内容挤出页面（实测连表格下框线都会跟着跑出页外）。
// 必须在分页之前按页面内容宽度把列宽定死，让 Paged.js 从一开始就按最终几何分页。
/** 页面内容宽度以 CSS 变量暴露；没有它说明这份文档不含 @page（includePage: false），本就不该定列宽。 */
function pageContentWidthValue() {
  return getComputedStyle(document.documentElement).getPropertyValue('--stylemd-page-content-width').trim();
}
function measurePageContentWidth(value) {
  var probe = document.createElement('div');
  probe.setAttribute('style', 'position:absolute;left:-10000px;top:0;visibility:hidden;width:' + value + ';');
  document.body.appendChild(probe);
  var width = probe.offsetWidth;
  probe.parentNode.removeChild(probe);
  return width;
}
function measureColumnWidths(table) {
  var columnCount = 0;
  for (var r = 0; r < table.rows.length; r++) columnCount = Math.max(columnCount, table.rows[r].cells.length);
  var firstRow = table.rows[0];
  var widths = [];
  for (var c = 0; c < columnCount; c++) {
    var cell = firstRow && firstRow.cells[c];
    widths.push(cell ? cell.offsetWidth : 0);
  }
  return widths;
}
// 分页前记下每张表的表头：Paged.js 复制出的续页分片只带行、不带 <thead>，靠它补回去。
var splitTableHeaders = {};

async function stabilizeTableLayouts() {
  var value = pageContentWidthValue();
  if (!value) return;
  // 宿主刚挂上 iframe 时（React 首帧）这里可能还没有布局视口，量出来的宽度是 0；
  // 0 会让「定列宽 + 续页补表头」整段失效，跨页表格就退回自然列宽。量到宽度为止再继续。
  var width = measurePageContentWidth(value);
  for (var attempt = 0; attempt < 60 && !width; attempt++) {
    await new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); });
    width = measurePageContentWidth(value);
  }
  if (!width) return;
  var tables = document.querySelectorAll('table[data-role="table"]');
  for (var i = 0; i < tables.length; i++) {
    var table = tables[i];
    var key = table.getAttribute('data-stylemd-table') || 'stylemd-table-' + i;
    table.setAttribute('data-stylemd-table', key);
    // 量的是「正常文档流里、和页面内容一样宽」的同一张表的副本，量完就扔；直接量分页后的碎框不可信。
    var host = document.createElement('div');
    host.setAttribute('style', 'position:absolute;left:-10000px;top:0;visibility:hidden;width:' + width + 'px;');
    var probe = table.cloneNode(true);
    host.appendChild(probe);
    document.body.appendChild(host);
    var widths = measureColumnWidths(probe);
    host.parentNode.removeChild(host);
    var total = 0;
    for (var w = 0; w < widths.length; w++) total += widths[w];
    if (!total) continue;
    table.style.tableLayout = 'fixed';
    table.style.width = total + 'px';
    // 分片时 Paged.js 只浅拷贝 <table>（<colgroup> 不会跟到续页），行却是深拷贝，
    // 所以列宽写在单元格上：续页分片自带同一组列宽，列位置才能和第一片对齐。
    for (var r = 0; r < table.rows.length; r++) {
      var cells = table.rows[r].cells;
      for (var c = 0; c < cells.length && c < widths.length; c++) cells[c].style.width = widths[c] + 'px';
    }
    // 表头要等列宽写进单元格之后再存：补到续页时它就是该片的第一行，列宽靠它传给整片。
    var head = table.querySelector(':scope > thead');
    if (head) splitTableHeaders[key] = head.outerHTML;
  }
}
/**
 * Paged.js 在排版途中复制出的续页分片只有行、没有表头。等它被渲染进页面时立刻补上，
 * 这一页随后的溢出检测就把表头高度一起算了进去——分页定稿后再补是把表头顶出页面，这里是让 Paged.js 自己把行往后挪。
 */
function installSplitTableHeaderHook() {
  var hooks = window.PagedPolyfill && window.PagedPolyfill.chunker && window.PagedPolyfill.chunker.hooks;
  if (!hooks || !hooks.renderNode || !hooks.renderNode.register) return;
  hooks.renderNode.register(function (clone) {
    if (!clone || clone.nodeType !== 1 || !clone.closest) return;
    var table = clone.tagName === 'TABLE' ? clone : clone.closest('table');
    if (!table || !table.getAttribute('data-split-from')) return;
    var key = table.getAttribute('data-stylemd-table');
    if (!key || !splitTableHeaders[key] || table.querySelector(':scope > thead')) return;
    var holder = document.createElement('table');
    holder.innerHTML = splitTableHeaders[key];
    var head = holder.querySelector('thead');
    if (head) table.insertBefore(head, table.firstChild);
  });
}
// 整表换页时 Paged.js 会在原页留一个 0 行的空表壳，边框可能露出来，清掉。
function cleanupEmptyTableShells() {
  var tables = document.querySelectorAll('.pagedjs_pages table[data-role="table"]');
  for (var i = 0; i < tables.length; i++) {
    if (tables[i].rows.length === 0 && tables[i].parentNode) tables[i].parentNode.removeChild(tables[i]);
  }
}
/**
 * 页眉页脚的文字由 Paged.js 生成在 .pagedjs_margin-content 的 ::after 里，而 @top-* / @bottom-*
 * 规则里的边框落在它的外层容器上，横线就画成了容器的边框。
 * 把内容元素标成 page.header / page.footer 角色，横线才是页眉段落自己的下边框，
 * 用户在样式面板里改这个角色就能改线，容器只负责位置。
 *
 * 另外：Paged.js 会把「这一段没写内容」的边距盒整块隐藏。只写左、中两段时，右段没内容，
 * 右面的线就断了。这里让空段按有内容那段的对齐方式和高度一起参与，横线才能铺满整行。
 */
function annotateFurnitureRoles() {
  var areas = [['top', 'page-header'], ['bottom', 'page-footer']];
  var positions = ['left', 'center', 'right'];
  var pages = document.querySelectorAll('.pagedjs_page');
  for (var p = 0; p < pages.length; p++) {
    for (var i = 0; i < areas.length; i++) {
      var sections = [];
      for (var j = 0; j < positions.length; j++) {
        var container = pages[p].querySelector('.pagedjs_margin-' + areas[i][0] + '-' + positions[j]);
        var content = container ? container.querySelector(':scope > .pagedjs_margin-content') : null;
        if (!content) continue;
        content.setAttribute('data-role', areas[i][1]);
        // 左/中/右的位置决定对齐，别让角色里的 text-align 把三块挤到同一处。
        content.style.textAlign = positions[j];
        sections.push({ container: container, content: content, filled: container.classList.contains('hasContent') });
      }
      // 先挂上角色再量高度：角色里的字号、行距决定这一行实际多高，量早了会短一截。
      var reference = null;
      var lineHeight = 0;
      for (var m = 0; m < sections.length; m++) {
        if (!sections[m].filled) continue;
        reference = reference || sections[m].container;
        lineHeight = Math.max(lineHeight, sections[m].content.getBoundingClientRect().height);
      }
      if (!reference || !lineHeight) continue;
      var referenceStyle = getComputedStyle(reference);
      for (var k = 0; k < sections.length; k++) {
        var section = sections[k];
        if (section.filled) continue;
        // 空段：容器照抄有内容那段的贴边对齐，内容给同样的行高，线才和相邻段齐平。
        section.container.style.visibility = 'visible';
        section.container.style.alignItems = referenceStyle.alignItems;
        section.container.style.paddingTop = referenceStyle.paddingTop;
        section.container.style.paddingBottom = referenceStyle.paddingBottom;
        section.content.style.height = lineHeight + 'px';
      }
    }
  }
}
function attributeSelector(ref) {
  return ref ? '[data-ref="' + String(ref).replace(/"/g, '\\"') + '"]' : '[data-ref="__stylemd_none__"]';
}
// 断点之前这一页还剩没剩别的渲染内容；落到页首时不能再前移，否则和上一页断点重合会被判成死循环。
function hasRenderedContentBefore(pageContent, node) {
  var current = node;
  while (current && current !== pageContent) {
    if (current.previousElementSibling) return true;
    current = current.parentElement;
  }
  return false;
}
/**
 * 表注/图注必须和被注对象同页。Paged.js 只认单层 break-avoid：断点落在表头（或图注段落）上时，
 * 它只会把表/图推到下一页，把表注留在上一页页尾。这里在定断点的那一刻把断点整体前移到表注（或图片）之前。
 */
function installCaptionKeepWithNextHook() {
  var hooks = window.PagedPolyfill && window.PagedPolyfill.chunker && window.PagedPolyfill.chunker.hooks;
  if (!hooks || !hooks.onBreakToken || !hooks.onBreakToken.register) return;
  hooks.onBreakToken.register(function (breakToken, overflow, rendered) {
    if (!breakToken || !breakToken.node || !rendered || !overflow || !overflow.setStartBefore) return;
    var element = breakToken.node.nodeType === 1 ? breakToken.node : breakToken.node.parentElement;
    if (!element || !element.closest) return;
    var anchor = null;
    var table = element.closest('table');
    if (table) {
      var caption = table.previousElementSibling;
      if (!caption || caption.getAttribute('data-role') !== 'table-caption') return;
      // 只有断点落在表头（或整张表）上时，这一页除表注外不会再留下任何表内容；断点在表体行上说明表身还在这页，表注没落单
      var head = element.closest('thead');
      if (element !== table && !(head && head.parentElement === table)) return;
      anchor = caption;
    } else if (element.getAttribute('data-role') === 'figure-caption') {
      var image = element.previousElementSibling;
      if (!image || image.getAttribute('data-role') !== 'image') return;
      anchor = image;
    } else {
      return;
    }
    var renderedAnchor = rendered.querySelector(attributeSelector(anchor.getAttribute('data-ref')));
    if (!renderedAnchor || !hasRenderedContentBefore(rendered, renderedAnchor)) return;
    overflow.setStartBefore(renderedAnchor);
    breakToken.node = anchor;
    breakToken.offset = 0;
    return breakToken;
  });
}
window.addEventListener('load', async function() {
  var toolbar = document.querySelector('.stylemd-toolbar');
  if (toolbar) toolbar.remove();
  try {
    await document.fonts.ready;
    // 表格列宽必须在分页前定死：分页后再改会把行重新排高、把内容挤出页面。
    await stabilizeTableLayouts();
    installSplitTableHeaderHook();
    installCaptionKeepWithNextHook();
    var flow = await window.PagedPolyfill.preview();
    cleanupEmptyTableShells();
    annotateFurnitureRoles();
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
