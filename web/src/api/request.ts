// 最底层的请求封装：requestAPI（axios 那种形态）
// 它既是一个函数，又挂了 get / post 方法，两种调用方式都行：
//
//   requestAPI('/api/feedback', { method: 'POST', body })   ← 直接传 method
//   requestAPI.post('/api/feedback', body)                  ← 用便捷方法
//   requestAPI.get('/api/feedback')                         ← 用便捷方法
//   requestAPI.get('/api/feedback', { 'X-Admin-Password': 'xxx' })  ← 带自定义头
//
// 所有 HTTP 请求都从这里走，组件层不碰 fetch。

// 统一的服务端地址（换环境只改这一处）
const API_BASE = 'http://localhost:3000'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  method?: Method
  body?: unknown
  headers?: Record<string, string>
}

// 用接口声明 requestAPI 的两种身份：函数本身 + 挂在它身上的方法
interface RequestAPI {
  <T = unknown>(url: string, options?: RequestOptions): Promise<T>
  get<T = unknown>(url: string, headers?: Record<string, string>): Promise<T>
  post<T = unknown>(url: string, body: unknown): Promise<T>
  put<T = unknown>(url: string, body: unknown): Promise<T>
}

// 让抛出的 Error 额外带上 HTTP 状态码，方便上层区分 401（无权限）这类情况
class RequestError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const requestAPI: RequestAPI = async function <T>(url: string, options: RequestOptions = {}) {
  const { method = 'GET', body, headers } = options

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
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
    throw new RequestError(message, res.status)
  }

  return data as T
}

// 给 requestAPI 挂上便捷方法
requestAPI.get = <T>(url: string, headers?: Record<string, string>) =>
  requestAPI<T>(url, { method: 'GET', headers })
requestAPI.post = <T>(url: string, body: unknown) => requestAPI<T>(url, { method: 'POST', body })
requestAPI.put = <T>(url: string, body: unknown) => requestAPI<T>(url, { method: 'PUT', body })

export default requestAPI
