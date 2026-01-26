<script setup>
import LayoutSidebar from '../components/LayoutSidebar.vue'
import LayoutToolbar from '../components/LayoutToolbar.vue'
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-clinic-light dark:bg-slate-900 text-slate-900 dark:text-slate-100">
    <LayoutSidebar />
    <div class="flex-1 flex flex-col min-w-0">
      <LayoutToolbar />
      <main class="flex-1 p-4 md:p-6 overflow-y-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>

