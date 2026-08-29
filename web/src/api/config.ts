// key 存储相关的接口封装。组件层不直接碰 requestAPI / fetch。
import requestAPI from './request'

// 把 DeepSeek key 存到本地服务端（server 会写进 ~/.autoshell/config.json）。
// 浏览器沙箱不能直接写磁盘，所以要经过本地 server 代写。
export function saveApiKey(key: string): Promise<{ ok: boolean }> {
  return requestAPI.put<{ ok: boolean }>('/api/config', { deepseekApiKey: key })
}
