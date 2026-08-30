// 共享命令库同步：从 Supabase 拉「云上积累的命令」，缓存到本地 shared-library.json，
// RAG 检索时（rag.ts 的 loadLibrary）会把它和种子、本地反馈库合并去重。
//
// 云只是「下载源」：embedding 仍在本地跑（把云上的 embedding 放云端，RAG 每次请求要跨网
// 好几秒，不可接受）。所以这里拉的是原始命令（intent/platform/command），本地再向量化。
import { cloudConfigured, pullLibrary } from './supabase'
import { writeSharedLibrary } from './library'

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

// 启动先拉一次，之后每隔 intervalMs 拉一次。失败只是打警告，不影响主流程。
export function startLibrarySync(intervalMs = 10 * 60 * 1000): void {
  void syncSharedLibrary()
  setInterval(() => void syncSharedLibrary(), intervalMs)
}
