import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { cli: 'src/cli/index.ts', server: 'src/server/index.ts' },
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  // 给输出加 shebang，让 asf 能被 shell 直接执行（server.js 多一行注释无害）
  shebang: true,
  banner: { js: '#!/usr/bin/env node' },
  // 运行时依赖保持 external：transformers 内部有动态 import / onnx 加载，绝不能打进 bundle。
  external: ['hono', '@hono/node-server', '@hono/node-server/serve-static', '@huggingface/transformers'],
})
