import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import electronPath from 'electron'
import { buildDesktop, packageRoot, repoRoot, runVite } from './build.mjs'

const demoDist = path.join(repoRoot, 'apps', 'demo', 'dist', 'index.html')

async function main() {
  await buildDesktop()
  // 每次重建：start 是「看看现在这版长什么样」，拿旧产物开窗口比多等一秒更让人困惑
  await runVite(['build'])
  if (!existsSync(demoDist)) throw new Error('demo 构建没有产出 apps/demo/dist/index.html')

  const desktop = spawn(electronPath, [packageRoot], { cwd: repoRoot, stdio: 'inherit' })
  desktop.on('exit', (code) => process.exit(code ?? 0))
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
