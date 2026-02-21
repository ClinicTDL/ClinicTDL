<script setup>
import { onMounted, ref, computed } from 'vue'
import { supabase } from '../supabaseClient'
import { showToast } from '../stores/ui'

const loading = ref(false)
const employees = ref([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = 15
const search = ref('')
const department = ref('')
const departments = ref([])
const mode = ref('recent')

const showSidebar = ref(false)
const sidebarMode = ref('form')

const formData = ref({
  employee_code: '',
  fullname: '',
  position: '',
  department: '',
  project: 'เชโปน',
  company: 'THAIDRILL LAO SOLE',
  dob: '',
  tel: '',
  status: 'พนักงาน',
  congenital_disease: '',
  drug_allergy: '',
})

const uploadFile = ref(null)
const uploadFileName = ref('')
const fileInputRef = ref(null)
const uploadProcessing = ref(false)
const uploadInserted = ref(0)
const uploadSkipped = ref([])
const uploadErrors = ref([])

const totalPages = computed(() => {
  if (!totalCount.value || totalCount.value <= pageSize) return 1
  return Math.ceil(totalCount.value / pageSize)
})

const pagesToShow = computed(() => {
  const tp = totalPages.value
  const current = page.value
  if (tp <= 5) {
    return Array.from({ length: tp }, (_, i) => i + 1)
  }
  const pages = new Set()
  pages.add(1)
  pages.add(2)
  pages.add(tp)
  pages.add(tp - 1)
  pages.add(current)
  pages.add(current - 1)
  pages.add(current + 1)
  const list = Array.from(pages)
    .filter((p) => p >= 1 && p <= tp)
    .sort((a, b) => a - b)
  const result = []
  let last = 0
  for (const p of list) {
    if (last && p - last > 1) {
      result.push('...')
    }
    result.push(p)
    last = p
  }
  return result
})

const loadDepartments = async () => {
  const { data } = await supabase.from('employees').select('department').limit(5000)
  const set = new Set(
    (data || [])
      .map((r) => (r?.department || '').toString().trim())
      .filter((v) => !!v),
  )
  departments.value = Array.from(set).sort()
}

const loadRecentEmployees = async () => {
  loading.value = true
  mode.value = 'recent'
  page.value = 1
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(pageSize)
    if (error) throw error
    employees.value = data || []
    totalCount.value = employees.value.length
  } catch (err) {
    console.error('Load recent employees error', err)
    showToast('error', 'โหลดข้อมูลพนักงานล่าสุดไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

const loadWithSearch = async () => {
  loading.value = true
  mode.value = 'search'
  try {
    const from = (page.value - 1) * pageSize
    const to = from + pageSize - 1
    let query = supabase
      .from('employees')
      .select('*', { count: 'exact' })

    const q = (search.value || '').trim()
    if (q) {
      query = query.or(`employee_code.ilike.%${q}%,fullname.ilike.%${q}%`)
    }
    if (department.value) {
      query = query.eq('department', department.value)
    }

    query = query.order('employee_code', { ascending: true }).range(from, to)

    const { data, error, count } = await query
    if (error) throw error
    employees.value = data || []
    totalCount.value = count || 0
  } catch (err) {
    console.error('Load employees search error', err)
    showToast('error', 'ค้นหาข้อมูลพนักงานไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  page.value = 1
  if (!search.value && !department.value) {
    await loadRecentEmployees()
  } else {
    await loadWithSearch()
  }
}

const goToPage = async (p) => {
  if (typeof p !== 'number') return
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  if (mode.value === 'search') {
    await loadWithSearch()
  } else {
    await loadRecentEmployees()
  }
}

const openSidebar = (modeName) => {
  sidebarMode.value = modeName
  showSidebar.value = true
  if (modeName === 'form') {
    formData.value = {
      employee_code: '',
      fullname: '',
      position: '',
      department: '',
      project: 'เชโปน',
      company: 'THAIDRILL LAO SOLE',
      dob: '',
      tel: '',
      status: 'พนักงาน',
      congenital_disease: '',
      drug_allergy: '',
    }
  } else {
    uploadFile.value = null
    uploadFileName.value = ''
    uploadProcessing.value = false
    uploadInserted.value = 0
    uploadSkipped.value = []
    uploadErrors.value = []
  }
}

const closeSidebar = () => {
  showSidebar.value = false
}

const handleSaveEmployee = async () => {
  const payload = {
    employee_code: (formData.value.employee_code || '').trim(),
    fullname: (formData.value.fullname || '').trim(),
    position: (formData.value.position || '').trim() || null,
    department: (formData.value.department || '').trim() || null,
    project: (formData.value.project || '').trim() || null,
    company: (formData.value.company || '').trim() || null,
    dob: formData.value.dob || null,
    tel: (formData.value.tel || '').trim() || null,
    status: (formData.value.status || '').trim() || null,
    congenital_disease: (formData.value.congenital_disease || '').trim() || null,
    drug_allergy: (formData.value.drug_allergy || '').trim() || null,
  }

  if (!payload.employee_code || !payload.fullname) {
    showToast('error', 'กรุณากรอกรหัสพนักงานและชื่อ-นามสกุล')
    return
  }

  try {
    const { data: existing, error: existingError } = await supabase
      .from('employees')
      .select('id')
      .eq('employee_code', payload.employee_code)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      showToast('error', 'มีรหัสพนักงานนี้ในระบบแล้ว')
      return
    }

    const { error } = await supabase.from('employees').insert(payload)
    if (error) throw error

    showToast('success', 'บันทึกข้อมูลพนักงานสำเร็จ')
    closeSidebar()
    if (mode.value === 'recent') {
      await loadRecentEmployees()
    } else {
      await loadWithSearch()
    }
    await loadDepartments()
  } catch (err) {
    console.error('Save employee error', err)
    showToast('error', 'บันทึกข้อมูลพนักงานไม่สำเร็จ')
  }
}

const handleFileFromList = (file) => {
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showToast('error', 'รองรับเฉพาะไฟล์ CSV เท่านั้น')
    return
  }
  uploadFile.value = file
  uploadFileName.value = file.name
}

const handleFileSelect = (event) => {
  const file = event.target.files?.[0]
  handleFileFromList(file)
}

const handleDrop = (event) => {
  const file = event.dataTransfer?.files?.[0]
  handleFileFromList(file)
}

const openFilePicker = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

const parseCsvText = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (!lines.length) return []
  const parseLine = (line) => {
    const result = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current)
    return result.map((v) => v.trim())
  }

  const first = parseLine(lines[0])
  const headerLike = first.map((h) => h.toLowerCase())
  const hasHeader =
    headerLike.includes('employee_code') || headerLike.includes('fullname')

  const records = []
  if (hasHeader) {
    const headers = first
    for (let i = 1; i < lines.length; i += 1) {
      const cols = parseLine(lines[i])
      const row = {}
      headers.forEach((h, idx) => {
        const key = h.toLowerCase()
        row[key] = cols[idx] ?? ''
      })
      records.push(row)
    }
  } else {
    for (let i = 0; i < lines.length; i += 1) {
      const cols = parseLine(lines[i])
      records.push({
        employee_code: cols[0] ?? '',
        fullname: cols[1] ?? '',
        position: cols[2] ?? '',
        department: cols[3] ?? '',
        project: cols[4] ?? '',
        company: cols[5] ?? '',
        dob: cols[6] ?? '',
        tel: cols[7] ?? '',
        status: cols[8] ?? '',
        congenital_disease: cols[9] ?? '',
        drug_allergy: cols[10] ?? '',
      })
    }
  }
  return records
}

const processUpload = async () => {
  if (!uploadFile.value) {
    showToast('error', 'กรุณาเลือกไฟล์ CSV ก่อน')
    return
  }

  uploadProcessing.value = true
  uploadInserted.value = 0
  uploadSkipped.value = []
  uploadErrors.value = []

  try {
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result || '')
      reader.onerror = (e) => reject(e)
      reader.readAsText(uploadFile.value)
    })

    const rawRows = parseCsvText(String(text || ''))
    if (!rawRows.length) {
      showToast('error', 'ไม่พบข้อมูลในไฟล์')
      return
    }

    const normalizeRow = (r) => {
      const get = (k) => (r[k] ?? r[k.toLowerCase()] ?? '').toString().trim()
      return {
        employee_code: get('employee_code'),
        fullname: get('fullname'),
        position: get('position'),
        department: get('department'),
        project: get('project'),
        company: get('company'),
        dob: get('dob'),
        tel: get('tel'),
        status: get('status'),
        congenital_disease: get('congenital_disease'),
        drug_allergy: get('drug_allergy'),
      }
    }

    const rows = rawRows.map(normalizeRow)
    const codes = Array.from(
      new Set(
        rows
          .map((r) => (r.employee_code || '').trim())
          .filter((v) => !!v),
      ),
    )

    let existingCodes = new Set()
    if (codes.length) {
      const { data: existing, error: existingError } = await supabase
        .from('employees')
        .select('employee_code')
        .in('employee_code', codes)
      if (existingError) throw existingError
      existingCodes = new Set(
        (existing || []).map((r) => (r.employee_code || '').toString().trim()),
      )
    }

    let inserted = 0
    const skipped = []
    const errors = []

    for (const r of rows) {
      const code = (r.employee_code || '').trim()
      if (!code) {
        errors.push({
          type: 'error',
          employee_code: '',
          fullname: r.fullname || '',
          department: r.department || '',
          reason: 'ไม่มีรหัสพนักงาน',
          raw: JSON.stringify(r),
        })
        continue
      }
      if (existingCodes.has(code)) {
        skipped.push({
          type: 'skipped',
          employee_code: code,
          fullname: r.fullname || '',
          department: r.department || '',
          reason: 'พบรหัสพนักงานนี้อยู่แล้ว',
          raw: JSON.stringify(r),
        })
        continue
      }

      const payload = {
        employee_code: code,
        fullname: (r.fullname || '').trim(),
        position: (r.position || '').trim() || null,
        department: (r.department || '').trim() || null,
        project: (r.project || '').trim() || null,
        company: (r.company || '').trim() || null,
        dob: r.dob || null,
        tel: (r.tel || '').trim() || null,
        status: (r.status || '').trim() || null,
        congenital_disease: (r.congenital_disease || '').trim() || null,
        drug_allergy: (r.drug_allergy || '').trim() || null,
      }

      try {
        const { error } = await supabase.from('employees').insert(payload)
        if (error) {
          errors.push({
            type: 'error',
            employee_code: code,
            fullname: r.fullname || '',
            department: r.department || '',
            reason: error.message || 'ไม่สามารถบันทึกได้',
            raw: JSON.stringify(payload),
          })
        } else {
          inserted += 1
          existingCodes.add(code)
        }
      } catch (e) {
        errors.push({
          type: 'error',
          employee_code: code,
          fullname: r.fullname || '',
          department: r.department || '',
          reason: e.message || 'ไม่สามารถบันทึกได้',
          raw: JSON.stringify(payload),
        })
      }
    }

    uploadInserted.value = inserted
    uploadSkipped.value = skipped
    uploadErrors.value = errors

    showToast(
      errors.length
        ? 'error'
        : 'success',
      `เพิ่มข้อมูลใหม่ ${inserted} รายการ ข้าม ${skipped.length} รายการ ผิดพลาด ${errors.length} รายการ`,
    )

    await loadRecentEmployees()
    await loadDepartments()
  } catch (err) {
    console.error('Upload employees error', err)
    showToast('error', 'อัพโหลดข้อมูลจากไฟล์ไม่สำเร็จ')
  } finally {
    uploadProcessing.value = false
  }
}

const downloadResultCsv = () => {
  const rows = [...uploadSkipped.value, ...uploadErrors.value]
  if (!rows.length) return
  const escape = (v) => {
    const s = (v == null ? '' : String(v))
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const header = [
    'type',
    'employee_code',
    'fullname',
    'department',
    'reason',
    'raw_data',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        escape(r.type),
        escape(r.employee_code),
        escape(r.fullname),
        escape(r.department),
        escape(r.reason),
        escape(r.raw),
      ].join(','),
    )
  }
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'employee_upload_result.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

onMounted(async () => {
  await Promise.all([loadDepartments(), loadRecentEmployees()])
})
</script>

<template>
  <div class="space-y-4 relative">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
        รายชื่อพนักงาน
      </h1>
      <button
        type="button"
        class="inline-flex items-center justify-center gap-1 rounded-lg bg-clinic-blue text-white px-3 py-2 text-xs hover:bg-blue-700"
        @click="openSidebar('form')"
      >
        <i class="fa-solid fa-user-plus text-xs"></i>
        <span>เพิ่มพนักงานใหม่</span>
      </button>
    </div>

    <div class="flex flex-wrap gap-2 items-center">
      <div class="flex-1 min-w-[200px] flex items-center gap-2">
        <input
          v-model="search"
          type="text"
          placeholder="ค้นหาด้วยรหัสพนักงาน หรือชื่อ-นามสกุล"
          class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
          @keyup.enter="handleSearch"
        />
      </div>
      <div class="flex items-center gap-2">
        <select
          v-model="department"
          class="rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
        >
          <option value="">ทุกแผนก</option>
          <option v-for="d in departments" :key="d" :value="d">
            {{ d }}
          </option>
        </select>
      </div>
      <button
        type="button"
        class="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-800 text-white px-3 py-2 text-xs hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
        :disabled="loading"
        @click="handleSearch"
      >
        <i class="fa-solid fa-magnifying-glass text-xs"></i>
        <span>ค้นหา</span>
      </button>
      <button
        type="button"
        class="inline-flex items-center justify-center gap-1 rounded-lg border border-clinic-border dark:border-slate-600 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-clinic-light dark:hover:bg-slate-800"
        :disabled="loading"
        @click="
          () => {
            search = ''
            department = ''
            handleSearch()
          }
        "
      >
        ล้างตัวกรอง
      </button>
    </div>

    <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3 overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead>
          <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
            <th class="py-2 pr-3">รหัสพนักงาน</th>
            <th class="py-2 pr-3">ชื่อ-นามสกุล</th>
            <th class="py-2 pr-3">ตำแหน่ง</th>
            <th class="py-2 pr-3">แผนก</th>
            <th class="py-2 pr-3">โครงการ</th>
            <th class="py-2 pr-3">บริษัท</th>
            <th class="py-2 pr-3">เบอร์โทร</th>
            <th class="py-2 pr-3">สถานะ</th>
            <th class="py-2 pr-3">บันทึกเมื่อ</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="e in employees"
            :key="e.id"
            class="border-b border-clinic-border/60 dark:border-slate-800"
          >
            <td class="py-1.5 pr-3 font-medium text-slate-900 dark:text-slate-50">
              {{ e.employee_code }}
            </td>
            <td class="py-1.5 pr-3">
              {{ e.fullname }}
            </td>
            <td class="py-1.5 pr-3">
              {{ e.position || '-' }}
            </td>
            <td class="py-1.5 pr-3">
              {{ e.department || '-' }}
            </td>
            <td class="py-1.5 pr-3">
              {{ e.project || '-' }}
            </td>
            <td class="py-1.5 pr-3">
              {{ e.company || '-' }}
            </td>
            <td class="py-1.5 pr-3">
              {{ e.tel || '-' }}
            </td>
            <td class="py-1.5 pr-3">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px]"
                :class="
                  e.status === 'ลาออก' || e.status === 'ออก'
                    ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                "
              >
                {{ e.status || 'ทำงานอยู่' }}
              </span>
            </td>
            <td class="py-1.5 pr-3 whitespace-nowrap">
              {{ e.created_at ? new Date(e.created_at).toLocaleString() : '-' }}
            </td>
          </tr>
          <tr v-if="!employees.length && !loading">
            <td colspan="9" class="py-4 text-center text-slate-400">
              ไม่พบข้อมูลพนักงาน
            </td>
          </tr>
          <tr v-if="loading">
            <td colspan="9" class="py-4 text-center text-slate-400">
              กำลังโหลดข้อมูล...
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="mode === 'search' && totalPages > 1"
      class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300"
    >
      <div>
        พบทั้งหมด {{ totalCount }} รายการ | หน้า {{ page }} / {{ totalPages }}
      </div>
      <div class="inline-flex items-center gap-1">
        <button
          type="button"
          class="px-2 py-1 rounded border border-clinic-border dark:border-slate-700"
          :disabled="page <= 1"
          @click="goToPage(page - 1)"
        >
          ก่อนหน้า
        </button>
        <button
          v-for="p in pagesToShow"
          :key="p + ''"
          type="button"
          class="min-w-[28px] px-2 py-1 rounded border text-xs"
          :class="
            typeof p === 'number' && p === page
              ? 'border-clinic-blue bg-clinic-blue text-white'
              : 'border-clinic-border dark:border-slate-700 text-slate-700 dark:text-slate-200'
          "
          :disabled="p === '...'"
          @click="goToPage(p)"
        >
          {{ p }}
        </button>
        <button
          type="button"
          class="px-2 py-1 rounded border border-clinic-border dark:border-slate-700"
          :disabled="page >= totalPages"
          @click="goToPage(page + 1)"
        >
          ถัดไป
        </button>
      </div>
    </div>

    <div v-if="showSidebar" class="fixed inset-0 z-40">
      <div class="absolute inset-0 bg-black/30" @click="closeSidebar"></div>
      <div
        class="absolute right-0 top-0 h-full w-full md:w-[420px] bg-white dark:bg-slate-900 border-l border-clinic-border dark:border-slate-800 p-4 flex flex-col gap-3"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm font-semibold text-slate-900 dark:text-white">
            จัดการข้อมูลพนักงาน
          </div>
          <button
            type="button"
            class="w-8 h-8 inline-flex items-center justify-center rounded-full border border-clinic-border dark:border-slate-700 text-slate-500 hover:bg-clinic-light dark:hover:bg-slate-800"
            @click="closeSidebar"
          >
            <i class="fa-solid fa-xmark text-xs"></i>
          </button>
        </div>

        <div class="flex rounded-full bg-clinic-light/70 dark:bg-slate-800 p-1 text-xs">
          <button
            type="button"
            class="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-full"
            :class="
              sidebarMode === 'form'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow'
                : 'text-slate-600 dark:text-slate-300'
            "
            @click="sidebarMode = 'form'"
          >
            <i class="fa-solid fa-pen-to-square text-xs"></i>
            <span>บันทึกข้อมูล</span>
          </button>
          <button
            type="button"
            class="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-full"
            :class="
              sidebarMode === 'upload'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow'
                : 'text-slate-600 dark:text-slate-300'
            "
            @click="sidebarMode = 'upload'"
          >
            <i class="fa-solid fa-file-arrow-up text-xs"></i>
            <span>อัพโหลดข้อมูล</span>
          </button>
        </div>

        <div v-if="sidebarMode === 'form'" class="flex-1 overflow-y-auto pr-1 space-y-2">
          <div class="grid grid-cols-1 gap-2">
            <div>
              <div class="text-xs text-slate-600 dark:text-slate-300">
                รหัสพนักงาน *
              </div>
              <input
                v-model="formData.employee_code"
                type="text"
                class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              />
            </div>
            <div>
              <div class="text-xs text-slate-600 dark:text-slate-300">
                ชื่อ-นามสกุล *
              </div>
              <input
                v-model="formData.fullname"
                type="text"
                class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <div class="text-xs text-slate-600 dark:text-slate-300">ตำแหน่ง</div>
              <input
                v-model="formData.position"
                type="text"
                class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              />
            </div>
            <div>
              <div class="text-xs text-slate-600 dark:text-slate-300">แผนก</div>
              <input
                v-model="formData.department"
                type="text"
                class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <div class="text-xs text-slate-600 dark:text-slate-300">โครงการ</div>
              <input
                v-model="formData.project"
                type="text"
                class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              />
            </div>
            <div>
              <div class="text-xs text-slate-600 dark:text-slate-300">บริษัท</div>
              <input
                v-model="formData.company"
                type="text"
                class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <div class="text-xs text-slate-600 dark:text-slate-300">
                วันเกิด (YYYY-MM-DD)
              </div>
              <input
                v-model="formData.dob"
                type="date"
                class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              />
            </div>
            <div>
              <div class="text-xs text-slate-600 dark:text-slate-300">เบอร์โทร</div>
              <input
                v-model="formData.tel"
                type="text"
                class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              />
            </div>
          </div>

          <div>
            <div class="text-xs text-slate-600 dark:text-slate-300">สถานะการทำงาน</div>
            <input
              v-model="formData.status"
              type="text"
              placeholder="เช่น ทำงานอยู่, ลาออก"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            />
          </div>

          <div>
            <div class="text-xs text-slate-600 dark:text-slate-300">
              โรคประจำตัว
            </div>
            <textarea
              v-model="formData.congenital_disease"
              rows="2"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            ></textarea>
          </div>

          <div>
            <div class="text-xs text-slate-600 dark:text-slate-300">
              ประวัติการแพ้ยา
            </div>
            <textarea
              v-model="formData.drug_allergy"
              rows="2"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            ></textarea>
          </div>
        </div>

        <div
          v-else
          class="flex-1 overflow-y-auto pr-1 space-y-3"
        >
          <div
            class="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-clinic-border dark:border-slate-600 rounded-xl px-4 py-8 bg-clinic-light/40 dark:bg-slate-800/40"
            @dragover.prevent
            @dragenter.prevent
            @drop.prevent="handleDrop"
          >
            <div class="flex flex-col items-center gap-2">
              <div
                class="w-12 h-12 rounded-full bg-clinic-blue/10 flex items-center justify-center"
              >
                <i class="fa-solid fa-file-csv text-clinic-blue"></i>
              </div>
              <div class="text-xs text-center text-slate-700 dark:text-slate-200">
                ลากไฟล์ CSV มาวางที่นี่<br />
                หรือกดปุ่มด้านล่างเพื่อเลือกไฟล์
              </div>
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400">
              รองรับเฉพาะไฟล์ .csv เท่านั้น
            </div>
            <input
              ref="fileInputRef"
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              @change="handleFileSelect"
            />
            <button
              type="button"
              class="px-3 py-2 rounded-lg text-xs border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-clinic-light dark:hover:bg-slate-800"
              @click="openFilePicker"
            >
              เลือกไฟล์ CSV
            </button>
            <div v-if="uploadFileName" class="text-xs text-slate-700 dark:text-slate-200">
              ไฟล์ที่เลือก: <span class="font-medium">{{ uploadFileName }}</span>
            </div>
          </div>

          <div
            v-if="uploadInserted || uploadSkipped.length || uploadErrors.length"
            class="space-y-2 text-xs"
          >
            <div class="text-slate-700 dark:text-slate-200">
              ผลการประมวลผล:
              เพิ่มใหม่ {{ uploadInserted }} รายการ,
              ข้าม {{ uploadSkipped.length }} รายการ,
              ผิดพลาด {{ uploadErrors.length }} รายการ
            </div>

            <div
              v-if="uploadSkipped.length"
              class="border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 rounded-lg p-2"
            >
              <div class="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                รายการที่ข้าม (มีรหัสพนักงานอยู่แล้ว)
              </div>
              <ul class="space-y-0.5 max-h-32 overflow-y-auto">
                <li
                  v-for="s in uploadSkipped"
                  :key="s.employee_code + s.raw"
                  class="text-amber-900 dark:text-amber-100"
                >
                  {{ s.employee_code }} - {{ s.fullname }}
                  <span class="text-amber-700 dark:text-amber-300">
                    ({{ s.reason }})
                  </span>
                </li>
              </ul>
            </div>

            <div
              v-if="uploadErrors.length"
              class="border border-red-200 bg-red-50 dark:border-red-700 dark:bg-red-900/20 rounded-lg p-2"
            >
              <div class="font-semibold text-red-800 dark:text-red-200 mb-1">
                รายการที่บันทึกไม่สำเร็จ
              </div>
              <ul class="space-y-0.5 max-h-32 overflow-y-auto">
                <li
                  v-for="e in uploadErrors"
                  :key="e.employee_code + e.raw"
                  class="text-red-900 dark:text-red-100"
                >
                  {{ e.employee_code || '-' }} - {{ e.fullname }}
                  <span class="text-red-700 dark:text-red-300">
                    ({{ e.reason }})
                  </span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              class="px-3 py-2 rounded-lg text-xs bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
              @click="downloadResultCsv"
            >
              ดาวน์โหลดผลการอัพโหลด (CSV)
            </button>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 mt-3">
          <button
            type="button"
            class="px-3 py-2 rounded-lg text-xs border border-clinic-border dark:border-slate-700"
            @click="closeSidebar"
          >
            ยกเลิก
          </button>
          <button
            v-if="sidebarMode === 'form'"
            type="button"
            class="px-3 py-2 rounded-lg text-xs bg-clinic-blue text-white"
            @click="handleSaveEmployee"
          >
            บันทึก
          </button>
          <button
            v-else
            type="button"
            class="px-3 py-2 rounded-lg text-xs bg-clinic-blue text-white disabled:opacity-60"
            :disabled="uploadProcessing || !uploadFile"
            @click="processUpload"
          >
            {{ uploadProcessing ? 'กำลังอัพโหลด...' : 'อัพโหลดข้อมูล' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
