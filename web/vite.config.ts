import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 按需加载：模板里的 <a-button>、<a-input> 等组件会被这个插件自动转换成
    // 精确的 import { Button } from 'ant-design-vue'，只打包用到的组件。
    Components({
      resolvers: [
        AntDesignVueResolver({
          // ant-design-vue 4 用 CSS-in-JS，样式随组件自动注入，不需要额外引入组件级样式
          importStyle: false,
        }),
      ],
    }),
  ],
})
