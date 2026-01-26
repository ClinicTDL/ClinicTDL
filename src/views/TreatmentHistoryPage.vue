<script setup>
import { onMounted, ref } from 'vue'
import { supabase } from '../supabaseClient'

const loading = ref(false)
const records = ref([])
const totalCount = ref(0)
const dateStart = ref('')
const dateEnd = ref('')
const department = ref('')
const diagnosis = ref('')
const examinerId = ref('')
const departments = ref([])
const examiners = ref([])

const loadFilters = async () => {
  const { data: deptRows } = await supabase
    .from('employees')
    .select('department')
    .limit(2000)
  const set = new Set(
    (deptRows || [])
      .map((r) => (r?.department || '').toString().trim())
      .filter((v) => !!v),
  )
  departments.value = Array.from(set).sort()

  const { data: userRows } = await supabase
    .from('system_users')
    .select('id, full_name')
    .order('full_name', { ascending: true })
  examiners.value = (userRows || []).map((u) => ({
    id: u.id,
    name: u.full_name || '-',
  }))
}

const toStartOfDayIso = (d) => {
  const dt = new Date(d)
  dt.setHours(0, 0, 0, 0)
  return dt.toISOString()
}
const toEndOfDayIso = (d) => {
  const dt = new Date(d)
  dt.setHours(23, 59, 59, 999)
  return dt.toISOString()
}

const loadHistory = async () => {
  loading.value = true
  try {
    let query = supabase
      .from('checkups')
      .select(
        `
        id,
        employee_id,
        created_at,
        symptoms,
        diagnosis,
        image_url,
        employees(employee_code, fullname, position, department),
        creator:system_users!created_by(full_name),
        dispensing_records(amount)
        `,
      )
      .order('created_at', { ascending: false })
      .limit(500)

    if (dateStart.value) {
      query = query.gte('created_at', toStartOfDayIso(dateStart.value))
    }
    if (dateEnd.value) {
      query = query.lte('created_at', toEndOfDayIso(dateEnd.value))
    }
    if (diagnosis.value) {
      query = query.ilike('diagnosis', `%${diagnosis.value}%`)
    }
    if (examinerId.value) {
      query = query.eq('created_by', examinerId.value)
    }
    if (department.value) {
      const { data: deptEmps } = await supabase
        .from('employees')
        .select('id')
        .eq('department', department.value)
        .limit(5000)
      const ids = (deptEmps || []).map((e) => e.id)
      if (ids.length) {
        query = query.in('employee_id', ids)
      } else {
        records.value = []
        totalCount.value = 0
        return
      }
    }

    const { data, error } = await query
    if (error) throw error
    const rows = data || []
    records.value = rows.map((r) => {
      const amount =
        (r?.dispensing_records || []).reduce(
          (sum, d) => sum + (d?.amount || 0),
          0,
        ) || 0
      return {
        id: r.id,
        created_at: r.created_at,
        employee_code: r?.employees?.employee_code || '-',
        fullname: r?.employees?.fullname || '-',
        position: r?.employees?.position || '-',
        department: r?.employees?.department || '-',
        symptoms: r?.symptoms || '-',
        diagnosis: r?.diagnosis || '-',
        amount,
        image_url: r?.image_url || null,
        examiner: r?.creator?.full_name || '-',
      }
    })
    totalCount.value = records.value.length
  } catch (err) {
    console.error('Load history error', err)
  } finally {
    loading.value = false
  }
}

onMounted(loadHistory)
onMounted(loadFilters)

const viewImage = (u) => {
  if (!u) return ''
  // If it's a full URL (e.g. Supabase Storage), return it as is
  if (u.startsWith('http://') || u.startsWith('https://')) {
    return u
  }
  // Google Drive Legacy support
  const m1 = u.match(/\/d\/([A-Za-z0-9_-]+)/)
  if (m1) return `https://drive.google.com/file/d/${m1[1]}/view`
  const m2 = u.match(/[?&]id=([A-Za-z0-9_-]+)/)
  if (m2) return `https://drive.google.com/file/d/${m2[1]}/view`
  if (/^[A-Za-z0-9_-]{20,}$/.test(u)) {
    return `https://drive.google.com/file/d/${u}/view`
  }
  return u
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
        ประวัติการรักษา
      </h1>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
      <div class="flex items-center gap-2">
        <label class="text-xs text-slate-600 dark:text-slate-300">วันที่เริ่ม</label>
        <input
          v-model="dateStart"
          type="date"
          class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
        />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-slate-600 dark:text-slate-300">วันที่สิ้นสุด</label>
        <input
          v-model="dateEnd"
          type="date"
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
      <div class="flex items-center gap-2">
        <label class="text-xs text-slate-600 dark:text-slate-300">วินิจฉัย</label>
        <input
          v-model="diagnosis"
          type="text"
          placeholder="เช่น ไข้ หวัดฯ"
          class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
        />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-slate-600 dark:text-slate-300">ผู้ตรวจ</label>
        <select
          v-model="examinerId"
          class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
        >
          <option value="">ทั้งหมด</option>
          <option v-for="u in examiners" :key="u.id" :value="u.id">
            {{ u.name }}
          </option>
        </select>
      </div>
      <div class="md:col-span-2 xl:col-span-5 flex justify-end">
        <button
          type="button"
          class="inline-flex items-center justify-center gap-1 rounded-lg bg-clinic-blue text-white px-3 py-2 text-xs hover:bg-blue-700"
          @click="loadHistory"
        >
          <i class="fa-solid fa-magnifying-glass"></i>
          <span>กรองข้อมูล</span>
        </button>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3 overflow-x-auto">
      <div class="flex items-center justify-between mb-2">
        <div class="text-xs text-slate-600 dark:text-slate-300">
          ทั้งหมด {{ totalCount }} รายการ
        </div>
      </div>
      <table class="min-w-full text-xs">
        <thead>
          <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
            <th class="py-2 pr-3">วันที่</th>
            <th class="py-2 pr-3">รหัสพนักงาน</th>
            <th class="py-2 pr-3">ชื่อ-นามสกุล</th>
            <th class="py-2 pr-3">ตำแหน่ง</th>
            <th class="py-2 pr-3">แผนก</th>
            <th class="py-2 pr-3">อาการ</th>
            <th class="py-2 pr-3">แพทย์วินิจฉัย</th>
            <th class="py-2 pr-3 text-right">จำนวนยาที่เบิก</th>
            <th class="py-2 pr-3">รูปภาพ</th>
            <th class="py-2 pr-3">ตรวจโดย</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in records"
            :key="r.id"
            class="border-b border-clinic-border/60 dark:border-slate-800"
          >
            <td class="py-1.5 pr-3 whitespace-nowrap">
              {{ new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) }}
            </td>
            <td class="py-1.5 pr-3">{{ r.employee_code }}</td>
            <td class="py-1.5 pr-3">{{ r.fullname }}</td>
            <td class="py-1.5 pr-3">{{ r.position }}</td>
            <td class="py-1.5 pr-3">{{ r.department }}</td>
            <td class="py-1.5 pr-3">{{ r.symptoms }}</td>
            <td class="py-1.5 pr-3">{{ r.diagnosis }}</td>
            <td class="py-1.5 pr-3 text-right">{{ r.amount }}</td>
            <td class="py-1.5 pr-3">
              <a
                v-if="viewImage(r.image_url)"
                :href="viewImage(r.image_url)"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center justify-center w-12 h-12 rounded border border-clinic-border dark:border-slate-700 text-slate-400 hover:text-slate-600"
                title="View Image"
              >
                <i class="fa-regular fa-image text-lg"></i>
              </a>
              <div
                v-else
                class="inline-flex items-center justify-center w-12 h-12 rounded border border-clinic-border dark:border-slate-700 text-slate-300 bg-slate-50 dark:bg-slate-800/50 cursor-default"
                title="No Image"
              >
                <i class="fa-solid fa-image-slash text-lg"></i>
              </div>
            </td>
            <td class="py-1.5 pr-3">{{ r.examiner }}</td>
          </tr>
          <tr v-if="!records.length">
            <td colspan="10" class="py-4 text-center text-slate-400">
              ไม่พบข้อมูล
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
