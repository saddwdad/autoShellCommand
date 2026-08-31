// feedback 业务模块的 API：把「提交反馈」「拉取列表」这两个后端接口
// 封装成语义化的函数，组件调用时不用知道它们对应哪个 URL、什么方法。
import requestAPI from './request'

export interface Feedback {
  id: number
  intent: string
  platform: string
  wrong_command: string
  expected_command: string | null
  note: string | null
  created_at: string
}

export interface CreateFeedbackInput {
  intent: string
  platform: string
  wrongCommand: string
  expectedCommand?: string | null
  note?: string | null
}

// 提交一条反馈 → POST /api/feedback
export function createFeedback(input: CreateFeedbackInput) {
  return requestAPI.post<{ ok: boolean; id: number }>('/api/feedback', input)
}

// 拉取最近反馈列表 → GET /api/feedback（管理员私有，必须带密码）
export function listFeedback(adminPassword: string) {
  return requestAPI.get<{ list: Feedback[] }>('/api/feedback', {
    'X-Admin-Password': adminPassword,
  })
}
