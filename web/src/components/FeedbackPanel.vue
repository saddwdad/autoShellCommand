<template>
  <div>
    <a-card title="提交反馈">
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
// 请求统一走 api/feedback 的封装函数，组件不直接碰 fetch / requestAPI。
// 反馈列表已经挪到 /admin 路由（AdminView），这里只负责提交，不再拉列表。
import { createFeedback } from '../api/feedback'

const form = ref({
  intent: '',
  platform: 'linux',
  wrongCommand: '',
  expectedCommand: '',
  note: '',
})

const submitting = ref(false)

async function submit() {
  if (!form.value.intent || !form.value.wrongCommand) {
    message.warning('意图和错误命令是必填的')
    return
  }
  submitting.value = true
  try {
    await createFeedback({
      intent: form.value.intent,
      platform: form.value.platform,
      wrongCommand: form.value.wrongCommand,
      expectedCommand: form.value.expectedCommand || null,
      note: form.value.note || null,
    })
    message.success('反馈已提交')
    form.value.intent = ''
    form.value.wrongCommand = ''
    form.value.expectedCommand = ''
    form.value.note = ''
  } catch (e) {
    message.error(e instanceof Error ? e.message : '提交失败，检查服务端是否启动')
  } finally {
    submitting.value = false
  }
}
</script>
