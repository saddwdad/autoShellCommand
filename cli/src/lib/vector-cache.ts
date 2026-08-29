// 向量缓存：把命令库里每条 intent 的 embedding 算一次、落到磁盘，
// 下次只 embed 新增/变化的条目，避免每次运行都对全库重新向量化。
// 缓存只做加速，不影响检索结果（缺了随时删掉重建）。
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const VECTOR_CACHE_PATH = join(homedir(), '.autoshell', 'vectors.json')

export interface CachedEntry {
  key: string
  intent: string
  platform: string
  command: string
  vector: number[]
}

interface VectorCacheFile {
  model: string
  entries: CachedEntry[]
}

// 条目内容做 key：intent/platform/command 任一变化都算新条目（旧向量作废重算）
export function hashEntry(intent: string, platform: string, command: string): string {
  return createHash('sha1').update(`${intent}\n${platform}\n${command}`).digest('hex')
}

// 读缓存。model 不匹配（模型换代）直接返回空 Map，让上层全量重建。
export function loadVectorCache(model: string): Map<string, CachedEntry> {
  const map = new Map<string, CachedEntry>()
  let raw: VectorCacheFile
  try {
    raw = JSON.parse(readFileSync(VECTOR_CACHE_PATH, 'utf-8')) as VectorCacheFile
  } catch {
    return map
  }
  if (raw.model !== model) return map
  for (const e of raw.entries) map.set(e.key, e)
  return map
}

export function saveVectorCache(model: string, entries: CachedEntry[]): void {
  mkdirSync(dirname(VECTOR_CACHE_PATH), { recursive: true })
  const data: VectorCacheFile = { model, entries }
  writeFileSync(VECTOR_CACHE_PATH, JSON.stringify(data))
}
