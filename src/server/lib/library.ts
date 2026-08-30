// 本地命令库的读写工具：~/.autoshell/library.json
// 这里存的是「用户反馈里确认过的正确命令」，由 server 在收到反馈时写入，
// CLI 侧会读它 + 种子库一起做 RAG 检索。
// 种子库不在这里（它随 CLI 发布），这里只管「反馈 → 库」的累积。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONFIG_DIR } from './config'

export const LIBRARY_PATH = join(CONFIG_DIR, 'library.json')
// 云共享命令库的本地缓存：daemon 从 Supabase 拉下来存这里，RAG 时和种子/本地反馈库合并。
export const SHARED_LIBRARY_PATH = join(CONFIG_DIR, 'shared-library.json')

export interface CommandEntry {
  intent: string
  platform: string
  command: string
}

// 读库。文件不存在 / 损坏都返回空数组。
export function readLibrary(): CommandEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(LIBRARY_PATH, 'utf-8'))
    return Array.isArray(parsed) ? (parsed as CommandEntry[]) : []
  } catch {
    return []
  }
}

// 追加一条（按 intent|platform|command 去重）。
export function appendToLibrary(entry: CommandEntry): void {
  const list = readLibrary()
  const key = `${entry.intent}|${entry.platform}|${entry.command}`
  if (list.some((e) => `${e.intent}|${e.platform}|${e.command}` === key)) {
    return
  }
  list.push(entry)
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(LIBRARY_PATH, JSON.stringify(list, null, 2))
}

// 读云共享库缓存。文件不存在 / 损坏都返回空数组。
export function readSharedLibrary(): CommandEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(SHARED_LIBRARY_PATH, 'utf-8'))
    return Array.isArray(parsed) ? (parsed as CommandEntry[]) : []
  } catch {
    return []
  }
}

// 整份覆盖写共享库缓存（daemon 从云拉完后的结果）。
export function writeSharedLibrary(entries: CommandEntry[]): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(SHARED_LIBRARY_PATH, JSON.stringify(entries, null, 2))
}
