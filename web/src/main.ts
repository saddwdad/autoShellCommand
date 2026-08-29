import { createApp } from 'vue'
import 'ant-design-vue/dist/reset.css'
import './style.css'
import App from './App.vue'
import router from './router'

// 按需加载：组件由 unplugin-vue-components 自动按需引入（见 vite.config.ts），
// 所以这里不再全量 app.use(Antd)。只引入 reset.css 做样式重置。
createApp(App).use(router).mount('#app')
