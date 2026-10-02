import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

/**
 * pagedjs 的 package.json 用 exports 条件挡住了 `dist/paged.polyfill.js` 这个深路径，
 * 所以这里从包入口往上找到真实文件，再把它暴露成一个可 `?raw` 导入的别名。
 */
function resolvePagedPolyfill(): string {
  const require = createRequire(import.meta.url)
  let directory = path.dirname(require.resolve('pagedjs'))
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(directory, 'dist', 'paged.polyfill.js')
    if (existsSync(candidate)) return candidate
    directory = path.dirname(directory)
  }
  throw new Error('找不到 pagedjs/dist/paged.polyfill.js')
}

export default defineConfig({
  plugins: [react()],
  // 直接指向各包的 src：原型阶段不做构建产物，少一层缓存与增量构建的坑。
  resolve: {
    // 用数组形式：pagedjs 的 polyfill 是以 `@pagedjs-polyfill?raw` 形式导入的，
    // 带查询串的 id 无法被字符串别名匹配，必须用正则前缀匹配。
    alias: [
      { find: /^@pagedjs-polyfill/, replacement: resolvePagedPolyfill() },
      { find: '@stylemd/theme-schema', replacement: resolvePath('../../packages/theme-schema/src/index.ts') },
      { find: '@stylemd/presets', replacement: resolvePath('../../packages/presets/src/index.ts') },
      { find: '@stylemd/renderer-paged', replacement: resolvePath('../../packages/renderer-paged/src/index.ts') },
      { find: '@stylemd/core', replacement: resolvePath('../../packages/core/src/index.ts') },
      { find: '@stylemd/editor-theme', replacement: resolvePath('../../packages/editor-theme/src/index.ts') },
    ],
  },
  // Vite 8 的依赖预打包会把 `@pagedjs-polyfill?raw` 当成普通包处理：dev 下导出的
  // 是 Paged.js 对象而不是源码字符串，injectPagedPolyfill 里对非字符串调用 .replace()
  // 会抛 TypeError，App 渲染中断变成白屏。排除出预打包后 dev 与 build 行为一致。
  optimizeDeps: {
    exclude: ['@pagedjs-polyfill?raw', '@pagedjs-polyfill'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
