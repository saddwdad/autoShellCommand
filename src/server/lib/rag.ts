// RAG 检索：把用户意图和本地命令库里的每条 intent 都向量化，取最相似的 top-k，
// 作为 few-shot 示例喂给 LLM。用 transformers.js 在 server 进程内跑 embedding，
// 模型常驻内存（懒加载 + 启动预热），CLI 通过 /api/retrieve 调它。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pipeline, env } from '@huggingface/transformers'
import { readLibrary, readSharedLibrary } from './library'
import { hashEntry, loadVectorCache, saveVectorCache, type CachedEntry } from './vector-cache'

// HuggingFace 在国内经常连不上，切到镜像站（模型下载和缓存都走这里）。
// 如果你的网络能直连 huggingface.co，删掉这行即可。
env.remoteHost = 'https://hf-mirror.com/'

// 种子库随 server 发布（相对本文件的位置）；反馈库复用 library.ts 的 readLibrary。
const SEED_PATH = fileURLToPath(new URL('../../data/seed-commands.json', import.meta.url))

const MODEL_ID = 'Xenova/bge-small-zh-v1.5'

interface CommandEntry {
  intent: string
  platform: string
  command: string
}

// 命令库 = 种子 + 本地反馈库（server 收到 feedback 时写进 library.json 的那份）
//        + 云共享库（daemon 从 Supabase 拉下来的 shared-library.json 缓存）
// 三份来源按 intent|platform|command 去重，只留一份。
function loadLibrary(): CommandEntry[] {
  const entries: CommandEntry[] = []
  try {
    entries.push(...(JSON.parse(readFileSync(SEED_PATH, 'utf-8')) as CommandEntry[]))
  } catch {
    // 种子文件读不到就只用反馈库
  }
  entries.push(...readLibrary())
  entries.push(...readSharedLibrary())

  const seen = new Set<string>()
  return entries.filter((e) => {
    const key = `${e.intent}|${e.platform}|${e.command}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// 懒加载 embedding 模型（进程内只加载一次）
type TensorLike = { data: Float32Array }
type Extractor = (text: string | string[], opts?: Record<string, unknown>) => Promise<TensorLike>

let extractorPromise: Promise<unknown> | null = null
function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID).catch((err) => {
      // 加载失败必须重置，否则会永远复用这个 rejected promise，检索就再也起不来了
      extractorPromise = null
      throw err
    })
  }
  return extractorPromise as Promise<Extractor>
}

// 启动预热：把模型载入内存。失败不阻断 server 启动，首次 /api/retrieve 会懒加载兜底。
export function warmUp(): Promise<void> {
  return getExtractor().then(
    () => console.log('✅ embedding 模型已加载'),
    (err) => console.warn('⚠️ embedding 模型预热失败（首次检索会重试）：', err?.message ?? err),
  )
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

  console.error(`[embed] 向量缓存：命中 ${entries.length - missing.length} / 新增 ${missing.length}`)

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
