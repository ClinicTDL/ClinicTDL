<script setup>
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'

const router = useRouter()
const route = useRoute()

const menuItems = [
  { name: 'Dashboard', icon: 'fa-chart-line', routeName: 'admin-dashboard' },
  { name: 'รายการยา', icon: 'fa-pills', routeName: 'admin-medicine-list' },
  { name: 'ประวัติการรักษา', icon: 'fa-notes-medical', routeName: 'admin-treatment-history' },
  { name: 'ประวัติการจ่ายยา', icon: 'fa-hand-holding-medical', routeName: 'admin-dispensing-history' },
  { name: 'ประวัติการนำเข้ายา', icon: 'fa-upload', routeName: 'admin-import-history' },
  { name: 'ข้อมูลพนักงาน', icon: 'fa-user', routeName: 'admin-employee-list' },
  { name: 'ผู้นำใข้ระบบ', icon: 'fa-users-gear', routeName: 'admin-system-users' },
]

const isActive = (item) => computed(() => route.name === item.routeName)

const navigate = (item) => {
  const target = { name: item.routeName }
  try {
    router.push(target)
  } catch (e) {
    if (item.routeName === 'admin-dispensing-history') {
      router.push('/admin/dispensing-history')
    }
  }
}
</script>

<template>
  <aside
    class="w-64 shrink-0 h-screen bg-white dark:bg-slate-900 border-r border-clinic-border dark:border-slate-800 flex flex-col"
  >
    <div class="px-4 py-4 border-b border-clinic-border dark:border-slate-800 flex items-center gap-3">
      <div class="w-10 h-10 rounded-full bg-clinic-blue/10 flex items-center justify-center">
        <i class="fa-solid fa-shield-halved text-clinic-blue"></i>
      </div>
      <div>
        <div class="text-sm font-semibold text-slate-900 dark:text-white">
          Admin Area
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400">
          Clinic TDL
        </div>
      </div>
    </div>

    <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      <button
        v-for="item in menuItems"
        :key="item.routeName"
        type="button"
        @click="navigate(item)"
        class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm"
        :class="[
          isActive(item).value
            ? 'bg-clinic-blue text-white'
            : 'text-slate-700 dark:text-slate-200 hover:bg-clinic-light dark:hover:bg-slate-800',
        ]"
      >
        <i class="fa-solid" :class="item.icon"></i>
        <span>{{ item.name }}</span>
      </button>
    </nav>

    <div class="px-4 py-3 border-t border-clinic-border dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
      PMIS Team
    </div>
  </aside>
</template>

