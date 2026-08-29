// 读本机 key 文件。路径必须和 server 侧（server/src/lib/config.ts）完全一致，
// 两边读写的是同一个 ~/.autoshell/config.json。
// CLI 是 Node 进程，有 fs 权限，所以直接读文件、不经过 server。
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const CONFIG_PATH = join(homedir(), '.autoshell', 'config.json')

export interface Config {
  deepseekApiKey?: string
}

// 读配置。文件不存在 / 内容损坏都返回空对象，让调用方按「没配 key」处理。
export function readConfig(): Config {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Config) : {}
  } catch {
    return {}
  }
}
