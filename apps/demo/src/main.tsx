import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { KATEX_CSS, MATH_BASE_CSS } from '@stylemd/core'
import { App } from './App'
import { desktopBridge } from './lib/desktop'
import './styles.css'

// 样式画廊与样式窗口要直接渲染公式样例，宿主页面也得有 KaTeX 的样式与内联字体
// （预览 iframe 用的是 build() 产物里的那一份，这里补的是工作台自己）。
const mathStyles = document.createElement('style')
mathStyles.textContent = `${MATH_BASE_CSS}\n${KATEX_CSS}`
document.head.appendChild(mathStyles)

/**
 * 桌面壳是无边框窗口（原生标题栏被藏起来了），标题栏相关的样式——整条当拖拽区、
 * 给右上角的系统窗口按钮留位置——只在壳里生效。打标放在 render 之前，免得先闪一下没留位的布局。
 */
const bridge = desktopBridge()
if (bridge) {
  document.documentElement.classList.add('is-desktop')
  // macOS 的窗口按钮在左边，不用在右边留位置
  if (bridge.platform !== 'darwin') document.documentElement.classList.add('has-caption-buttons')
}

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 容器')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
