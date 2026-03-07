<script setup>
import { useRoute, useRouter } from 'vue-router'
import { computed, ref, onMounted, onUnmounted } from 'vue'

const router = useRouter()
const route = useRoute()

const isCollapsed = ref(false)

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value
}

// Auto collapse on small screens
const handleResize = () => {
  if (window.innerWidth < 1024) {
    isCollapsed.value = true
  } else {
    isCollapsed.value = false
  }
}

onMounted(() => {
  handleResize()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

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
    class="shrink-0 h-screen bg-white dark:bg-slate-900 border-r border-clinic-border dark:border-slate-800 flex flex-col transition-all duration-300 relative"
    :class="isCollapsed ? 'w-20' : 'w-64'"
  >
    <!-- Toggle Button -->
    <button
      type="button"
      @click="toggleSidebar"
      class="absolute -right-3 top-7 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-clinic-blue shadow-sm z-50 transition-transform duration-300"
      :class="isCollapsed ? '' : 'rotate-180'"
    >
      <i class="fa-solid fa-chevron-right text-[10px]"></i>
    </button>

    <div 
      class="px-4 py-4 border-b border-clinic-border dark:border-slate-800 flex items-center gap-3 overflow-hidden whitespace-nowrap"
      :class="isCollapsed ? 'justify-center px-0' : ''"
    >
      <div class="w-10 h-10 rounded-full bg-clinic-blue/10 flex items-center justify-center shrink-0">
        <i class="fa-solid fa-shield-halved text-clinic-blue"></i>
      </div>
      <div v-if="!isCollapsed" class="transition-opacity duration-300">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">
          Admin Area
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400">
          Clinic TDL
        </div>
      </div>
    </div>

    <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
      <button
        v-for="item in menuItems"
        :key="item.routeName"
        type="button"
        @click="navigate(item)"
        class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200"
        :class="[
          isActive(item).value
            ? 'bg-clinic-blue text-white'
            : 'text-slate-700 dark:text-slate-200 hover:bg-clinic-light dark:hover:bg-slate-800',
          isCollapsed ? 'justify-center px-0' : ''
        ]"
        :title="isCollapsed ? item.name : ''"
      >
        <i class="fa-solid shrink-0 w-5 text-center" :class="item.icon"></i>
        <span v-if="!isCollapsed" class="transition-opacity duration-300 truncate">
          {{ item.name }}
        </span>
      </button>
    </nav>

    <div 
      class="px-4 py-3 border-t border-clinic-border dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap overflow-hidden"
      :class="isCollapsed ? 'text-center px-0' : ''"
    >
      <span v-if="!isCollapsed">PMIS Team</span>
      <span v-else>PMIS</span>
    </div>
  </aside>
</template>

