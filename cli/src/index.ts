// CLI 入口：dsh "意图" [--platform linux|macos|windows]
// 流程：解析参数 → 读本机 config（active provider + key）→ 调对应厂商 → 打印命令。
// 全程不经过 server（server 是否在线都不影响生成）。
import { parseArgs } from 'node:util'
import { readConfig } from './lib/config'
import { generateCommand, PROVIDERS } from './lib/llm'
import { retrieve } from './lib/rag'

// process.platform 的原始值映射成统一的 platform 名
function detectPlatform(): string {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'macos'
    default:
      return 'linux'
  }
}

function printUsage(): void {
  console.log('用法：dsh "自然语言意图" [--platform windows|macos|linux]')
  console.log('示例：dsh "找出大于 100M 的文件"')
  console.log('      dsh --platform linux "列出占用端口的进程"')
}

async function main(): Promise<void> {
  // 解析参数：位置参数（意图）放进 positionals，--platform 放进 values
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      platform: { type: 'string' },
      debug: { type: 'boolean' },
    },
    allowPositionals: true,
  })

  const intent = positionals.join(' ').trim()
  if (!intent) {
    printUsage()
    process.exitCode = 1
    return
  }

  const platform = values.platform ?? detectPlatform()

  const config = readConfig()
  const active = config.active
  if (!active) {
    console.error('尚未配置任何 provider。请先在浏览器设置页选择 provider 并填入 key。')
    process.exitCode = 1
    return
  }

  const providerConfig = config.providers[active]
  if (!providerConfig || !providerConfig.apiKey) {
    console.error(`当前 provider「${active}」未配置 key，请到设置页配置。`)
    process.exitCode = 1
    return
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

  console.error(`[dsh] 使用 provider: ${label}`)

  // RAG：从命令库检索相似示例，作为 few-shot 喂给模型
  const examples = await retrieve(intent, platform)
  if (values.debug) {
    console.error('[dsh] 检索到的相似示例：')
    for (const [i, e] of examples.entries()) {
      console.error(`  ${i + 1}. ${e.intent} → ${e.command}`)
    }
  }

  try {
    const command = await generateCommand(baseURL, model, providerConfig.apiKey, intent, platform, examples)
    console.log(command)
  } catch (e) {
    console.error(e instanceof Error ? e.message : '生成失败')
    process.exitCode = 1
  }
}

main()
