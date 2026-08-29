// key 文件的读写工具。
// key 只存在用户本机这一份文件里：~/.autoshell/config.json
// 浏览器沙箱不能直接写磁盘，所以由 server 代写（saveApiKey）；
// CLI 是 Node 进程，自己直接读这个文件去调 DeepSeek，不经过 server。
//
// 注意：这里的路径必须和 CLI 侧（cli/src/lib/config.ts）完全一致，
// 两边读写的是同一个文件。
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const CONFIG_DIR = join(homedir(), '.autoshell')
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

// 写 key。目录不存在则先创建，然后整文件覆盖写入 { deepseekApiKey }。
// server 只负责写、不负责读回（没有「查 key」的需求）。
export function saveApiKey(key: string): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify({ deepseekApiKey: key }, null, 2))
}
