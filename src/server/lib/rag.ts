// RAG 检索：把用户意图和本地命令库里的每条 intent 都向量化，取最相似的 top-k，
// 作为 few-shot 示例喂给 LLM。用 transformers.js 在 server 进程内跑 embedding，
// 模型常驻内存（懒加载 + 启动预热），CLI 通过 /api/retrieve 调它。
import { join } from 'node:path'
import { pipeline, env, LogLevel } from '@huggingface/transformers'
import { readLibrary, readSharedLibrary } from './library'
import { hashEntry, loadVectorCache, saveVectorCache, type CachedEntry } from './vector-cache'
import { CONFIG_DIR } from './config'
import seedCommands from '../../data/seed-commands.json'

// HuggingFace 在国内经常连不上，切到镜像站（模型下载和缓存都走这里）。
// 如果你的网络能直连 huggingface.co，删掉这行即可。
env.remoteHost = 'https://hf-mirror.com/'

// 模型缓存放到用户目录（~/.autoshell/models），而不是 node_modules 里：
// 这样 npm 重装 / 升级 autoshell 不会把下好的 embedding 模型一起清掉。
env.cacheDir = join(CONFIG_DIR, 'models')

// 打印 transformers.js 内部日志（下载 URL、缓存命中等），配合 progress_callback 一起排查下载问题
env.logLevel = LogLevel.INFO

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
  // 种子库直接 import 内联：打包时 esbuild 把 JSON 打进 bundle，无运行时读文件路径问题。
  const entries: CommandEntry[] = [...(seedCommands as CommandEntry[])]
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

// 下载/加载进度回调：打印到 stderr，让用户在 asf serve 终端能看到模型到底下没下下来、下到哪
function logModelProgress(e: any): void {
  const status = String(e?.status ?? '')
  const name = String(e?.file ?? e?.name ?? '')
  if (status === 'progress') {
    const loaded = Number(e?.loaded ?? 0)
    const total = Number(e?.total ?? 0)
    if (total > 0) {
      const pct = ((loaded / total) * 100).toFixed(1)
      console.error(`[model] 下载 ${name} ${pct}% (${(loaded / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)} MB)`)
    }
    return
  }
  if (status === 'initiate') console.error(`[model] 开始 ${name}`)
  else if (status === 'download') console.error(`[model] 下载 ${name}`)
  else if (status === 'done') console.error(`[model] 完成 ${name}`)
  else if (status === 'ready') console.error(`[model] 模型已就绪`)
}

let extractorPromise: Promise<unknown> | null = null
function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID, {
      progress_callback: logModelProgress,
    }).catch((err) => {
      // 加载失败必须重置，否则会永远复用这个 rejected promise，检索就再也起不来了
      extractorPromise = null
      throw err
    })
  }
  return extractorPromise as Promise<Extractor>
}

// 启动预热：把模型载入内存。失败不阻断 server 启动，首次 /api/retrieve 会懒加载兜底。
export function warmUp(): Promise<void> {
  console.error(
    `[model] 下载源 ${env.remoteHost}，缓存目录 ${env.cacheDir}，Node ${process.version}，` +
      `useFS=${env.useFS} useFSCache=${env.useFSCache} useBrowserCache=${env.useBrowserCache}`,
  )
  return getExtractor().then(
    () => console.log('✅ embedding 模型已加载'),
    (err) => {
      console.warn('⚠️ embedding 模型预热失败（首次检索会重试）：', err?.message ?? err)
      console.warn('[model] 完整堆栈：\n' + (err?.stack ?? '(无堆栈)'))
    },
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
