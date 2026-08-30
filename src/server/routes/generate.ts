// 命令生成接口：薄客户端 asf 把「意图」POST 到这里，daemon 在本机读 key、做 RAG、调 LLM。
// key 只在这台机器上（readConfig 读 ~/.autoshell/config.json），不上云、不经过任何外部服务。
// 常驻进程 = 复用到 DeepSeek 的 TLS 连接，embedding 也一直热着。
import { Hono } from 'hono'
import { readConfig } from '../lib/config'
import { retrieve } from '../lib/rag'
import { generateCommand, PROVIDERS } from '../lib/llm'

export const generateRoute = new Hono()

// POST /api/generate —— body { intent, platform, shell, debug? } → { command, label, examples? }
generateRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const intent = typeof obj.intent === 'string' ? obj.intent : ''
  const platform = typeof obj.platform === 'string' ? obj.platform : ''
  const shell = typeof obj.shell === 'string' ? obj.shell : ''
  const debug = obj.debug === true

  if (!intent.trim()) {
    return c.json({ error: '缺少字段：intent' }, 400)
  }
  if (!platform || !shell) {
    return c.json({ error: '缺少字段：platform, shell' }, 400)
  }

  const config = readConfig()
  const active = config.active
  if (!active) {
    return c.json({ error: '尚未配置任何 provider。请先在浏览器设置页选择 provider 并填入 key。' }, 400)
  }
  const providerConfig = config.providers[active]
  if (!providerConfig?.apiKey) {
    return c.json({ error: `当前 provider「${active}」未配置 key，请到设置页配置。` }, 400)
  }

  // 解析 baseURL / model：custom 从 config 拿，其余查 provider 表
  let baseURL: string
  let model: string
  let label: string
  if (active === 'custom') {
    baseURL = providerConfig.baseURL ?? ''
    model = providerConfig.model ?? ''
    label = '自定义'
  } else {
    const meta = PROVIDERS.find((p) => p.id === active)
    baseURL = meta?.baseURL ?? ''
    model = meta?.model ?? ''
    label = meta?.label ?? active
  }

  // RAG：同进程内直接检索（不再走 HTTP），embedding 常驻。
  // 失败（模型没下下来 / 网络不通）就降级成无示例，不阻断生成。
  let examples: { intent: string; command: string }[] = []
  try {
    examples = await retrieve(intent.trim(), platform)
  } catch (err) {
    console.error('[generate] RAG 检索失败，跳过（不影响出命令）：', (err as Error)?.message ?? err)
  }

  try {
    const command = await generateCommand(
      baseURL,
      model,
      providerConfig.apiKey,
      intent.trim(),
      platform,
      shell,
      examples,
    )
    return c.json({ command, label, ...(debug ? { examples } : {}) })
  } catch (e) {
    // 502 = 上游 LLM 出错（key 不对、超时、网络等），把原因透给客户端
    return c.json({ error: e instanceof Error ? e.message : '生成失败' }, 502)
  }
})
