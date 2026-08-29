// 调各家大模型生成命令。key / baseURL / model 都由调用方传入，这里不做任何存储/转发。
// 各厂商都是 OpenAI 兼容接口（POST {baseURL}/chat/completions），差别只在 baseURL + model。
// 用 Node 全局 fetch（Node 18+ 内置，无需装依赖）。

export interface ProviderMeta {
  id: string
  label: string
  baseURL: string
  model: string
}

// provider 表：内置厂商的 baseURL + 默认 model 都在这里，config 里只存 key。
// custom 的 baseURL/model 由用户填、存在 config 里，所以这里留空。
export const PROVIDERS: ProviderMeta[] = [
  { id: 'deepseek', label: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { id: 'openai', label: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'kimi', label: 'Kimi (Moonshot)', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { id: 'glm', label: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { id: 'qwen', label: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'custom', label: '自定义', baseURL: '', model: '' },
]

const SYSTEM_PROMPT =
  '你是一个命令行助手。只输出命令本身，不要解释、不要用 markdown 代码块、不要加多余文字。如果无法确定，输出最合理的单条命令。'

function stripFence(text: string): string {
  // 模型偶尔会把命令包进 ```bash ... ``` 围栏，这里剥掉。
  const match = text.trim().match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
  return match ? match[1].trim() : text.trim()
}

export async function generateCommand(
  baseURL: string,
  model: string,
  apiKey: string,
  intent: string,
  platform: string,
): Promise<string> {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `平台：${platform}\n意图：${intent}` },
      ],
      temperature: 0,
    }),
  })

  if (!res.ok) {
    // 把服务端返回的错误尽量透出（比如 401 = key 不对）
    const errBody = await res.text().catch(() => '')
    throw new Error(`调用失败（HTTP ${res.status}）${errBody ? `：${errBody}` : ''}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('模型返回为空，未生成命令')
  }
  return stripFence(content)
}
