// 服务端入口：起一个 Hono 应用，监听本地端口。
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { feedbackRoute } from './routes/feedback'
import { configRoute } from './routes/config'
import { retrieveRoute } from './routes/retrieve'
import { generateRoute } from './routes/generate'
import { warmUp } from './lib/rag'
import { startLibrarySync } from './lib/sync'

// 加载 server/.env 到 process.env（Node 21.7+ 内置，不用装 dotenv）。
// .env 不存在（比如刚 clone 还没配）就忽略，走环境变量兜底。
try {
  process.loadEnvFile()
} catch {
  // 忽略：没配 .env 时，ADMIN_PASSWORD 等配置为空，接口会按“拒绝访问”处理
}

const app = new Hono()

// 这里就是你实习时「从来没管过」的跨域——现在你要亲手处理它。
// Vue 面板跑在 5173，服务端跑在 3000，两个 origin 不同，浏览器会拦。
// cors() 中间件就是那个「门卫」：它给响应加上允许跨域的头，放行 5173 的请求。
app.use('*', cors())

app.get('/', (c) => c.json({ name: 'autoshell-server', status: 'ok' }))

// 挂载反馈路由：所有 /api/feedback 开头的请求都交给 feedbackRoute 处理
app.route('/api/feedback', feedbackRoute)

// 挂载 key 存储路由：浏览器设置页填的 DeepSeek key 从这里写进 config.json
app.route('/api/config', configRoute)

// 挂载检索路由：CLI 生成命令前从这里拿 RAG 相似示例（模型常驻本进程内存）
app.route('/api/retrieve', retrieveRoute)

// 挂载命令生成路由：薄客户端 dsh 把意图 POST 到这里，daemon 读 key + RAG + 调 LLM
app.route('/api/generate', generateRoute)

const port = Number(process.env.PORT) || 3000
// 只监听本机回环 127.0.0.1：
// 这个服务能覆盖用户 key、反馈列表是私有数据，不能让局域网其他人访问。
console.log(`🚀 服务端已启动：http://localhost:${port}`)

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' })

// 启动后后台预热 embedding 模型（载入内存）。fire-and-forget：不阻塞启动，
// 失败打警告即可，首次 /api/retrieve 会懒加载兜底。
void warmUp()

// 启动先拉一次云共享命令库，之后每 10 分钟拉一次（合并进 RAG 检索）。
startLibrarySync()

