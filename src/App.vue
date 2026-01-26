<script setup>
import { onMounted, ref } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import UiNotifications from './components/UiNotifications.vue'

const router = useRouter()
const isReady = ref(false)

onMounted(() => {
  const savedTheme = localStorage.getItem('clinic_tdl_theme') || 'light'
  document.documentElement.classList.toggle('dark', savedTheme === 'dark')
  document.body.classList.toggle('dark', savedTheme === 'dark')
  isReady.value = true
})
</script>

<template>
  <div v-if="isReady" class="min-h-screen bg-clinic-light dark:bg-slate-900 text-slate-900 dark:text-slate-100">
    <RouterView />
    <UiNotifications />
  </div>
</template>
