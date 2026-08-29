// 反馈相关接口。用 Prisma 之后，这个文件里不再出现任何 SQL——
// 你操作的是「对象」，Prisma 在背后替你生成 SQL。
import { Hono } from 'hono'
import { prisma } from '../db'

export const feedbackRoute = new Hono()

// POST /api/feedback —— 收一条反馈
feedbackRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)

  // 基础校验：字段名现在是 camelCase（TS 惯例）
  if (!body || !body.intent || !body.platform || !body.wrongCommand) {
    return c.json(
      { error: '缺少必填字段：intent, platform, wrongCommand' },
      400,
    )
  }

  // 这就是「不写 SQL」的插入：一个 create()，参数就是一个对象。
  // 对比之前手写的：
  //   INSERT INTO feedback (...) VALUES (?, ?, ?, ?, ?)  ← 字段拼错要到运行才知道
  // 现在：字段拼错 → 编译期直接报错，而且有自动补全。
  const feedback = await prisma.feedback.create({
    data: {
      intent: body.intent,
      platform: body.platform,
      wrongCommand: body.wrongCommand,
      expectedCommand: body.expectedCommand ?? null,
      note: body.note ?? null,
    },
  })

  // 201 = 创建成功，把新记录的 id 返回给前端
  return c.json({ ok: true, id: feedback.id }, 201)
})

// GET /api/feedback —— 拉取最近 100 条（给你自己审核用）
feedbackRoute.get('/', async (c) => {
  const list = await prisma.feedback.findMany({
    orderBy: { id: 'desc' },
    take: 100,
  })
  return c.json({ list })
})
