import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import electronPath from 'electron'
import { buildDesktop, packageRoot, repoRoot, runVite } from './build.mjs'

const demoDist = path.join(repoRoot, 'apps', 'demo', 'dist', 'index.html')

async function main() {
  await buildDesktop()
  // 自检跑的是真实产物，产物必须是刚构建的，否则测的是上一版
  await runVite(['build'])
  if (!existsSync(demoDist)) throw new Error('demo 构建没有产出 apps/demo/dist/index.html')

  // 窗口不显示（main.ts 里的 STYLEMD_SMOKE 分支），断言跑在真实加载路径上
  const desktop = spawn(electronPath, [packageRoot], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, STYLEMD_SMOKE: '1' },
  })
  desktop.on('exit', (code) => process.exit(code ?? 1))
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
