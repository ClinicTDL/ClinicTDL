<script setup>
import { ref, onMounted, watch } from 'vue'
import { supabase } from '../supabaseClient'
import { useRouter } from 'vue-router'

const loading = ref(false)
const rows = ref([])
const search = ref('')
const statusFilter = ref('')
const dateStart = ref('')
const dateEnd = ref('')
const router = useRouter()

const safeParse = (str) => {
  if (!str) return {}
  try {
    return JSON.parse(str)
  } catch (e) {
    return {}
  }
}

const onImgError = (e) => {
  const el = e.target
  if (el?.dataset?.altTried) return
  const src = el?.src || ''
  let alt = ''
  if (src.includes('/document_images/')) {
    alt = src.replace('/document_images/', '/patient-photos/')
  } else if (src.includes('/patient-photos/')) {
    alt = src.replace('/patient-photos/', '/document_images/')
  }
  if (alt && alt !== src) {
    el.dataset.altTried = '1'
    el.src = alt
  }
}

const loadData = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('medicine_import_logs')
      .select(`
        *,
        medicine:medicine_list(name, sku, unit),
        requester:system_users!created_by(full_name),
        approver:system_users!approved_by(full_name)
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    rows.value = data || []
  } catch (e) {
  } finally {
    loading.value = false
  }
}

const filtered = ref([])
const applyFilter = () => {
  const s = (search.value || '').toLowerCase()
  const start = dateStart.value ? new Date(dateStart.value) : null
  const end = dateEnd.value ? new Date(dateEnd.value) : null
  if (end) end.setHours(23,59,59,999)
  filtered.value = (rows.value || []).filter((r) => {
    if (statusFilter.value && r.status !== statusFilter.value) return false
    if (start) {
      const t = new Date(r.created_at)
      if (t < start) return false
    }
    if (end) {
      const t = new Date(r.created_at)
      if (t > end) return false
    }
    if (s) {
      const info = safeParse(r.note)
      const hay = [
        r?.medicine?.name || info?.name || '',
        r?.requester?.full_name || '',
        r?.approver?.full_name || '',
        r?.category || '',
        r?.status || '',
        r?.remark || '',
      ].join(' ').toLowerCase()
      if (!hay.includes(s)) return false
    }
    return true
  })
}

watch([rows, search, statusFilter, dateStart, dateEnd], applyFilter, { immediate: true })
onMounted(loadData)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-clinic-border dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          @click="router.back()"
          aria-label="ย้อนกลับ"
          title="ย้อนกลับ"
        >
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <h1 class="text-xl font-semibold text-slate-900 dark:text-white">ประวัติการส่งคำขออนุมัติ</h1>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
      <input v-model="search" type="text" placeholder="ค้นหาชื่อยา/ผู้อนุมัติ/ผู้แจ้ง" class="rounded-lg border border-clinic-border dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs" />
      <select v-model="statusFilter" class="rounded-lg border border-clinic-border dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
        <option value="">สถานะทั้งหมด</option>
        <option value="pending">รอการอนุมัติ</option>
        <option value="approved">อนุมัติแล้ว</option>
        <option value="rejected">ปฏิเสธ</option>
      </select>
      <input v-model="dateStart" type="date" class="rounded-lg border border-clinic-border dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs" />
      <input v-model="dateEnd" type="date" class="rounded-lg border border-clinic-border dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs" />
    </div>

    <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3 overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead>
          <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
            <th class="py-2 pr-3">วันที่</th>
            <th class="py-2 pr-3">รูป</th>
            <th class="py-2 pr-3">รายการ</th>
            <th class="py-2 pr-3">จำนวน</th>
            <th class="py-2 pr-3">ประเภท</th>
            <th class="py-2 pr-3">สถานะ</th>
            <th class="py-2 pr-3">เหตุผล</th>
            <th class="py-2 pr-3">ผู้แจ้ง</th>
            <th class="py-2 pr-3">ผู้อนุมัติ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filtered" :key="r.id" class="border-b border-clinic-border/60 dark:border-slate-800">
            <td class="py-2 pr-3">{{ new Date(r.created_at).toLocaleString('th-TH') }}</td>
            <td class="py-2 pr-3">
              <a v-if="r.document_url" :href="r.document_url" target="_blank" rel="noopener" class="inline-flex items-center">
                <img :src="r.document_url" alt="" class="w-12 h-12 object-cover rounded border border-clinic-border dark:border-slate-700" @error="onImgError" />
              </a>
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="py-2 pr-3">
              <div class="font-medium text-slate-900 dark:text-slate-100">
                {{ r.medicine?.name || (safeParse(r.note)?.name || '-') }}
              </div>
              <div class="text-[10px] text-slate-400">
                {{ r.medicine?.sku || (safeParse(r.note)?.sku || '-') }}
              </div>
            </td>
            <td class="py-2 pr-3">
              <span class="font-bold text-emerald-600 dark:text-emerald-400">+{{ r.quantity }}</span>
              <span class="ml-1 text-slate-400">{{ r.medicine?.unit || (safeParse(r.note)?.unit || '') }}</span>
            </td>
            <td class="py-2 pr-3">{{ r.category }}</td>
            <td class="py-2 pr-3">
              <span :class="{
                'text-amber-600': r.status==='pending',
                'text-emerald-600 dark:text-emerald-400': r.status==='approved',
                'text-red-600': r.status==='rejected'
              }">{{ r.status==='pending' ? 'รอการอนุมัติ' : (r.status==='approved' ? 'อนุมัติแล้ว' : (r.status==='rejected' ? 'ปฏิเสธแล้ว' : r.status)) }}</span>
            </td>
            <td class="py-2 pr-3 max-w-[150px] truncate" :title="r.remark">{{ r.remark || '-' }}</td>
            <td class="py-2 pr-3">{{ r.requester?.full_name || '-' }}</td>
            <td class="py-2 pr-3">{{ r.approver?.full_name || '-' }}</td>
          </tr>
          <tr v-if="!filtered.length && !loading">
            <td colspan="8" class="py-6 text-center text-slate-400">ไม่มีข้อมูล</td>
          </tr>
          <tr v-if="loading">
            <td colspan="8" class="py-6 text-center text-slate-400">กำลังโหลด...</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
