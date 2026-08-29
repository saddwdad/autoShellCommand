<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { getConfig, saveProvider, setActiveProvider } from '../api/config'

// provider 列表（只做展示用，baseURL/model 在 CLI/server 各自的 registry 里也有）
const PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'kimi', label: 'Kimi (Moonshot)' },
  { id: 'glm', label: '智谱 GLM' },
  { id: 'qwen', label: '通义千问' },
  { id: 'custom', label: '自定义' },
]

// 当前状态（从 GET /api/config 读回，不含 key）
const active = ref('')
// 已配置的 provider id 集合（有 key = 已配置）
const configured = ref<Set<string>>(new Set())
// custom 的 baseURL/model（回显用，让用户改的时候不用重填）
const customMeta = ref<{ baseURL?: string; model?: string }>({})

// 配置表单（下半区：选 provider → 填 key → 保存）
const selectedProvider = ref('deepseek')
const apiKey = ref('')
const baseURL = ref('')
const model = ref('')

const saving = ref(false)
const switching = ref(false)

const selectedIsCustom = computed(() => selectedProvider.value === 'custom')

function isConfigured(id: string): boolean {
  return configured.value.has(id)
}

async function loadConfig() {
  try {
    const data = await getConfig()
    active.value = data.active
    const set = new Set<string>()
    for (const [id, meta] of Object.entries(data.providers)) {
      set.add(id)
      if (id === 'custom') {
        customMeta.value = { baseURL: meta.baseURL, model: meta.model }
        baseURL.value = meta.baseURL ?? ''
        model.value = meta.model ?? ''
      }
    }
    configured.value = set
  } catch {
    message.error('读取配置失败，请先启动本地服务端')
  }
}

async function save() {
  if (!apiKey.value.trim()) {
    message.warning('请输入 API Key')
    return
  }
  if (selectedIsCustom.value && (!baseURL.value.trim() || !model.value.trim())) {
    message.warning('自定义 provider 需要填 baseURL 和 model')
    return
  }

  saving.value = true
  try {
    const input: { apiKey: string; baseURL?: string; model?: string } = {
      apiKey: apiKey.value.trim(),
    }
    if (selectedIsCustom.value) {
      input.baseURL = baseURL.value.trim()
      input.model = model.value.trim()
    }
    await saveProvider(selectedProvider.value, input)
    message.success('已保存')
    apiKey.value = ''
    await loadConfig()
  } catch (e) {
    message.error('保存失败，请先启动本地服务端')
  } finally {
    saving.value = false
  }
}

async function switchProvider(id: string) {
  // 只允许切到已配置的 provider（UI 上未配置的直接 disabled，这里再兜底一次）
  if (!isConfigured(id)) {
    message.warning('该 provider 尚未配置 key')
    return
  }
  switching.value = true
  try {
    await setActiveProvider(id)
    active.value = id
    message.success('已切换')
  } catch {
    message.error('切换失败，请先启动本地服务端')
  } finally {
    switching.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <a-card title="设置">
    <a-form layout="vertical">
      <!-- 上半区：当前使用的 provider，点选即切换 -->
      <a-form-item label="当前使用">
        <a-radio-group
          :value="active"
          :disabled="switching"
          @change="(e: Event) => switchProvider((e.target as HTMLInputElement).value)"
        >
          <a-radio
            v-for="p in PROVIDERS"
            :key="p.id"
            :value="p.id"
            :disabled="!isConfigured(p.id)"
          >
            {{ p.label }}
            <a-tag v-if="isConfigured(p.id)" color="green" style="margin-left: 4px">已配置</a-tag>
            <a-tag v-else style="margin-left: 4px">未配置</a-tag>
          </a-radio>
        </a-radio-group>
      </a-form-item>

      <a-divider />

      <!-- 下半区：配置某个 provider 的 key -->
      <a-form-item label="配置 provider">
        <a-select v-model:value="selectedProvider" style="width: 240px">
          <a-select-option v-for="p in PROVIDERS" :key="p.id" :value="p.id">
            {{ p.label }}
          </a-select-option>
        </a-select>
      </a-form-item>

      <template v-if="selectedIsCustom">
        <a-form-item label="baseURL" required>
          <a-input v-model:value="baseURL" placeholder="https://api.example.com/v1" style="width: 400px" />
        </a-form-item>
        <a-form-item label="model" required>
          <a-input v-model:value="model" placeholder="llama3 / qwen2.5 / ..." style="width: 400px" />
        </a-form-item>
      </template>

      <a-form-item label="API Key" required>
        <a-input-password v-model:value="apiKey" placeholder="sk-..." style="width: 400px" />
      </a-form-item>

      <a-button type="primary" :loading="saving" @click="save">保存</a-button>
    </a-form>

    <a-alert
      type="info"
      show-icon
      message="说明"
      description="key 存到你本机的 ~/.autoshell/config.json，供 CLI/daemon 读取，不上传任何云端。可以配多个 provider，随时切换当前用的那一个。"
      style="margin-top: 16px"
    />
  </a-card>
</template>
