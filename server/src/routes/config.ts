// key 存储接口。职责：存多个 provider 的 key + 切换 active + 读回状态。
// 关键原则：GET 不回传 apiKey —— key 单向流动（浏览器 → server → 文件），
// 浏览器只能知道自己配了哪些、当前用哪个，读不回 key 本身。
import { Hono } from 'hono'
import { readConfig, writeConfig, type Config, type ProviderConfig } from '../lib/config'

// 已知的 provider id 集合（用于校验）。custom 的 baseURL/model 由用户填。
const KNOWN_PROVIDERS = new Set(['deepseek', 'openai', 'kimi', 'glm', 'qwen', 'custom'])

export const configRoute = new Hono()

// GET /api/config —— 返回当前状态（不含 apiKey）。
// providers 里「有 key 就出现在 map 里」= 已配置；baseURL/model 只对 custom 有意义。
configRoute.get('/', (c) => {
  const config = readConfig()
  const providers: Record<string, { baseURL?: string; model?: string }> = {}
  for (const [id, p] of Object.entries(config.providers)) {
    providers[id] = {
      ...(p.baseURL ? { baseURL: p.baseURL } : {}),
      ...(p.model ? { model: p.model } : {}),
    }
  }
  return c.json({ active: config.active, providers, autoExecute: config.autoExecute === true })
})

// PUT /api/config/provider/:id —— 存某个 provider 的 key（merge 进现有 config）
configRoute.put('/provider/:id', async (c) => {
  const id = c.req.param('id')
  if (!KNOWN_PROVIDERS.has(id)) {
    return c.json({ error: `未知的 provider：${id}` }, 400)
  }

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body.apiKey !== 'string' || !body.apiKey.trim()) {
    return c.json({ error: '缺少字段：apiKey' }, 400)
  }

  const provider: ProviderConfig = { apiKey: body.apiKey.trim() }
  if (id === 'custom') {
    if (
      typeof body.baseURL !== 'string' ||
      !body.baseURL.trim() ||
      typeof body.model !== 'string' ||
      !body.model.trim()
    ) {
      return c.json({ error: '自定义 provider 需要 baseURL 和 model' }, 400)
    }
    provider.baseURL = body.baseURL.trim()
    provider.model = body.model.trim()
  }

  const config: Config = readConfig()
  config.providers[id] = provider
  // 还没有 active 时，顺手把刚存的设为 active（首次配置的体验）
  if (!config.active) config.active = id
  writeConfig(config)
  return c.json({ ok: true })
})

// PUT /api/config/active —— 切换当前使用的 provider（必须已配置）
configRoute.put('/active', async (c) => {
  const body = await c.req.json().catch(() => null)
  const provider = body && typeof body === 'object' ? (body as { provider?: unknown }).provider : undefined
  if (typeof provider !== 'string' || !KNOWN_PROVIDERS.has(provider)) {
    return c.json({ error: '无效的 provider' }, 400)
  }

  const config = readConfig()
  if (!config.providers[provider]?.apiKey) {
    return c.json({ error: `provider ${provider} 尚未配置 key` }, 400)
  }

  config.active = provider
  writeConfig(config)
  return c.json({ ok: true })
})

// PUT /api/config/autoExecute —— 设置 Tab 补全后是否自动执行
configRoute.put('/autoExecute', async (c) => {
  const body = await c.req.json().catch(() => null)
  const enabled = body && typeof body === 'object' ? (body as { enabled?: unknown }).enabled : undefined
  if (typeof enabled !== 'boolean') {
    return c.json({ error: '缺少字段：enabled（boolean）' }, 400)
  }

  const config = readConfig()
  config.autoExecute = enabled
  writeConfig(config)
  return c.json({ ok: true })
})
