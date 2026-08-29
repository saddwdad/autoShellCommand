<script setup lang="ts">
import FeedbackPanel from './components/FeedbackPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>autoshell 控制面板</h1>
      <p>本地设置 + 反馈提交</p>
    </header>

    <a-tabs>
      <a-tab-pane key="feedback" tab="反馈">
        <FeedbackPanel />
      </a-tab-pane>
      <a-tab-pane key="settings" tab="设置">
        <SettingsPanel />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>
