// 调本地检索服务（server 常驻 embedding 模型）拿 few-shot 相似示例。
// 服务没起/挂了就返回 []（跳过 RAG），不影响出命令——RAG 只是增强。
// 服务地址可用 AUTOSHELL_URL 覆盖，默认和 server 一致（127.0.0.1:3000）。
const DAEMON_URL = process.env.AUTOSHELL_URL ?? 'http://127.0.0.1:3000'

export async function retrieve(
  intent: string,
  platform: string,
  topK = 3,
): Promise<{ intent: string; command: string }[]> {
  const controller = new AbortController()
  // 只在「服务响应慢」（比如模型还在加载）时兜底超时；服务没起会立刻 ECONNREFUSED。
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${DAEMON_URL}/api/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent, platform, topK }),
      signal: controller.signal,
    })
    if (!res.ok) return []
    const data = (await res.json()) as { examples?: { intent: string; command: string }[] }
    return Array.isArray(data.examples) ? data.examples : []
  } catch {
    console.error('[dsh] 检索服务未运行，跳过 RAG（不影响出命令）')
    return []
  } finally {
    clearTimeout(timer)
  }
}
