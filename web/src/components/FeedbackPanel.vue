<template>
  <div>
    <a-card title="提交反馈" style="margin-bottom: 24px">
      <a-form layout="vertical">
        <a-form-item label="自然语言意图" required>
          <a-input v-model:value="form.intent" placeholder="比如：找出大于 100M 的文件" />
        </a-form-item>

        <a-form-item label="平台" required>
          <a-select v-model:value="form.platform" style="width: 200px">
            <a-select-option value="linux">linux</a-select-option>
            <a-select-option value="macos">macos</a-select-option>
            <a-select-option value="windows">windows</a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item label="AI 给出的命令（不对的）" required>
          <a-input v-model:value="form.wrongCommand" placeholder="AI 给的那条命令" />
        </a-form-item>

        <a-form-item label="你期望的正确命令">
          <a-input v-model:value="form.expectedCommand" placeholder="选填：你知道的正确写法" />
        </a-form-item>

        <a-form-item label="备注">
          <a-textarea v-model:value="form.note" placeholder="选填：补充说明" :rows="3" />
        </a-form-item>

        <a-button type="primary" :loading="submitting" @click="submit">提交反馈</a-button>
      </a-form>
    </a-card>

    <!-- <a-card title="最近反馈">
      <a-table :data-source="list" :loading="loading" row-key="id" :pagination="false">
        <a-table-column title="ID" data-index="id" :width="60" />
        <a-table-column title="意图" data-index="intent" />
        <a-table-column title="平台" data-index="platform" :width="90" />
        <a-table-column title="错误命令" data-index="wrongCommand" />
        <a-table-column title="期望命令" data-index="expectedCommand" />
        <a-table-column title="时间" data-index="createdAt" :width="180" />
      </a-table>
    </a-card> -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'

// 服务端地址。这里就是「跨域」发生的地方：
// 页面跑在 localhost:5173，请求打到 localhost:3000，两个 origin 不同。
// 浏览器本来会拦，但服务端写了 cors() 放行，所以能通。
// （更工程化的做法是 vite 配置 proxy 代理 /api，前端就用相对路径，彻底绕开跨域。）
const API_BASE = 'http://localhost:3000'

interface Feedback {
  id: number
  intent: string
  platform: string
  wrongCommand: string
  expectedCommand: string | null
  note: string | null
  createdAt: string
}

const form = ref({
  intent: '',
  platform: 'linux',
  wrongCommand: '',
  expectedCommand: '',
  note: '',
})

const submitting = ref(false)
const loading = ref(false)
const list = ref<Feedback[]>([])

async function submit() {
  if (!form.value.intent || !form.value.wrongCommand) {
    message.warning('意图和错误命令是必填的')
    return
  }
  submitting.value = true
  try {
    const res = await fetch(`${API_BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: form.value.intent,
        platform: form.value.platform,
        wrongCommand: form.value.wrongCommand,
        expectedCommand: form.value.expectedCommand || null,
        note: form.value.note || null,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    message.success('反馈已提交')
    form.value.intent = ''
    form.value.wrongCommand = ''
    form.value.expectedCommand = ''
    form.value.note = ''
    await loadList()
  } catch (e) {
    message.error(e instanceof Error ? e.message : '提交失败，检查服务端是否启动')
  } finally {
    submitting.value = false
  }
}

async function loadList() {
  loading.value = true
  try {
    const res = await fetch(`${API_BASE}/api/feedback`)
    const data = await res.json()
    list.value = data.list ?? []
  } catch {
    message.error('拉取反馈列表失败，检查服务端是否启动')
  } finally {
    loading.value = false
  }
}

onMounted(loadList)
</script>


