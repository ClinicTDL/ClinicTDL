<script setup>
import { onMounted, ref, watch, computed } from 'vue'
import { supabase } from '../supabaseClient'

const loading = ref(false)
const rawRecords = ref([])
const search = ref('')
const department = ref('')
const departments = ref([])

const fetchDepartments = async () => {
  const { data } = await supabase.from('employees').select('department').limit(5000)
  const set = new Set((data || []).map((r) => (r?.department || '').toString().trim()).filter((v) => !!v))
  departments.value = Array.from(set).sort()
}

const tryFetch = async (table) => {
  return await supabase
    .from(table)
    .select(`
      id,
      created_at,
      amount,
      medicine:medicine_list(name, unit),
      checkup:checkups(
        diagnosis,
        created_by,
        employees:employees(employee_code, fullname, department),
        creator:system_users!created_by(full_name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(500)
}

const loadData = async () => {
  loading.value = true
  try {
    let { data, error } = await tryFetch('dispensing_records')
    if (error) {
      const alt = await tryFetch('depensing_records')
      data = alt.data
    }
    rawRecords.value = (data || []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      employee_code: r?.checkup?.employees?.employee_code || '-',
      fullname: r?.checkup?.employees?.fullname || '-',
      department: r?.checkup?.employees?.department || '-',
      medicine_name: r?.medicine?.name || '-',
      unit: r?.medicine?.unit || '',
      amount: Number(r?.amount || 0),
      diagnosis: r?.checkup?.diagnosis || '-',
      dispenser: r?.checkup?.creator?.full_name || '-',
    }))
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  const s = (search.value || '').toLowerCase()
  const dep = (department.value || '').toString()
  return rawRecords.value.filter((r) => {
    if (dep && r.department !== dep) return false
    if (!s) return true
    return (
      String(r.employee_code).toLowerCase().includes(s) ||
      String(r.fullname).toLowerCase().includes(s) ||
      String(r.medicine_name).toLowerCase().includes(s) ||
      String(r.diagnosis).toLowerCase().includes(s)
    )
  })
})

watch(search, () => {})
watch(department, () => {})

onMounted(async () => {
  await Promise.all([fetchDepartments(), loadData()])
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
        Dispensing History
      </h1>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
      <div class="flex items-center gap-2">
        <label class="text-xs text-slate-600 dark:text-slate-300">ค้นหา</label>
        <input
          v-model="search"
          type="text"
          placeholder="รหัสพนักงาน / ชื่อ / ยา / วินิจฉัย"
          class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
        />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-slate-600 dark:text-slate-300">แผนก</label>
        <select
          v-model="department"
          class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
        >
          <option value="">ทั้งหมด</option>
          <option v-for="d in departments" :key="d" :value="d">{{ d }}</option>
        </select>
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
            <th class="py-2 pr-3">รหัสพนักงาน</th>
            <th class="py-2 pr-3">ชื่อ-นามสกุล</th>
            <th class="py-2 pr-3">แผนก</th>
            <th class="py-2 pr-3">ชื่อยา</th>
            <th class="py-2 pr-3">จำนวน</th>
            <th class="py-2 pr-3">วินิจฉัย</th>
            <th class="py-2 pr-3">ผู้จ่ายยา</th>
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
            <td class="py-1.5 pr-3">{{ r.employee_code }}</td>
            <td class="py-1.5 pr-3">{{ r.fullname }}</td>
            <td class="py-1.5 pr-3">{{ r.department }}</td>
            <td class="py-1.5 pr-3">{{ r.medicine_name }}</td>
            <td class="py-1.5 pr-3">{{ r.amount }} {{ r.unit }}</td>
            <td class="py-1.5 pr-3">{{ r.diagnosis }}</td>
            <td class="py-1.5 pr-3">{{ r.dispenser }}</td>
          </tr>
          <tr v-if="!filtered.length && !loading">
            <td colspan="8" class="py-4 text-center text-slate-400">
              ไม่พบข้อมูล
            </td>
          </tr>
          <tr v-if="loading">
            <td colspan="8" class="py-4 text-center text-slate-400">
              กำลังโหลด...
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
