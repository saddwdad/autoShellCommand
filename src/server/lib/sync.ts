// 共享命令库同步：从 Supabase 拉「云上积累的命令」，缓存到本地 shared-library.json，
// RAG 检索时（rag.ts 的 loadLibrary）会把它和种子、本地反馈库合并去重。
//
// 云只是「下载源」：embedding 仍在本地跑（把云上的 embedding 放云端，RAG 每次请求要跨网
// 好几秒，不可接受）。所以这里拉的是原始命令（intent/platform/command），本地再向量化。
import { cloudConfigured, pullLibrary, pullTechCommands } from './supabase'
import { writeSharedLibrary, writeSharedTechCommands, type TechCommandEntry } from './library'

export async function syncSharedLibrary(): Promise<void> {
  if (!cloudConfigured()) {
    console.warn('⚠️ 未配置 Supabase（SUPABASE_URL / SUPABASE_ANON_KEY），跳过拉取共享库')
    return
  }
  try {
    const rows = await pullLibrary()
    writeSharedLibrary(rows)
    console.log(`✅ 已同步云共享命令库：${rows.length} 条`)
  } catch (err) {
    console.warn('⚠️ 拉取共享库失败（下次重试）：', (err as Error)?.message ?? err)
  }
}

// 技术栈命令库同步：从 Supabase 拉「云上增补的技术栈命令模板」，缓存到本地，
// tech-commands.ts 检索时把它和内置 tech-commands.json 合并（云端优先）。
export async function syncTechCommands(): Promise<void> {
  if (!cloudConfigured()) return
  try {
    const rows = await pullTechCommands()
    const entries: TechCommandEntry[] = rows.map((r) => ({
      type: r.type,
      label: r.label,
      intent: r.intent,
      cmd: r.cmd,
      params: r.params ?? '',
    }))
    writeSharedTechCommands(entries)
    console.log(`✅ 已同步云技术栈命令库：${entries.length} 条`)
  } catch (err) {
    console.warn('⚠️ 拉取技术栈命令库失败（下次重试）：', (err as Error)?.message ?? err)
  }
}

// 启动先拉一次，之后每隔 intervalMs 拉一次。失败只是打警告，不影响主流程。
export function startCloudSync(intervalMs = 10 * 60 * 1000): void {
  void syncSharedLibrary()
  void syncTechCommands()
  setInterval(() => {
    void syncSharedLibrary()
    void syncTechCommands()
  }, intervalMs)
}
