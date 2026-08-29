// key 存储接口。只有「存」，没有「查」——
// 浏览器设置页填了 key 就发到这里，server 代写进 ~/.autoshell/config.json。
// 不需要读回接口：是否「已配置」无需后端告知，保存成功即提示即可。
import { Hono } from 'hono'
import { saveApiKey } from '../lib/config'

export const configRoute = new Hono()

// PUT /api/config —— body { deepseekApiKey }
configRoute.put('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body.deepseekApiKey !== 'string' || !body.deepseekApiKey.trim()) {
    return c.json({ error: '缺少字段：deepseekApiKey' }, 400)
  }

  saveApiKey(body.deepseekApiKey.trim())
  return c.json({ ok: true })
})
