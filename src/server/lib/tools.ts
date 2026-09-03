// 文件系统工具：让 LLM 在生成命令前自主探索工作区（list_dir / read_file）。
// 所有路径都严格限制在 cwd 子树内，并排除敏感/大文件，防止把本机机密交给 LLM。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve, sep } from 'node:path'

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

// 工具声明（OpenAI function-calling 格式），llm.ts 直接拿去做 body.tools
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: '列出工作区内某个子目录的内容，返回相对路径并标注文件(f)/目录(d)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要列出的目录路径，相对工作区根目录；"."或空串表示根目录' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取工作区内某个文件的内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要读取的文件路径，相对工作区根目录' },
        },
        required: ['path'],
      },
    },
  },
]

const MAX_DIR_ENTRIES = 200
const MAX_FILE_CHARS = 8 * 1024

// 大目录/生成物/编辑器目录：列目录时跳过
const EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', '.cache',
  '__pycache__', 'coverage', '.venv', 'target', '.turbo', '.idea', '.vscode',
])

// 敏感文件：绝不把内容交给 LLM
function isSensitive(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower === '.env' ||
    lower.startsWith('.env.') ||
    lower.endsWith('.key') ||
    lower.endsWith('.pem') ||
    lower.endsWith('.p12') ||
    lower.startsWith('id_rsa') ||
    lower.startsWith('id_ed25519') ||
    lower.startsWith('id_dsa')
  )
}

// 把相对路径安全解析到 cwd 子树内；越界（../、绝对路径指向外部）返回 null
function resolveInside(cwd: string, rel: string): string | null {
  const target = resolve(cwd, rel)
  if (target !== cwd && !target.startsWith(cwd + sep)) return null
  return target
}

function listDir(cwd: string, rel: string): string {
  const target = resolveInside(cwd, rel || '.')
  if (!target) return '错误：路径超出工作区范围'
  let entries
  try {
    entries = readdirSync(target, { withFileTypes: true })
  } catch (e) {
    return `错误：无法读取目录 ${rel}：${(e as Error).message}`
  }
  const lines: string[] = []
  for (const e of entries) {
    if (e.isDirectory() && EXCLUDED_DIRS.has(e.name)) continue
    if (isSensitive(e.name)) continue
    lines.push(`${e.isDirectory() ? 'd' : 'f'}  ${e.name}`)
    if (lines.length >= MAX_DIR_ENTRIES) {
      lines.push('…（已截断）')
      break
    }
  }
  return lines.length ? lines.join('\n') : '（空目录）'
}

function readFile(cwd: string, rel: string): string {
  const target = resolveInside(cwd, rel)
  if (!target) return '错误：路径超出工作区范围'
  if (isSensitive(basename(target))) return '错误：该文件不允许读取'

  let stat
  try {
    stat = statSync(target)
  } catch {
    return `错误：文件不存在或无法访问 ${rel}`
  }
  if (stat.isDirectory()) return `错误：${rel} 是目录，请用 list_dir`

  let content: string
  try {
    content = readFileSync(target, 'utf-8')
  } catch (e) {
    return `错误：无法读取文件 ${rel}：${(e as Error).message}`
  }
  // 二进制文件（含 NUL 字节）直接拒读，避免把乱码喂给模型
  if (content.includes('\0')) return `错误：${rel} 是二进制文件，无法以文本读取`

  if (content.length > MAX_FILE_CHARS) {
    content = content.slice(0, MAX_FILE_CHARS) + '\n…（内容已截断）'
  }
  return content
}

export function executeTool(name: string, args: unknown, cwd: string): string {
  const a = (args && typeof args === 'object' ? args : {}) as { path?: string }
  const rel = typeof a.path === 'string' ? a.path : '.'
  if (name === 'list_dir') return listDir(cwd, rel)
  if (name === 'read_file') return readFile(cwd, rel)
  return `错误：未知工具 ${name}`
}
