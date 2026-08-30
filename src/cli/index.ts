// CLI 入口：薄客户端。
// dsh 不再直接调 LLM——它把「意图」POST 给常驻 daemon（127.0.0.1:3000 的 server），
// 由 daemon 在本机读 key、做 RAG、调 DeepSeek。key 不出本机，且 daemon 复用 TLS 连接。
// config get/set 和 shell-init 仍然本地处理，不依赖 daemon 在线。
import { parseArgs } from 'node:util'
import { readConfig, writeConfig } from './lib/config'
import { shellInit } from './lib/shell'

// daemon 地址：可用 AUTOSHELL_URL 覆盖，默认和 server 一致（127.0.0.1:3000）
const DAEMON_URL = process.env.AUTOSHELL_URL ?? 'http://127.0.0.1:3000'

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

// 按操作系统猜默认 shell：Windows 默认 PowerShell（cmd 用户可用 --shell cmd 覆盖），
// macOS 默认 zsh，Linux 默认 bash。shell 钩子会显式传 --shell，这里只兜底手动调用。
function detectShell(): string {
  switch (process.platform) {
    case 'win32':
      return 'powershell'
    case 'darwin':
      return 'zsh'
    default:
      return 'bash'
  }
}

function printUsage(): void {
  console.log('用法：dsh "自然语言意图" [--platform windows|macos|linux] [--shell powershell|cmd|bash|zsh]')
  console.log('示例：dsh "找出大于 100M 的文件"')
  console.log('      dsh --platform linux --shell bash "列出占用端口的进程"')
}

async function main(): Promise<void> {
  // 解析参数：位置参数（意图）放进 positionals，--platform / --shell 放进 values
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      platform: { type: 'string' },
      shell: { type: 'string' },
      debug: { type: 'boolean' },
    },
    allowPositionals: true,
  })

  // `dsh shell-init <powershell|bash>`：打印 Tab 补全的 shell 片段，不跑生成流程
  if (positionals[0] === 'shell-init') {
    const snippet = shellInit(positionals[1] ?? '')
    if (!snippet) {
      console.error('用法：dsh shell-init <powershell|bash>')
      process.exitCode = 1
    } else {
      process.stdout.write(snippet)
    }
    return
  }

  // `dsh config get/set autoExecute`：读/写 Tab 补全的自动执行开关（本地文件，不依赖 daemon）
  if (positionals[0] === 'config') {
    const op = positionals[1]
    const key = positionals[2]
    if (op === 'get' && key === 'autoExecute') {
      console.log(readConfig().autoExecute === true ? 'true' : 'false')
    } else if (op === 'set' && key === 'autoExecute') {
      const val = positionals[3]
      if (val !== 'true' && val !== 'false') {
        console.error('用法：dsh config set autoExecute <true|false>')
        process.exitCode = 1
      } else {
        const config = readConfig()
        config.autoExecute = val === 'true'
        writeConfig(config)
        console.log(`autoExecute = ${val}`)
      }
    } else {
      console.error('用法：dsh config get autoExecute | dsh config set autoExecute <true|false>')
      process.exitCode = 1
    }
    return
  }

  const intent = positionals.join(' ').trim()
  if (!intent) {
    printUsage()
    process.exitCode = 1
    return
  }

  const platform = values.platform ?? detectPlatform()
  const shell = values.shell ?? detectShell()

  try {
    const res = await fetch(`${DAEMON_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent, platform, shell, debug: values.debug === true }),
    })

    const data = (await res.json().catch(() => null)) as {
      command?: string
      label?: string
      error?: string
      examples?: { intent: string; command: string }[]
    } | null

    if (!res.ok || !data?.command) {
      console.error(data?.error ?? `daemon 返回异常（HTTP ${res.status}）`)
      process.exitCode = 1
      return
    }

    if (data.label) console.error(`[dsh] 使用 provider: ${data.label}`)
    if (values.debug && data.examples) {
      console.error('[dsh] 检索到的相似示例：')
      for (const [i, e] of data.examples.entries()) {
        console.error(`  ${i + 1}. ${e.intent} → ${e.command}`)
      }
    }
    console.log(data.command)
  } catch {
    // 网络错误（ECONNREFUSED 等）= daemon 没在跑
    console.error('autoshell daemon 未运行，请先启动服务端（cd server && npm start）')
    process.exitCode = 1
  }
}

main()
