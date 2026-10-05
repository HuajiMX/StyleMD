import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import path from 'node:path'
import electronPath from 'electron'
import { buildDesktop, packageRoot, repoRoot, startVite } from './build.mjs'

/**
 * Vite 的 host 默认是 `localhost`，在 IPv6 优先的机器上只绑 `[::1]`——
 * 写死 `127.0.0.1` 会连接被拒。三个候选都探一遍，谁先应就用谁。
 */
const DEV_CANDIDATES = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173']

/**
 * 探出一个能响应的 dev server。
 * 返回 null 表示 timeoutMs 内没有可用的。
 */
async function probeDevServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const url of DEV_CANDIDATES) {
      try {
        const response = await fetch(url, { method: 'HEAD' })
        if (response.ok || response.status === 404) return url
      } catch {
        // 这个地址不通，试下一个
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return null
}

function stop(child) {
  if (child && child.exitCode === null && !child.killed) child.kill()
}

let viteChild = null
let desktopChild = null

/**
 * 主进程与 preload 的改动 HMR 管不了，必须重启 Electron 才生效。
 * 不重启的话，窗口里跑的是旧的 main.cjs——渲染进程热更到新代码、主进程还在旧代码上，
 * 排查起来极其迷惑（真被「注册表解码修好了但界面上还是乱码」坑过一次）。
 */
function launchDesktop(devUrl) {
  const child = spawn(electronPath, [packageRoot], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, STYLEMD_DEV_SERVER: devUrl },
  })
  child.on('exit', (code) => {
    // 已经被新实例取代（我们自己重启的）就别把整个脚本带走
    if (desktopChild !== child) return
    stop(viteChild)
    process.exit(code ?? 0)
  })
  desktopChild = child
  return child
}

function watchMainProcess(devUrl) {
  let pending = null
  return watch(path.join(packageRoot, 'src'), { recursive: true }, () => {
    clearTimeout(pending)
    pending = setTimeout(async () => {
      try {
        await buildDesktop()
      } catch (error) {
        console.error(`[desktop] 主进程构建失败，保留当前窗口：${error?.message ?? error}`)
        return
      }
      console.log('[desktop] 主进程 / preload 有改动，重启窗口')
      const previous = desktopChild
      desktopChild = null
      stop(previous)
      launchDesktop(devUrl)
    }, 200)
  })
}

async function main() {
  await buildDesktop()

  // 5173 上已经有人在服务（比如你自己开着 npm run dev）就直接用它。
  // 再起一个只会撞上 Vite 的 strictPort 直接退出，结果是根本开不出窗口。
  let vite = null
  let devUrl = await probeDevServer(1200)
  if (devUrl) {
    console.log(`[desktop] 复用已在运行的 dev server：${devUrl}`)
  } else {
    vite = startVite()
    viteChild = vite
    vite.on('exit', (code) => {
      if (code !== 0 && code !== null) process.exit(code)
    })
    // 抢跑的话窗口会先加载到连接失败页，得手动刷新一次
    devUrl = await probeDevServer(60_000)
  }

  if (!devUrl) {
    stop(vite)
    throw new Error(`等不到 Vite dev server（${DEV_CANDIDATES.join(' / ')}）`)
  }

  launchDesktop(devUrl)
  const watcher = watchMainProcess(devUrl)
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      watcher.close()
      stop(desktopChild)
      stop(viteChild)
      process.exit(0)
    })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
