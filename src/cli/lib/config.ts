// 读本机 key 文件。路径必须和 server 侧（server/src/lib/config.ts）完全一致，
// 两边读写的是同一个 ~/.autoshell/config.json。
// CLI 是 Node 进程，有 fs 权限，所以直接读文件、不经过 server。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const CONFIG_DIR = join(homedir(), '.autoshell')
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export interface ProviderConfig {
  apiKey: string
  // baseURL / model 只有 custom provider 需要
  baseURL?: string
  model?: string
}

export interface Config {
  active: string
  providers: Record<string, ProviderConfig>
  // Tab 补全后是否自动执行：false = 只补全命令（默认），true = 补全并回车执行
  autoExecute?: boolean
}

// 兼容旧格式 { deepseekApiKey: "..." }，读到时迁移成新结构。
function migrate(raw: unknown): Config {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    if (typeof obj.deepseekApiKey === 'string') {
      return { active: 'deepseek', providers: { deepseek: { apiKey: obj.deepseekApiKey } } }
    }
    if (typeof obj.active === 'string' && obj.providers && typeof obj.providers === 'object') {
      return obj as unknown as Config
    }
  }
  return { active: '', providers: {} }
}

// 读配置。文件不存在 / 内容损坏都返回空对象，让调用方按「没配 key」处理。
export function readConfig(): Config {
  try {
    return migrate(JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')))
  } catch {
    return { active: '', providers: {} }
  }
}

// 整文件覆盖写（CLI 侧用，比如 asf config set autoExecute）。merge 逻辑在调用方。
export function writeConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}
