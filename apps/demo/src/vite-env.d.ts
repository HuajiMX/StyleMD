/// <reference types="vite/client" />

import type { EditorDebugHandle } from './lib/editor/types'

declare global {
  interface Window {
    /** 仅在 URL 带 ?e2e=1 时挂上，供端到端脚本读写编辑器。 */
    __stylemdEditor?: EditorDebugHandle
  }
}
