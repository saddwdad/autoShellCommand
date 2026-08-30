import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  // 给输出加 shebang，让 dsh 能被 shell 直接执行
  shebang: true,
  banner: { js: '#!/usr/bin/env node' },
})
