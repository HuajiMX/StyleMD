import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)

export const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
export const repoRoot = path.resolve(packageRoot, '..', '..')
export const demoRoot = path.join(repoRoot, 'apps', 'demo')

/**
 * 直接用 node 跑 Vite 的入口，而不是 `spawn('npm.cmd', ...)`。
 * Node 从 v20.12 / v18.20 起在不开 shell 的情况下拒绝启动 `.cmd`（报 `spawn EINVAL`），
 * 开 shell 又会让 Ctrl+C 只杀掉 cmd.exe、把 Vite 留成孤儿进程。
 */
function viteCli(args) {
  const entry = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')
  return spawn(process.execPath, [entry, ...args], { cwd: demoRoot, stdio: 'inherit' })
}

/** 起 Vite 子进程（dev server 用），进程由调用方管理生命周期。 */
export function startVite(args = []) {
  return viteCli(args)
}

/** 跑一次 Vite 并等它结束（构建产物用）。 */
export function runVite(args) {
  return new Promise((resolve, reject) => {
    const child = viteCli(args)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`vite ${args.join(' ')} 退出码 ${code}`))))
  })
}

/**
 * 主进程与 preload 打成 CJS：Electron 的 main 入口和 sandbox 下的 preload
 * 都仍以 CJS 最稳，省掉 `type: module` 与 sandbox 组合的一堆边角问题。
 */
export async function buildDesktop() {
  await build({
    entryPoints: [path.join(packageRoot, 'src', 'main.ts'), path.join(packageRoot, 'src', 'preload.ts')],
    outdir: path.join(packageRoot, 'dist'),
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    sourcemap: true,
    // electron 由运行时提供，打进产物反而会带上一个假的模块
    external: ['electron'],
    logLevel: 'info',
  })
}

const isDirectRun = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) await buildDesktop()
