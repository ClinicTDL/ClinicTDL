<script setup>
import { onMounted, ref, watch, computed } from 'vue'
import { supabase } from '../supabaseClient'
import { showToast } from '../stores/ui'

const loading = ref(false)
const rawRecords = ref([])
const search = ref('')
const department = ref('')
const departments = ref([])
const dateStart = ref('')
const dateEnd = ref('')
const simpleView = ref(false)
const showSimpleDetailSidebar = ref(false)
const selectedSimpleGroup = ref(null)

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
      checkup_id,
      created_at,
      amount,
      medicine:medicine_list(id, name, unit),
      checkup:checkups(
        diagnosis,
        symptoms,
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
      checkup_id: r.checkup_id || null,
      created_at: r.created_at,
      employee_code: r?.checkup?.employees?.employee_code || '-',
      fullname: r?.checkup?.employees?.fullname || '-',
      department: r?.checkup?.employees?.department || '-',
      medicine_id: r?.medicine?.id || null,
      medicine_name: r?.medicine?.name || '-',
      unit: r?.medicine?.unit || '',
      amount: Number(r?.amount || 0),
      diagnosis: r?.checkup?.diagnosis || '-',
      symptoms: r?.checkup?.symptoms || '-',
      dispenser: r?.checkup?.creator?.full_name || '-',
    }))
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  const s = (search.value || '').toLowerCase()
  const dep = (department.value || '').toString()
  const ds = (dateStart.value || '').toString()
  const de = (dateEnd.value || '').toString()
  return rawRecords.value.filter((r) => {
    const created = (r.created_at || '').slice(0, 10)
    if (ds && created < ds) return false
    if (de && created > de) return false
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

const groupedFiltered = computed(() => {
  const groupedMap = new Map()
  filtered.value.forEach((row) => {
    const key = row.checkup_id || `single-${row.id}`
    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        key,
        checkup_id: row.checkup_id,
        created_at: row.created_at,
        employee_code: row.employee_code,
        fullname: row.fullname,
        department: row.department,
        symptoms: row.symptoms || '-',
        diagnosis: row.diagnosis || '-',
        dispenser: row.dispenser || '-',
        medicines: [],
        itemCount: 0,
        totalQuantity: 0,
      })
    }
    const group = groupedMap.get(key)
    group.medicines.push({
      id: row.id,
      medicine_id: row.medicine_id,
      medicine_name: row.medicine_name,
      amount: row.amount,
      unit: row.unit,
    })
    group.itemCount += 1
    group.totalQuantity += Number(row.amount || 0)
  })

  return Array.from(groupedMap.values())
    .map((group) => ({
      ...group,
      medicines: group.medicines.sort((a, b) => a.medicine_name.localeCompare(b.medicine_name)),
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
})

const openSimpleDetailSidebar = (group) => {
  selectedSimpleGroup.value = group
  showSimpleDetailSidebar.value = true
}

const closeSimpleDetailSidebar = () => {
  showSimpleDetailSidebar.value = false
}

const ensureXlsx = async () => {
  if (window.XLSX) return window.XLSX
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js'
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  return window.XLSX
}

const exportExcel = async () => {
  try {
    const XLSX = await ensureXlsx()
    const { data: meds } = await supabase
      .from('medicine_list')
      .select('id, name, unit, current_stock')
      .order('name', { ascending: true })
    const dispMap = {}
    for (const r of rawRecords.value) {
      const key = r.medicine_id || r.medicine_name
      dispMap[key] = (dispMap[key] || 0) + Number(r.amount || 0)
    }
    const sheet1 = [['ชื่อยา', 'จำนวนทั้งหมด', 'หน่วยนับ', 'จำนวนที่จ่ายไปทั้งหมด', 'เหลืออยู่ปัจจุบัน']]
    for (const m of meds || []) {
      const used = dispMap[m.id] || 0
      const total = used + Number(m.current_stock || 0)
      sheet1.push([m.name || '-', total, m.unit || '-', used, Number(m.current_stock || 0)])
    }
    const rows = [...filtered.value].sort((a, b) => {
      if (a.medicine_name === b.medicine_name) return new Date(a.created_at) - new Date(b.created_at)
      return a.medicine_name.localeCompare(b.medicine_name)
    })
    const sheet2 = [['วันที่', 'รหัสพนักงาน', 'ชื่อ-นามสกุล', 'แผนก', 'ชื่อยา', 'จำนวน', 'คนจ่ายยา']]
    for (const r of rows) {
      sheet2.push([
        new Date(r.created_at).toLocaleDateString('en-UK'),
        r.employee_code,
        r.fullname,
        r.department,
        r.medicine_name,
        r.amount,
        r.dispenser,
      ])
    }
    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.aoa_to_sheet(sheet1)
    const ws2 = XLSX.utils.aoa_to_sheet(sheet2)
    XLSX.utils.book_append_sheet(wb, ws1, 'ภาพรวมสต็อก')
    XLSX.utils.book_append_sheet(wb, ws2, 'รายละเอียดการจ่ายยา')
    const ts = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `dispensing-${ts}.xlsx`)
  } catch (e) {
    console.error('Export Excel error', e)
    showToast('error', 'เกิดข้อผิดพลาดในการส่งออก Excel')
  }
}

watch(simpleView, (enabled) => {
  if (!enabled) {
    closeSimpleDetailSidebar()
    selectedSimpleGroup.value = null
  }
})
watch(search, () => {})
watch(department, () => {})
watch(dateStart, () => {})
watch(dateEnd, () => {})

onMounted(async () => {
  await Promise.all([fetchDepartments(), loadData()])
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
        ประวัติการจ่ายยา
      </h1>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
        @click="exportExcel"
      >
        <i class="fa-solid fa-file-excel"></i>
        <span>ส่งออก Excel</span>
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
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
      <div class="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
        <label class="text-xs text-slate-600 dark:text-slate-300">ช่วงวันที่</label>
        <div class="flex items-center gap-1">
          <input
            v-model="dateStart"
            type="date"
            class="rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
          />
          <span class="text-xs text-slate-500">ถึง</span>
          <input
            v-model="dateEnd"
            type="date"
            class="rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
          />
        </div>
      </div>
      <div class="flex items-center justify-between md:justify-end gap-3">
        <label class="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
          <input
            v-model="simpleView"
            type="checkbox"
            class="rounded border-clinic-border text-clinic-blue focus:ring-clinic-blue"
          />
          <span>ดูแบบง่าย</span>
        </label>
        <div class="text-xs text-slate-600 dark:text-slate-300">
          ทั้งหมด {{ simpleView ? groupedFiltered.length : filtered.length }} รายการ
        </div>
      </div>
    </div>

    <div v-if="!simpleView" class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3 overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead>
          <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
            <th class="py-2 pr-3">วันที่</th>
            <th class="py-2 pr-3">รหัสพนักงาน</th>
            <th class="py-2 pr-3">ชื่อ-นามสกุล</th>
            <th class="py-2 pr-3">แผนก</th>
            <th class="py-2 pr-3">แพทย์วินิจฉัย</th>
            <th class="py-2 pr-3">ชื่อยา</th>
            <th class="py-2 pr-3">จำนวน</th>
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
              {{ new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'short'}) }} <br> <span class="bg-fuchsia-100 dark:bg-fuchsia-800/40 text-center text-[10px] border border-fuchsia-200 dark:border-fuchsia-800/40 px-1.5 rounded-full italic text-fuchsia-600 dark:text-fuchsia-400"> {{ new Date(r.created_at).toLocaleString('en-GB', {timeStyle: 'short' })}}</span>
            </td>
            <td class="py-1.5 pr-3">{{ r.employee_code }}</td>
            <td class="py-1.5 pr-3">{{ r.fullname }}</td>
            <td class="py-1.5 pr-3">{{ r.department }}</td>
            <td class="py-1.5 pr-3">{{ r.diagnosis }}</td>
            <td class="py-1.5 pr-3">{{ r.medicine_name }}</td>
            <td class="py-1.5 pr-3"><span class="border-2 rounded-sm border-white dark:border-slate-800  border-b-rose-500 dark:border-b-rose-400 border-r-rose-500 dark:border-r-rose-400 px-1 text-[14px] text-rose-500 dark:text-rose-400">{{ r.amount }} {{ r.unit }}</span></td>
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

    <!-- Simple View List -->
    <div v-else class="overflow-hidden rounded-2xl border border-clinic-border dark:border-slate-800 bg-white dark:bg-[#061126] shadow-xl">
      <div v-if="loading" class="py-10 text-center text-sm text-slate-400">
        กำลังโหลด...
      </div>
      <div v-else-if="!groupedFiltered.length" class="py-10 text-center text-sm text-slate-400">
        ไม่พบข้อมูล
      </div>
      <div v-else class="divide-y divide-slate-200 dark:divide-slate-800/90">
        <button
          v-for="group in groupedFiltered"
          :key="group.key"
          type="button"
          class="flex w-full items-stretch justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-[#0b1832]"
          @click="openSimpleDetailSidebar(group)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <span class="text-blue-600 dark:text-blue-400">{{ group.employee_code }}</span>
              <span class="truncate">{{ group.fullname }}</span>
              <span class="shrink-0 rounded-full border border-emerald-700 dark:border-emerald-800/60 bg-emerald-500/10 dark:bg-emerald-800/60 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-400">
                {{ group.department || 'ไม่ระบุ' }}
              </span>
            </div>
            <div class="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <i class="fa-solid fa-stethoscope text-[10px] text-slate-400 dark:text-slate-500"></i>
              <span class="truncate">{{ group.diagnosis || '-' }}</span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span class="inline-flex items-center gap-1">
                <i class="fa-solid fa-notes-medical text-[10px] text-slate-400 dark:text-slate-500"></i>
                {{ group.symptoms || '-' }}
              </span>
              <span class="inline-flex items-center gap-1">
                <i class="fa-solid fa-pills text-[10px] text-slate-400 dark:text-slate-500"></i>
                จ่าย {{ group.itemCount }} รายการ ({{ group.totalQuantity }} หน่วย)
              </span>
              <span class="inline-flex items-center gap-1">
                <i class="fa-solid fa-user-doctor text-[10px] text-slate-400 dark:text-slate-500"></i>
                {{ group.dispenser || '-' }}
              </span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-4 text-right">
            <div class="text-xs text-slate-500 dark:text-slate-400">
              <div class="font-medium text-slate-700 dark:text-slate-200">
                {{ new Date(group.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' }) }}
              </div>
              <div class="mt-0.5">
                {{ new Date(group.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}
              </div>
            </div>
            <i class="fa-solid fa-chevron-right text-xs text-slate-300 dark:text-slate-600"></i>
          </div>
        </button>
      </div>
    </div>

    <!-- Simple View Sidebar -->
    <div
      v-if="showSimpleDetailSidebar"
      class="fixed inset-0 z-[70] flex justify-end bg-black/50 backdrop-blur-sm"
      @click.self="closeSimpleDetailSidebar"
    >
      <div class="h-full w-full max-w-lg bg-white dark:bg-[#08142d] text-slate-900 dark:text-white shadow-2xl flex flex-col">
        <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-5">
          <div>
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">รายละเอียดการรักษา/จ่ายยา</h2>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {{ selectedSimpleGroup?.employee_code || '-' }} - {{ selectedSimpleGroup?.fullname || '-' }}
            </p>
          </div>
          <button
            type="button"
            class="text-slate-400 hover:text-slate-600 dark:hover:text-white"
            @click="closeSimpleDetailSidebar"
          >
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <div class="flex-1 space-y-5 overflow-y-auto p-5">
          <!-- Employee card -->
          <div class="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#091a3a] p-4">
            <div class="flex items-center gap-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400">
                <i class="fa-solid fa-user-nurse text-2xl"></i>
              </div>
              <div class="min-w-0">
                <div class="truncate text-lg font-bold text-slate-900 dark:text-white">{{ selectedSimpleGroup?.fullname || '-' }}</div>
                <div class="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  รหัส: <span class="font-semibold text-slate-800 dark:text-white">{{ selectedSimpleGroup?.employee_code || '-' }}</span>
                  | แผนก: <span class="font-semibold text-slate-800 dark:text-white">{{ selectedSimpleGroup?.department || '-' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Visit info -->
          <div>
            <h3 class="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">ข้อมูลการเข้ารับบริการ</h3>
            <div class="grid grid-cols-2 gap-3 text-xs">
              <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0a1834] p-3">
                <div class="mb-1 flex items-center gap-2 text-slate-400 dark:text-slate-400">
                  <i class="fa-regular fa-calendar"></i>
                  <span>วันที่</span>
                </div>
                <div class="font-semibold text-slate-800 dark:text-white">
                  {{ selectedSimpleGroup ? new Date(selectedSimpleGroup.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' }) : '-' }}
                </div>
              </div>
              <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0a1834] p-3">
                <div class="mb-1 flex items-center gap-2 text-slate-400 dark:text-slate-400">
                  <i class="fa-regular fa-clock"></i>
                  <span>เวลา</span>
                </div>
                <div class="font-semibold text-slate-800 dark:text-white">
                  {{ selectedSimpleGroup ? new Date(selectedSimpleGroup.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-' }}
                </div>
              </div>
              <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0a1834] p-3">
                <div class="mb-1 flex items-center gap-2 text-slate-400 dark:text-slate-400">
                  <i class="fa-solid fa-notes-medical"></i>
                  <span>อาการ</span>
                </div>
                <div class="font-semibold text-slate-800 dark:text-white">{{ selectedSimpleGroup?.symptoms || '-' }}</div>
              </div>
              <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0a1834] p-3">
                <div class="mb-1 flex items-center gap-2 text-slate-400 dark:text-slate-400">
                  <i class="fa-solid fa-stethoscope"></i>
                  <span>Diagnosis</span>
                </div>
                <div class="font-semibold text-slate-800 dark:text-white">{{ selectedSimpleGroup?.diagnosis || '-' }}</div>
              </div>
              <div class="col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0a1834] p-3">
                <div class="mb-1 flex items-center gap-2 text-slate-400 dark:text-slate-400">
                  <i class="fa-solid fa-user-doctor"></i>
                  <span>ผู้จ่ายยา/ตรวจ</span>
                </div>
                <div class="font-semibold text-slate-800 dark:text-white">{{ selectedSimpleGroup?.dispenser || '-' }}</div>
              </div>
            </div>
          </div>

          <!-- Medicine list -->
          <div>
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">รายการยาที่จ่าย</h3>
              <div class="text-xs text-slate-400 dark:text-slate-400">
                {{ selectedSimpleGroup?.itemCount || 0 }} รายการ
              </div>
            </div>
            <div class="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0a1834]">
              <table class="min-w-full text-xs">
                <thead class="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th class="px-4 py-3 text-left">รายการยา</th>
                    <th class="px-4 py-3 text-right">จำนวน</th>
                    <th class="px-4 py-3 text-left">หน่วย</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in selectedSimpleGroup?.medicines || []"
                    :key="item.id"
                    class="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td class="px-4 py-3 font-medium text-slate-800 dark:text-white">{{ item.medicine_name }}</td>
                    <td class="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">{{ item.amount }}</td>
                    <td class="px-4 py-3">
                      <span class="rounded-full border border-slate-200 dark:border-slate-600 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                        {{ item.unit || '-' }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="!(selectedSimpleGroup?.medicines || []).length">
                    <td colspan="3" class="px-3 py-4 text-center text-slate-400">ไม่พบรายการยา</td>
                  </tr>
                </tbody>
                <tfoot v-if="selectedSimpleGroup">
                  <tr class="border-t border-slate-200 dark:border-slate-700">
                    <td class="px-4 py-3 text-right font-semibold text-slate-500 dark:text-slate-300" colspan="2">รวมทั้งหมด</td>
                    <td class="px-4 py-3 font-bold text-blue-600 dark:text-blue-400">
                      {{ selectedSimpleGroup?.totalQuantity || 0 }} หน่วย
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div class="border-t border-slate-200 dark:border-slate-800 p-5">
          <button
            type="button"
            class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/80 px-4 py-3 text-sm font-medium text-slate-700 dark:text-white transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
            @click="closeSimpleDetailSidebar"
          >
            <i class="fa-solid fa-xmark"></i>
            <span>ปิดหน้าต่าง</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
