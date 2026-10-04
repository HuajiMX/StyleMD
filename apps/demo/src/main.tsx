import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { KATEX_CSS, MATH_BASE_CSS } from '@stylemd/core'
import { App } from './App'
import './styles.css'

// 样式画廊与样式窗口要直接渲染公式样例，宿主页面也得有 KaTeX 的样式与内联字体
// （预览 iframe 用的是 build() 产物里的那一份，这里补的是工作台自己）。
const mathStyles = document.createElement('style')
mathStyles.textContent = `${MATH_BASE_CSS}\n${KATEX_CSS}`
document.head.appendChild(mathStyles)

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 容器')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
