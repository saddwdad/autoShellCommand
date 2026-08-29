<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
// key 不再存 localStorage，而是发给本地 server 代写进 ~/.autoshell/config.json。
// 之后 CLI/daemon 会直接读这个文件拿 key 去调 DeepSeek。
import { saveApiKey } from '../api/config'

const apiKey = ref('')

const saving = ref(false)

async function save() {
  if (!apiKey.value.trim()) {
    message.warning('请输入 DeepSeek API Key')
    return
  }
  saving.value = true
  try {
    await saveApiKey(apiKey.value.trim())
    message.success('已保存到本地配置')
  } catch (e) {
    // server 没启动时 fetch 会抛网络错误，这里统一提示去启动服务端
    message.error('保存失败，请先启动本地服务端')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <a-card title="设置">
    <a-form layout="vertical">
      <a-form-item label="DeepSeek API Key">
        <a-input-password v-model:value="apiKey" placeholder="sk-..." style="width: 400px" />
      </a-form-item>
      <a-button type="primary" :loading="saving" @click="save">保存</a-button>
    </a-form>

    <a-alert
      type="info"
      show-icon
      message="说明"
      description="这个 key 会存到你本机的 ~/.autoshell/config.json，供 CLI/daemon 读取。key 不会上传到任何云端服务。"
      style="margin-top: 16px"
    />
  </a-card>
</template>
