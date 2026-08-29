<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { listFeedback, type Feedback } from '../api/feedback'

// 拆成两个状态，别混用：
//   password —— 输入框里的草稿（用户正在敲的内容）
//   authed   —— 是否已通过密码验证（只有请求成功了才为 true）
// 之前用 v-if="!password" 判断，结果输入框一有字符就切到列表页，那是错的。
const password = ref('')
const authed = ref(false)
const list = ref<Feedback[]>([])
const loading = ref(false)

async function loadList() {
  loading.value = true
  try {
    const data = await listFeedback(password.value)
    list.value = data.list
    // 请求成功 = 密码对，才标记已认证并记住密码
    authed.value = true
    localStorage.setItem('autoshell.adminPassword', password.value)
  } catch (e) {
    // 不依赖 instanceof，直接读错误上的 status 字段（request.ts 抛的 RequestError 一定带它）
    if ((e as { status?: number }).status === 401) {
      localStorage.removeItem('autoshell.adminPassword')
      message.error('密码错误，请重新输入')
    } else {
      message.error(e instanceof Error ? e.message : '拉取失败，检查服务端是否启动')
    }
  } finally {
    loading.value = false
  }
}

function enter() {
  loadList()
}

onMounted(() => {
  // 之前存过密码就自动验证一次，成功后 authed 才为 true
  const saved = localStorage.getItem('autoshell.adminPassword')
  if (saved) {
    password.value = saved
    loadList()
  }
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>反馈列表</h1>
      <p>仅管理员可见</p>
    </header>

    <!-- 未认证：先输密码。authed 为 false 时才显示，跟输入框内容无关 -->
    <a-card v-if="!authed" title="输入管理密码">
      <a-form layout="vertical">
        <a-form-item>
          <a-input-password
            v-model:value="password"
            placeholder="ADMIN_PASSWORD"
            style="width: 300px"
            @press-enter="enter"
          />
        </a-form-item>
        <a-button type="primary" :loading="loading" @click="enter">进入</a-button>
      </a-form>
    </a-card>

    <!-- 已认证：显示列表 -->
    <a-card v-else title="最近反馈">
      <a-table :data-source="list" :loading="loading" row-key="id" :pagination="false">
        <a-table-column title="ID" data-index="id" :width="60" />
        <a-table-column title="意图" data-index="intent" />
        <a-table-column title="平台" data-index="platform" :width="90" />
        <a-table-column title="错误命令" data-index="wrongCommand" />
        <a-table-column title="期望命令" data-index="expectedCommand" />
        <a-table-column title="时间" data-index="createdAt" :width="180" />
      </a-table>
    </a-card>
  </div>
</template>
