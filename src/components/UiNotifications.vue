<script setup>
import { toasts, confirmState, closeConfirm } from '../stores/ui'
</script>

<template>
  <Teleport to="body">
    <!-- Top-end Toasts -->
    <div class="fixed top-4 right-4 z-[9998] space-y-2">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="min-w-[220px] rounded-lg px-3 py-2 text-xs shadow-lg border backdrop-blur-sm"
        :class="t.type === 'success' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800' : t.type === 'error' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800' : 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800'"
      >
        {{ t.text }}
      </div>
    </div>

    <!-- Confirm Modal -->
    <div v-if="confirmState.show" class="fixed inset-0 z-[9999]">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div
          class="w-[340px] rounded-xl border p-4 space-y-3 shadow-2xl"
          :class="confirmState.type === 'success' ? 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800' : confirmState.type === 'error' ? 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800' : 'border-clinic-border bg-white dark:bg-slate-900 dark:border-slate-700'"
        >
          <div class="text-sm font-semibold text-slate-900 dark:text-white">
            {{ confirmState.title }}
          </div>
          <div class="text-xs text-slate-700 dark:text-slate-300">
            {{ confirmState.message }}
          </div>
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="px-3 py-2 rounded-lg text-xs border border-clinic-border dark:border-slate-700 dark:text-slate-300"
              @click="closeConfirm(false)"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              class="px-3 py-2 rounded-lg text-xs bg-clinic-blue text-white"
              @click="closeConfirm(true)"
            >
              ยืนยัน
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
