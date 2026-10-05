import { contextBridge, ipcRenderer } from 'electron'
import { BRIDGE_KEY, CHANNELS, type StyleMdDesktopBridge } from './bridge'

/**
 * 只暴露一个薄对象。渲染进程拿不到 ipcRenderer 本身，
 * 也就没法随手 invoke 任意频道——加能力必须回到这里显式开一个口子。
 */
const bridge: StyleMdDesktopBridge = {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
  },
  listFontAliases: () => ipcRenderer.invoke(CHANNELS.listFontAliases) as Promise<Record<string, string>>,
}

contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge)
