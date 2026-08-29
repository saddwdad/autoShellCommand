// RAG 检索：把用户意图和本地命令库里的每条 intent 都向量化，取最相似的 top-k，
// 作为 few-shot 示例喂给 LLM。用 transformers.js 在本地跑 embedding，不依赖云端。
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline, env } from '@huggingface/transformers'
import { hashEntry, loadVectorCache, saveVectorCache, type CachedEntry } from './vector-cache'

// HuggingFace 在国内经常连不上，切到镜像站（模型下载和缓存都走这里）。
// 如果你的网络能直连 huggingface.co，删掉这行即可。
env.remoteHost = 'https://hf-mirror.com/'

// 种子库随 CLI 发布（相对本文件的位置）；本地反馈库在用户主目录下。
const SEED_PATH = fileURLToPath(new URL('../../data/seed-commands.json', import.meta.url))
const LIBRARY_PATH = join(homedir(), '.autoshell', 'library.json')

const MODEL_ID = 'Xenova/bge-small-zh-v1.5'

interface CommandEntry {
  intent: string
  platform: string
  command: string
}

// 命令库 = 种子 + 本地反馈库
function loadLibrary(): CommandEntry[] {
  const entries: CommandEntry[] = []
  try {
    entries.push(...(JSON.parse(readFileSync(SEED_PATH, 'utf-8')) as CommandEntry[]))
  } catch {
    // 种子文件读不到就只用反馈库
  }
  try {
    entries.push(...(JSON.parse(readFileSync(LIBRARY_PATH, 'utf-8')) as CommandEntry[]))
  } catch {
    // 本地库不存在则忽略
  }
  return entries
}

// 懒加载 embedding 模型（每次运行只加载一次）
type TensorLike = { data: Float32Array }
type Extractor = (text: string | string[], opts?: Record<string, unknown>) => Promise<TensorLike>

let extractorPromise: Promise<unknown> | null = null
function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID)
  }
  return extractorPromise as Promise<Extractor>
}

export async function retrieve(
  intent: string,
  platform: string,
  topK = 3,
): Promise<{ intent: string; command: string }[]> {
  const entries = loadLibrary()
  if (entries.length === 0) return []

  const cache = loadVectorCache(MODEL_ID)

  // 找出缺向量的条目，只对它们批量 embed（其余直接复用缓存）
  const missing = entries.filter((e) => !cache.has(hashEntry(e.intent, e.platform, e.command)))

  const extractor = await getExtractor()

  if (missing.length > 0) {
    const vecs = await extractor(
      missing.map((e) => e.intent),
      { pooling: 'mean', normalize: true },
    )
    const dim = vecs.data.length / missing.length
    missing.forEach((e, i) => {
      const key = hashEntry(e.intent, e.platform, e.command)
      cache.set(key, {
        key,
        intent: e.intent,
        platform: e.platform,
        command: e.command,
        vector: Array.from(vecs.data.slice(i * dim, (i + 1) * dim)),
      })
    })
  }

  console.error(`[dsh] 向量缓存：命中 ${entries.length - missing.length} / 新增 ${missing.length}`)

  // 只保留当前库里的条目（清掉已删除的旧缓存），且只在有变化时才落盘
  const current = entries
    .map((e) => cache.get(hashEntry(e.intent, e.platform, e.command)))
    .filter((c): c is CachedEntry => c !== undefined)
  if (missing.length > 0 || cache.size !== entries.length) {
    saveVectorCache(MODEL_ID, current)
  }

  // 优先同平台（同平台命令才真正有用），不足 topK 再用其它平台兜底
  const samePlatform = entries.filter((e) => e.platform === platform)
  const candidates = samePlatform.length >= topK ? samePlatform : entries

  const q = await extractor(intent, { pooling: 'mean', normalize: true })
  const qVec = q.data
  const dim = qVec.length

  // 归一化后点积 = 余弦相似度
  const scored = candidates.map((entry) => {
    const cached = cache.get(hashEntry(entry.intent, entry.platform, entry.command))
    const vec = cached?.vector
    if (!vec) return { entry, score: -Infinity }
    let dot = 0
    for (let d = 0; d < dim; d++) dot += qVec[d] * vec[d]
    return { entry, score: dot }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).map((s) => ({ intent: s.entry.intent, command: s.entry.command }))
}
