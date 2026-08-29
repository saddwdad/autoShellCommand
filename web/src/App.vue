<script setup lang="ts">
// App 只负责挂路由出口，页面内容由 router 决定：
//   /        → HomeView（控制面板：反馈 + 设置）
//   /admin   → AdminView（反馈列表，管理员私有）
</script>

<template>
  <router-view />
</template>
