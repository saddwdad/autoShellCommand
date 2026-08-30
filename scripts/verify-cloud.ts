// 云同步验证脚本：一条命令验证「写反馈 → 写命令库 → 拉命令库」全链路 + RLS 是否正确。
//
// 用法（在仓库根目录下）：
//   npx tsx scripts/verify-cloud.ts
//
// 它会：
//   1. 用 anon key 写一条带 __autoshell_verify_ 标记的反馈 + 命令到云
//   2. 用 anon key 拉整个命令库，确认标记那条约回来了（证明 insert + select 都通、RLS 放行）
//   3. 报出云上命令库当前条数
//   4. 清理测试数据：配了 SUPABASE_SERVICE_KEY 就自动删，否则打印一条 SQL 让你在 Supabase 里手动删
import { homedir } from 'node:os'
import { join } from 'node:path'
import { cloudConfigured, pushFeedback, pushLibraryEntry, pullLibrary } from '../src/server/lib/supabase'

// 和 index.ts 一样，加载 ~/.autoshell/.env（SUPABASE_SERVICE_KEY 只在这里配，不进包）
try {
  process.loadEnvFile(join(homedir(), '.autoshell', '.env'))
} catch {
  // 没 .env 也没关系，走环境变量
}

async function main(): Promise<void> {
  if (!cloudConfigured()) {
    console.error('❌ 未配置 Supabase。请在 server/.env 里加 SUPABASE_URL 和 SUPABASE_ANON_KEY 后重试。')
    process.exitCode = 1
    return
  }

  const marker = `__autoshell_verify_${Date.now()}__`
  console.log(`🔍 验证标记：${marker}\n`)

  // 1. 写反馈（匿名 insert）
  try {
    await pushFeedback({
      intent: marker,
      platform: 'linux',
      wrong_command: 'nope',
      expected_command: 'echo autoshell-verify',
      note: 'verify-cloud 脚本自动写入，可安全删除',
    })
    console.log('✅ 写反馈到云：成功')
  } catch (e) {
    console.error('❌ 写反馈到云失败：', (e as Error)?.message ?? e)
    console.error('   （feedback 表存在吗？schema.sql 执行了吗？）')
  }

  // 2. 写命令库（匿名 insert + 去重）
  try {
    await pushLibraryEntry({ intent: marker, platform: 'linux', command: 'echo autoshell-verify' })
    console.log('✅ 写命令库到云：成功')
  } catch (e) {
    console.error('❌ 写命令库到云失败：', (e as Error)?.message ?? e)
    console.error('   （library 表存在吗？unique 约束建了吗？）')
  }

  // 3. 拉整个命令库（匿名 select），确认标记条目在
  try {
    const rows = await pullLibrary()
    const hit = rows.filter((r) => r.intent === marker)
    console.log(`✅ 拉共享命令库：成功，共 ${rows.length} 条`)
    console.log(`   标记条目是否在库里：${hit.length > 0 ? '✅ 是（round-trip 通了）' : '❌ 否（insert 或 select 有问题）'}`)
  } catch (e) {
    console.error('❌ 拉共享库失败：', (e as Error)?.message ?? e)
  }

  // 4. 清理测试数据
  console.log('')
  if (process.env.SUPABASE_SERVICE_KEY) {
    try {
      const res = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/library?intent=eq.${encodeURIComponent(marker)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
        },
      )
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/feedback?intent=eq.${encodeURIComponent(marker)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
        },
      )
      console.log(`✅ 已用 service key 清理测试数据（HTTP ${res.status}）`)
    } catch (e) {
      console.error('⚠️ 清理失败：', (e as Error)?.message ?? e)
    }
  } else {
    console.log('⚠️ 未配 SUPABASE_SERVICE_KEY，测试数据需手动清理。在 Supabase SQL Editor 执行：')
    console.log(`   delete from public.library where intent = '${marker}';`)
    console.log(`   delete from public.feedback where intent = '${marker}';`)
  }
}

void main()
