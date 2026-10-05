/**
 * 桌面壳与渲染进程之间的唯一契约。
 * 主进程、preload、渲染进程都只认这里定义的名字，避免三处各写一份魔法字符串。
 */
export interface StyleMdDesktopBridge {
  /** 恒定 true，渲染进程用它区分「跑在桌面壳里」与「跑在浏览器里」。 */
  readonly isDesktop: true
  readonly platform: string
  readonly versions: { electron: string; chrome: string; node: string }
  /**
   * 英文家族名 → 本地化（中文）名。
   * 字体列表不在这里：渲染进程自己的 `queryLocalFonts()` 就是系统名册。
   */
  listFontAliases(): Promise<Record<string, string>>
}

/** 挂在 window 上的属性名。 */
export const BRIDGE_KEY = 'stylemdDesktop'

/** IPC 频道名集中在这里，改名字时两端不会走散。 */
export const CHANNELS = {
  listFontAliases: 'stylemd:fonts:aliases',
} as const
