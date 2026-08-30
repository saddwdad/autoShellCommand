// 把 web/dist 的构建产物复制到 dist/web，让 daemon 顺带托管前端控制面板。
// 用 node:fs 手写递归复制（不用 shell 的 cp）。注意：Node 24 在 Windows 上
// cpSync({ recursive: true }) 会直接崩（exit 127），所以改成 readdirSync + copyFileSync 的
// 跨平台实现。build 顺序保证 tsup 的 clean 先清空 dist、之后 vite 构建、最后才复制，
// web 产物不会被 tsup 删掉。
import { mkdirSync, readdirSync, copyFileSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const from = join(process.cwd(), 'web', 'dist')
const to = join(process.cwd(), 'dist', 'web')

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    const s = join(src, entry)
    const d = join(dest, entry)
    if (statSync(s).isDirectory()) {
      copyDir(s, d)
    } else {
      copyFileSync(s, d)
    }
  }
}

rmSync(to, { recursive: true, force: true })
copyDir(from, to)
console.log('web build copied to dist/web')
