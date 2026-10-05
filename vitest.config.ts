import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@stylemd/theme-schema': resolvePath('./packages/theme-schema/src/index.ts'),
      '@stylemd/presets': resolvePath('./packages/presets/src/index.ts'),
      '@stylemd/core': resolvePath('./packages/core/src/index.ts'),
      '@stylemd/editor-theme': resolvePath('./packages/editor-theme/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    // demo 里也有纯逻辑要单测（例如字体候选清单的合并与排序），
    // 它们不碰 DOM，跟 packages 的用例用同一套 runner。
    include: ['packages/*/test/**/*.test.ts', 'apps/demo/test/**/*.test.ts'],
  },
})
