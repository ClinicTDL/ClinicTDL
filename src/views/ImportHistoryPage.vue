<script setup>
import { onMounted, ref, watch, computed } from 'vue'
import { supabase } from '../supabaseClient'

const loading = ref(false)
const rawRecords = ref([])
const search = ref('')

const loadData = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('stock_transactions')
      .select(`
        id,
        created_at,
        quantity,
        note,
        transaction_type,
        medicine:medicine_list(name, unit),
        creator:system_users!created_by(full_name)
      `)
      .eq('transaction_type', 'RECEIVE')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error

    rawRecords.value = (data || []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      medicine_name: r?.medicine?.name || '-',
      unit: r?.medicine?.unit || '',
      quantity: Number(r?.quantity || 0),
      note: r?.note || '-',
      receiver: r?.creator?.full_name || '-',
    }))
  } catch (err) {
    console.error('Error loading import history:', err)
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  const s = (search.value || '').toLowerCase()
  return rawRecords.value.filter((r) => {
    if (!s) return true
    return (
      String(r.medicine_name).toLowerCase().includes(s) ||
      String(r.note).toLowerCase().includes(s) ||
      String(r.receiver).toLowerCase().includes(s)
    )
  })
})

watch(search, () => {})

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
        ประวัติการนำเข้า (รับยาเข้าสต็อก)
      </h1>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
      <div class="flex items-center gap-2 col-span-2">
        <label class="text-xs text-slate-600 dark:text-slate-300">ค้นหา</label>
        <input
          v-model="search"
          type="text"
          placeholder="ชื่อยา / หมายเหตุ / ผู้รับยา"
          class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
        />
      </div>
      <div class="flex items-center justify-end">
        <div class="text-xs text-slate-600 dark:text-slate-300">
          ทั้งหมด {{ filtered.length }} รายการ
        </div>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3 overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead>
          <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
            <th class="py-2 pr-3">วันที่</th>
            <th class="py-2 pr-3">ชื่อยา</th>
            <th class="py-2 pr-3">จำนวน</th>
            <th class="py-2 pr-3">หน่วย</th>
            <th class="py-2 pr-3">หมายเหตุ</th>
            <th class="py-2 pr-3">ผู้ทำรายการ</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in filtered"
            :key="r.id"
            class="border-b border-clinic-border/60 dark:border-slate-800"
          >
            <td class="py-1.5 pr-3">
              {{ new Date(r.created_at).toLocaleString() }}
            </td>
            <td class="py-1.5 pr-3">{{ r.medicine_name }}</td>
            <td class="py-1.5 pr-3 font-medium text-green-600 dark:text-green-400">
              +{{ r.quantity }}
            </td>
            <td class="py-1.5 pr-3">{{ r.unit }}</td>
            <td class="py-1.5 pr-3">{{ r.note }}</td>
            <td class="py-1.5 pr-3">{{ r.receiver }}</td>
          </tr>
          <tr v-if="!filtered.length && !loading">
            <td colspan="6" class="py-4 text-center text-slate-400">
              ไม่พบข้อมูล
            </td>
          </tr>
          <tr v-if="loading">
            <td colspan="6" class="py-4 text-center text-slate-400">
              กำลังโหลด...
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
