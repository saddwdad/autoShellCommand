// 前端路由：控制面板（公开）+ 反馈列表（管理员私有）。
// 用 hash 模式（URL 形如 http://localhost:5173/#/admin），
// 这样部署成纯静态文件时刷新页面也不会 404，不用配服务端重定向。
import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AdminView from '../views/AdminView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomeView },
    // 反馈列表：只有知道管理密码的人能看，见 AdminView.vue
    { path: '/admin', component: AdminView },
  ],
})

export default router
