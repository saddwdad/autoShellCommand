// 调 DeepSeek 生成命令。key 由调用方传入，这里不做任何 key 的存储/转发。
// 用 Node 全局 fetch（Node 18+ 内置，无需装依赖）。

const API_URL = 'https://api.deepseek.com/chat/completions'

const SYSTEM_PROMPT =
  '你是一个命令行助手。只输出命令本身，不要解释、不要用 markdown 代码块、不要加多余文字。如果无法确定，输出最合理的单条命令。'

function stripFence(text: string): string {
  // DeepSeek 偶尔会把命令包进 ```bash ... ``` 围栏，这里剥掉。
  const match = text.trim().match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
  return match ? match[1].trim() : text.trim()
}

export async function generateCommand(
  apiKey: string,
  intent: string,
  platform: string,
): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `平台：${platform}\n意图：${intent}` },
      ],
      temperature: 0,
    }),
  })

  if (!res.ok) {
    // 把 DeepSeek 返回的错误尽量透出（比如 401 = key 不对）
    const errBody = await res.text().catch(() => '')
    throw new Error(`DeepSeek 调用失败（HTTP ${res.status}）${errBody ? `：${errBody}` : ''}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('DeepSeek 返回为空，未生成命令')
  }
  return stripFence(content)
}
