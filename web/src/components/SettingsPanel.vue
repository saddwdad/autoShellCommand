<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'

// 暂存到浏览器 localStorage。
// 等本地 CLI/daemon 建好后，这里会改成写进系统 keychain（macOS Keychain /
// Windows Credential Manager），那才是存 API key 的正确位置。
const apiKey = ref(localStorage.getItem('autoshell.apiKey') ?? '')

function save() {
  localStorage.setItem('autoshell.apiKey', apiKey.value)
  message.success('已保存（暂存本地）')
}
</script>

<template>
  <a-card title="设置">
    <a-form layout="vertical">
      <a-form-item label="DeepSeek API Key">
        <a-input-password v-model:value="apiKey" placeholder="sk-..." style="width: 400px" />
      </a-form-item>
      <a-button type="primary" @click="save">保存</a-button>
    </a-form>

    <a-alert
      type="info"
      show-icon
      message="说明"
      description="这个 key 目前只是暂存在浏览器 localStorage。等本地 CLI/daemon 建好后，会改成写进系统 keychain（更安全）。"
      style="margin-top: 16px"
    />
  </a-card>
</template>
