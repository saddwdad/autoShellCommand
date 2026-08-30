// key 文件的读写工具。key 只存在用户本机这一份文件里：~/.autoshell/config.json
// 现在支持多个 provider：config 里存「每个 provider 的 key」+ 一个 active。
// 浏览器沙箱不能直接写磁盘，所以由 server 代写；CLI 自己直接读这个文件去调大模型。
//
// 注意：这里的路径必须和 CLI 侧（cli/src/lib/config.ts）完全一致，读写同一个文件。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const CONFIG_DIR = join(homedir(), '.autoshell')
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export interface ProviderConfig {
  apiKey: string
  // baseURL / model 只有 custom provider 需要（内置 provider 的这两个值在代码 registry 里）
  baseURL?: string
  model?: string
}

export interface Config {
  active: string
  providers: Record<string, ProviderConfig>
  // Tab 补全后是否自动执行：false = 只补全命令（默认），true = 补全并回车执行
  autoExecute?: boolean
}

// 兼容旧格式 { deepseekApiKey: "..." } —— 读到时迁移成新结构，用户已存的 key 不丢。
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

// 读配置。文件不存在 / 内容损坏都返回空对象，让上层按「没配」处理。
export function readConfig(): Config {
  try {
    return migrate(JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')))
  } catch {
    return { active: '', providers: {} }
  }
}

// 整文件覆盖写。merge / 校验逻辑放在 route 层，这里只做文件 IO。
export function writeConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}
