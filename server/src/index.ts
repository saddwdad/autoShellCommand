// 服务端入口：起一个 Hono 应用，监听本地端口。
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { feedbackRoute } from './routes/feedback'

const app = new Hono()

// 这里就是你实习时「从来没管过」的跨域——现在你要亲手处理它。
// Vue 面板跑在 5173，服务端跑在 3000，两个 origin 不同，浏览器会拦。
// cors() 中间件就是那个「门卫」：它给响应加上允许跨域的头，放行 5173 的请求。
app.use('*', cors())

app.get('/', (c) => c.json({ name: 'autoshell-server', status: 'ok' }))

// 挂载反馈路由：所有 /api/feedback 开头的请求都交给 feedbackRoute 处理
app.route('/api/feedback', feedbackRoute)

const port = Number(process.env.PORT) || 3000
console.log(`🚀 服务端已启动：http://localhost:${port}`)

serve({ fetch: app.fetch, port })
