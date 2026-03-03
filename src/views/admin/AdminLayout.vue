<script setup>
import AdminSidebar from '../../components/admin/AdminSidebar.vue'
import LayoutToolbar from '../../components/LayoutToolbar.vue'
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-clinic-light dark:bg-slate-900 text-slate-900 dark:text-slate-100">
    <AdminSidebar />
    <div class="flex-1 flex flex-col min-w-0">
      <LayoutToolbar />
      <main class="flex-1 p-4 md:p-6 overflow-y-auto">
        <router-view />
      </main>
    </div>
  </div>
</template>
