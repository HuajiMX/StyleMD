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
    include: ['packages/*/test/**/*.test.ts'],
  },
})
