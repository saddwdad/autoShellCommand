// 调各家大模型生成命令。key / baseURL / model 都由调用方传入，这里不做任何存储/转发。
// 各厂商都是 OpenAI 兼容接口（POST {baseURL}/chat/completions），差别只在 baseURL + model。
// 用 Node 全局 fetch（Node 18+ 内置，无需装依赖）。
// 这个文件在常驻 daemon 里跑，进程存活期间 undici 会复用与 DeepSeek 的 keep-alive 连接，
// 省掉每次 Tab 重连的 TLS 握手（~0.15s）。
// 生成命令前允许 LLM 用工具（list_dir/read_file）自主探索工作区，见 tools.ts。

import { executeTool, TOOL_DEFINITIONS, type ToolDefinition } from './tools'

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
  '你是一个命令行助手。只输出命令本身，不要解释、不要用 markdown 代码块、不要加多余文字。' +
  '严格按给定的 Shell 语法生成命令：PowerShell 用 cmdlet（cd 直接跟路径、不要用 /d，删除用 Remove-Item，列目录用 Get-ChildItem）；cmd 用 cd /d、del、dir；bash/zsh 用 cd、rm、find。' +
  '如果无法确定，输出最合理的单条命令。' +
  '你可以调用工具探索工作区，但只有当意图模糊、需要理解项目上下文时才使用；若意图已经明确（如路径跳转、简单文件/目录操作），直接输出命令，不要调用工具。' +
  '需要探索时：先 list_dir(".") 查看顶层文件，识别项目类型（package.json=Node/前端、pom.xml 或 build.gradle=Java、Cargo.toml=Rust、go.mod=Go、pyproject.toml 或 requirements.txt=Python、Dockerfile 或 docker-compose.yml=容器/部署、Makefile=通用构建），再 read_file 对应关键文件或 README.md 获取具体命令；定位到关键文件就立即读、读完立即输出命令，不要反复 list_dir 遍历。'

function stripFence(text: string): string {
  // 模型偶尔会把命令包进 ```bash ... ``` 围栏，这里剥掉。
  const match = text.trim().match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
  return match ? match[1].trim() : text.trim()
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

// 带状态码的错误：用于区分「provider 不支持 tools（400）」和真正的 key/网络错误
class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function chat(
  baseURL: string,
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
): Promise<ChatMessage> {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(tools && tools.length ? { tools } : {}),
      temperature: 0,
    }),
  })

  if (!res.ok) {
    // 把服务端返回的错误尽量透出（比如 401 = key 不对）
    const errBody = await res.text().catch(() => '')
    throw new HttpError(res.status, `调用失败（HTTP ${res.status}）${errBody ? `：${errBody}` : ''}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: ChatMessage }[]
  }
  const message = data.choices?.[0]?.message
  if (!message) {
    throw new Error('模型返回为空，未生成命令')
  }
  return message
}

// 多轮 tool-calling：模型自主决定是否调用工具；不调用就直接出命令（简单意图一轮结束）。
async function generateWithTools(
  baseURL: string,
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  cwd: string,
): Promise<string> {
  const maxRounds = 3
  for (let round = 0; round < maxRounds; round++) {
    const msg = await chat(baseURL, model, apiKey, messages, TOOL_DEFINITIONS)
    const toolCalls = msg.tool_calls

    if (toolCalls && toolCalls.length > 0) {
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls })
      for (const tc of toolCalls) {
        let args: unknown = {}
        try {
          args = JSON.parse(tc.function.arguments ?? '{}')
        } catch {
          args = {}
        }
        const result = executeTool(tc.function.name, args, cwd)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
      }
      continue
    }

    const content = msg.content
    if (!content) throw new Error('模型返回为空，未生成命令')
    return stripFence(content)
  }
  throw new Error('探索轮数超限，仍未生成命令')
}

// 不带 tools 的单次生成（降级路径，行为和旧版一致）
async function generatePlain(
  baseURL: string,
  model: string,
  apiKey: string,
  messages: ChatMessage[],
): Promise<string> {
  const msg = await chat(baseURL, model, apiKey, messages)
  const content = msg.content
  if (!content) throw new Error('模型返回为空，未生成命令')
  return stripFence(content)
}

export async function generateCommand(
  baseURL: string,
  model: string,
  apiKey: string,
  intent: string,
  platform: string,
  shell: string,
  examples: { intent: string; command: string }[] = [],
  cwd = '',
): Promise<string> {
  // 有历史相似示例时，作为 few-shot 塞进 user message，让模型照着正确命令来
  const exampleBlock = examples.length
    ? `\n\n历史相似示例（意图 → 命令）：\n${examples
        .map((e, i) => `${i + 1}. ${e.intent} → ${e.command}`)
        .join('\n')}`
    : ''
  // 工作区根目录作为探索起点提示；为空则不带工具（纯意图生成，行为同旧版）
  const workspaceBlock = cwd ? `\n工作区根目录：${cwd}` : ''

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `平台：${platform}\nShell：${shell}\n意图：${intent}${exampleBlock}${workspaceBlock}` },
  ]

  if (!cwd) {
    return await generatePlain(baseURL, model, apiKey, messages)
  }

  try {
    return await generateWithTools(baseURL, model, apiKey, messages, cwd)
  } catch (err) {
    // provider 不支持 function calling（HTTP 400）时，降级成不带 tools 的单次生成
    if (err instanceof HttpError && err.status === 400) {
      console.error('[llm] provider 不支持 function calling，降级为无工具生成：', err.message)
      return await generatePlain(baseURL, model, apiKey, messages)
    }
    throw err
  }
}
