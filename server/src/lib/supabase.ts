// Supabase（PostgREST）客户端：daemon 匿名读写云上的「反馈库」和「共享命令库」。
//
// 权限模型（关键）：
// - 随 npm 包分发的是 SUPABASE_URL + SUPABASE_ANON_KEY。anon key 是公开的，任何人拿到都无害，
//   真正能做什么由 Supabase 里的 RLS（行级安全）策略决定：匿名可「写反馈」「读写命令库」。
// - SUPABASE_SERVICE_KEY 是服务端密钥（能绕过 RLS 读所有数据），只在管理员本机配，绝不进包。
//
// 这里不装 @supabase/supabase-js，直接用 fetch 打 PostgREST 接口，少一个依赖、逻辑透明。
// PostgREST 的列名就是数据库列名（snake_case），所以下面接口都用 snake_case 字段。

// 注意：这几个必须「调用时才读」process.env，不能提成模块顶层常量。
// 因为 process.loadEnvFile() 是在 import 之后才执行的（ESM 里 import 先于一切代码），
// 若在模块加载时就把值抓成常量，会固化成一个 undefined，导致「配了 key 也读不到」。
function supabaseUrl(): string {
  return process.env.SUPABASE_URL ?? ''
}
function anonKey(): string {
  return process.env.SUPABASE_ANON_KEY ?? ''
}
function serviceKey(): string {
  return process.env.SUPABASE_SERVICE_KEY ?? ''
}

// 云是否已配好：没配就整体降级成「离线也能用」（反馈只写本地、不拉共享库）。
export function cloudConfigured(): boolean {
  return Boolean(supabaseUrl() && anonKey())
}

export interface FeedbackRow {
  intent: string
  platform: string
  wrong_command: string
  expected_command: string | null
  note: string | null
}

export interface LibraryRow {
  intent: string
  platform: string
  command: string
}

// 基础请求头。写库用 anon key，只有管理员拉反馈列表才用 service key。
function headers(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

// 写一条反馈到云（匿名）。feedback 表没有唯一约束，直接插。
export async function pushFeedback(row: FeedbackRow): Promise<void> {
  if (!cloudConfigured()) return
  const res = await fetch(`${supabaseUrl()}/rest/v1/feedback`, {
    method: 'POST',
    headers: { ...headers(anonKey()), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`写反馈到云失败（HTTP ${res.status}）`)
}

// 写一条「验证过的命令」到云共享库（匿名）。
// on_conflict=唯一键 + resolution=ignore-duplicates：同一条命令重复提交时不新增、也不报错。
export async function pushLibraryEntry(row: LibraryRow): Promise<void> {
  if (!cloudConfigured()) return
  const res = await fetch(
    `${supabaseUrl()}/rest/v1/library?on_conflict=intent,platform,command`,
    {
      method: 'POST',
      headers: { ...headers(anonKey()), Prefer: 'resolution=ignore-duplicates, return=minimal' },
      body: JSON.stringify(row),
    },
  )
  if (!res.ok) throw new Error(`写命令库到云失败（HTTP ${res.status}）`)
}

// 拉整个共享命令库（匿名可读），daemon 启动/定期拉下来合并进本地库做 RAG。
export async function pullLibrary(): Promise<LibraryRow[]> {
  if (!cloudConfigured()) return []
  const res = await fetch(
    `${supabaseUrl()}/rest/v1/library?select=intent,platform,command&order=id`,
    { headers: headers(anonKey()) },
  )
  if (!res.ok) throw new Error(`拉取共享库失败（HTTP ${res.status}）`)
  const data = (await res.json()) as LibraryRow[]
  return Array.isArray(data) ? data : []
}

// 拉最近 N 条反馈（管理员专用，需要 service key，绕过 RLS）。
export async function pullFeedback(limit = 100): Promise<FeedbackRow[]> {
  if (!supabaseUrl() || !serviceKey()) {
    throw new Error('未配置 SUPABASE_SERVICE_KEY（管理员私有接口）')
  }
  const res = await fetch(
    `${supabaseUrl()}/rest/v1/feedback?select=*&order=id.desc&limit=${limit}`,
    { headers: headers(serviceKey()) },
  )
  if (!res.ok) throw new Error(`拉取反馈失败（HTTP ${res.status}）`)
  const data = (await res.json()) as FeedbackRow[]
  return Array.isArray(data) ? data : []
}
