// 检索接口：CLI 生成命令前调它拿 few-shot 相似示例。
// 无鉴权——返回的是「命令」而非 key/反馈等敏感数据，且只服务本机 CLI。
import { Hono } from 'hono'
import { retrieve } from '../lib/rag'

export const retrieveRoute = new Hono()

// POST /api/retrieve —— body { intent, platform, topK? } → { examples: [{ intent, command }] }
retrieveRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const intent = body && typeof body === 'object' ? (body as { intent?: unknown }).intent : undefined
  const platform = body && typeof body === 'object' ? (body as { platform?: unknown }).platform : undefined
  const topK = body && typeof body === 'object' ? (body as { topK?: unknown }).topK : undefined

  if (typeof intent !== 'string' || !intent.trim() || typeof platform !== 'string') {
    return c.json({ error: '缺少字段：intent, platform' }, 400)
  }

  const k = typeof topK === 'number' && Number.isFinite(topK) ? Math.max(1, Math.floor(topK)) : 3
  const examples = await retrieve(intent.trim(), platform, k)
  return c.json({ examples })
})
