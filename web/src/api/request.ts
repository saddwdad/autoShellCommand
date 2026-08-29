// 最底层的请求封装：requestAPI（axios 那种形态）
// 它既是一个函数，又挂了 get / post 方法，两种调用方式都行：
//
//   requestAPI('/api/feedback', { method: 'POST', body })   ← 直接传 method
//   requestAPI.post('/api/feedback', body)                  ← 用便捷方法
//   requestAPI.get('/api/feedback')
//
// 所有 HTTP 请求都从这里走，组件层不碰 fetch。

// 统一的服务端地址（换环境只改这一处）
const API_BASE = 'http://localhost:3000'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  method?: Method
  body?: unknown
}

// 用接口声明 requestAPI 的两种身份：函数本身 + 挂在它身上的方法
interface RequestAPI {
  <T = unknown>(url: string, options?: RequestOptions): Promise<T>
  get<T = unknown>(url: string): Promise<T>
  post<T = unknown>(url: string, body: unknown): Promise<T>
}

const requestAPI: RequestAPI = async function <T>(url: string, options: RequestOptions = {}) {
  const { method = 'GET', body } = options

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // 不管成功失败都先尝试解析 JSON
  const data: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    // 服务端返回的 { error: '...' } 优先，否则用状态码兜底
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: string }).error)
        : `HTTP ${res.status}`
    throw new Error(message)
  }

  return data as T
}

// 给 requestAPI 挂上便捷方法
requestAPI.get = <T>(url: string) => requestAPI<T>(url, { method: 'GET' })
requestAPI.post = <T>(url: string, body: unknown) => requestAPI<T>(url, { method: 'POST', body })

export default requestAPI
