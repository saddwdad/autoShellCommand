// 反馈接口。匿名提交（无登录）。
//
// 收一条反馈后做两件事：
// 1. 如果填了「期望的正确命令」→ 先写进本地命令库（立即用于本机 RAG，不用等云同步），
//    再上传云共享库（供其它用户下载）。
// 2. 反馈本体上传云（Supabase feedback 表，匿名）。
//
// 云写入是 best-effort：没配 Supabase 或云挂了，本地库已经生效，反馈不丢失。
import { Hono } from 'hono'
import { appendToLibrary } from '../lib/library'
import { pushFeedback, pushLibraryEntry, pullFeedback } from '../lib/supabase'

export const feedbackRoute = new Hono()

// POST /api/feedback —— 收一条反馈（body 字段名是 camelCase，TS 惯例）
feedbackRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)

  if (!body || !body.intent || !body.platform || !body.wrongCommand) {
    return c.json({ error: '缺少必填字段：intent, platform, wrongCommand' }, 400)
  }

  // 用户填了「期望的正确命令」= 一组验证过的「意图 → 命令」：
  // (a) 本地库立刻沉淀（本机 RAG 马上能用），(b) 上传云共享库（供其它用户下载）。
  if (body.expectedCommand) {
    appendToLibrary({
      intent: body.intent,
      platform: body.platform,
      command: body.expectedCommand,
    })
  }

  // 云写入 best-effort：不阻塞、不影响本地已生效的库。
  try {
    await pushFeedback({
      intent: body.intent,
      platform: body.platform,
      wrong_command: body.wrongCommand,
      expected_command: body.expectedCommand ?? null,
      note: body.note ?? null,
    })
    if (body.expectedCommand) {
      await pushLibraryEntry({
        intent: body.intent,
        platform: body.platform,
        command: body.expectedCommand,
      })
    }
  } catch (err) {
    console.warn('⚠️ 反馈写云失败（本地库已更新）：', (err as Error)?.message ?? err)
  }

  return c.json({ ok: true }, 201)
})

// GET /api/feedback —— 拉最近 100 条（管理员私有接口，需要密码 + 服务密钥）
feedbackRoute.get('/', async (c) => {
  // 反馈列表是所有用户提交的数据，属于私有数据，不能谁都能拉。
  // 请求头 X-Admin-Password 必须等于 .env 里的 ADMIN_PASSWORD 才放行。
  // （在 handler 里读 env 而不是模块顶部读，是为了避免模块加载顺序导致读不到）
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword || c.req.header('X-Admin-Password') !== adminPassword) {
    return c.json({ error: '没有权限查看反馈列表' }, 401)
  }

  // 反馈现在存云上，这里从 Supabase 读（需要 service key，绕过 RLS 才能读全部）。
  try {
    const list = await pullFeedback(100)
    return c.json({ list })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '拉取反馈失败' }, 500)
  }
})
