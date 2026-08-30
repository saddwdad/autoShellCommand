// provider / key 配置相关的接口封装。组件层不直接碰 requestAPI / fetch。
import requestAPI from './request'

// GET 返回的配置视图：不含 apiKey（key 单向流动，server 不回传）。
// providers 里「有 key 就出现在 map 里」= 已配置；baseURL/model 只对 custom 有意义。
export interface ConfigView {
  active: string
  providers: Record<string, { baseURL?: string; model?: string }>
  autoExecute: boolean
}

export function getConfig(): Promise<ConfigView> {
  return requestAPI.get<ConfigView>('/api/config')
}

export function saveProvider(
  id: string,
  input: { apiKey: string; baseURL?: string; model?: string },
): Promise<{ ok: boolean }> {
  return requestAPI.put<{ ok: boolean }>(`/api/config/provider/${id}`, input)
}

export function setActiveProvider(id: string): Promise<{ ok: boolean }> {
  return requestAPI.put<{ ok: boolean }>('/api/config/active', { provider: id })
}

export function setAutoExecute(enabled: boolean): Promise<{ ok: boolean }> {
  return requestAPI.put<{ ok: boolean }>('/api/config/autoExecute', { enabled })
}
