<script setup>
import { onMounted, ref, watch, computed } from 'vue'
import { supabase } from '../supabaseClient'
import bcrypt from 'bcryptjs'

const loading = ref(false)
const users = ref([])

const showAdd = ref(false)
const empSearch = ref('')
const employeeOptions = ref([])
const showEmployeeOptions = ref(false)
const loadingEmployee = ref(false)
const selectedEmployee = ref(null)
let employeeSearchTimer = null

const newUsername = ref('')
const newPassword = ref('')
const newStatus = ref('user')
const saving = ref(false)
const confirmAdd = ref(false)
const saveError = ref('')

const getCookie = (name) => {
  const v = document.cookie.split('; ').find((row) => row.startsWith(name + '='))
  return v ? v.split('=')[1] : ''
}
let session = null
try {
  const raw = getCookie('clinic_tdl_session') || localStorage.getItem('clinic_tdl_session')
  session = raw ? JSON.parse(decodeURIComponent(raw)) : null
} catch {
  session = null
}
const isAdmin = computed(() => session?.status === 'admin')

const loadUsers = async () => {
  loading.value = true
  try {
    let query = supabase
      .from('system_users')
      .select('id, username, full_name, emp_code, created_at, created_by, status')

    // Filter by status if not admin
    if (!isAdmin.value) {
      query = query.eq('status', 'user')
    }

    const { data, error } = await query.order('username')
    if (error) throw error
    const rows = data || []
    const ids = Array.from(new Set(rows.map((r) => r.created_by).filter((v) => !!v)))
    let creatorMap = {}
    if (ids.length) {
      const { data: creators, error: cErr } = await supabase
        .from('system_users')
        .select('id, full_name, username')
        .in('id', ids)
      if (!cErr) {
        creatorMap = Object.fromEntries(
          (creators || []).map((c) => [c.id, `${c.full_name} (${c.username})`]),
        )
      }
    }
    users.value = rows.map((r) => ({
      ...r,
      creator_text: creatorMap[r.created_by] || '-',
    }))
  } catch (err) {
    console.error('Load users error', err)
  } finally {
    loading.value = false
  }
}

const openAdd = () => {
  showAdd.value = true
  empSearch.value = ''
  employeeOptions.value = []
  showEmployeeOptions.value = false
  selectedEmployee.value = null
  newUsername.value = ''
  newPassword.value = ''
  newStatus.value = 'user'
  confirmAdd.value = false
  saveError.value = ''
}
const closeAdd = () => {
  showAdd.value = false
}

watch(empSearch, async (val) => {
  if (employeeSearchTimer) clearTimeout(employeeSearchTimer)
  const q = (val || '').trim()
  if (!q) {
    employeeOptions.value = []
    showEmployeeOptions.value = false
    selectedEmployee.value = null
    return
  }
  employeeSearchTimer = setTimeout(async () => {
    loadingEmployee.value = true
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_code, fullname, department')
        .or(`employee_code.ilike.%${q}%,fullname.ilike.%${q}%`)
        .order('employee_code', { ascending: true })
        .limit(10)
      if (error) throw error
      employeeOptions.value = data || []
      showEmployeeOptions.value = employeeOptions.value.length > 0
    } catch (err) {
      employeeOptions.value = []
      showEmployeeOptions.value = false
    } finally {
      loadingEmployee.value = false
    }
  }, 200)
})

const selectEmployee = (emp) => {
  empSearch.value = `${emp.employee_code} - ${emp.fullname}`
  selectedEmployee.value = emp
  employeeOptions.value = []
  showEmployeeOptions.value = false
}

const requestSave = () => {
  saveError.value = ''
  if (!selectedEmployee.value || !newUsername.value || !newPassword.value) {
    saveError.value = 'กรอกข้อมูลให้ครบ'
    return
  }
  if (!isAdmin.value && newStatus.value === 'admin') {
    saveError.value = 'ผู้ใช้ทั่วไปไม่สามารถเพิ่มผู้ใช้สถานะ admin ได้'
    return
  }
  confirmAdd.value = true
}

const confirmSave = async () => {
  saving.value = true
  try {
    const raw = (document.cookie.split('; ').find(r => r.startsWith('clinic_tdl_session=')) || '').split('=')[1] || localStorage.getItem('clinic_tdl_session') || ''
    let sess = null
    try { sess = raw ? JSON.parse(decodeURIComponent(raw)) : null } catch { sess = null }
    const creatorId = sess?.userId || null
    const password_hash = await bcrypt.hash(newPassword.value, 10)
    const payload = {
      username: newUsername.value,
      password_hash,
      emp_code: selectedEmployee.value.employee_code,
      full_name: selectedEmployee.value.fullname,
      status: isAdmin.value ? newStatus.value : 'user',
      created_by: creatorId,
    }
    const { error } = await supabase.from('system_users').insert(payload)
    if (error) throw error
    confirmAdd.value = false
    showAdd.value = false
    await loadUsers()
  } catch (e) {
    saveError.value = 'บันทึกล้มเหลว'
  } finally {
    saving.value = false
  }
}

onMounted(loadUsers)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
        รายชื่อผู้ใช้งาน
      </h1>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-xs bg-clinic-blue text-white"
        @click="openAdd"
      >
        เพิ่มผู้ใช้งาน
      </button>
    </div>

    <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3 overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead>
          <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
            <th class="py-2 pr-3">Username</th>
            <th class="py-2 pr-3">รหัสพนักงาน</th>
            <th class="py-2 pr-3">ชื่อ-นามสกุล</th>
            <th v-if="isAdmin" class="py-2 pr-3">สถานะ</th>
            <th class="py-2 pr-3">ผู้ที่เพิ่มเข้ามา</th>
            <th class="py-2 pr-3">เพิ่มเมื่อ</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="u in users"
            :key="u.id"
            class="border-b border-clinic-border/60 dark:border-slate-800"
          >
            <td class="py-1.5 pr-3">{{ u.username }}</td>
            <td class="py-1.5 pr-3">{{ u.emp_code }}</td>
            <td class="py-1.5 pr-3">{{ u.full_name }}</td>
            <td v-if="isAdmin" class="py-1.5 pr-3">
              <span 
                class="px-2 py-0.5 rounded-full text-[10px] font-medium"
                :class="u.status === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'"
              >
                {{ u.status }}
              </span>
            </td>
            <td class="py-1.5 pr-3">
              {{ u.creator_text }}
            </td>
            <td class="py-1.5 pr-3">{{ new Date(u.created_at).toLocaleString() }}</td>
          </tr>
          <tr v-if="!users.length">
            <td colspan="5" class="py-4 text-center text-slate-400">
              ไม่พบผู้ใช้งาน
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showAdd" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/30" @click="closeAdd"></div>
      <div class="absolute right-0 top-0 h-full w-full md:w-[380px] bg-white dark:bg-slate-900 border-l border-clinic-border dark:border-slate-800 p-4 flex flex-col gap-3">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">เพิ่มผู้ใช้งาน</div>
        <div class="space-y-2">
          <div class="text-xs text-slate-600 dark:text-slate-300">ค้นหารหัสพนักงาน</div>
          <input
            v-model="empSearch"
            type="text"
            placeholder="กรอกชื่อหรือรหัสพนักงานเพื่อค้นหา"
            class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
          />
          <div v-if="showEmployeeOptions" class="rounded-lg border border-clinic-border dark:border-slate-700 bg-white dark:bg-slate-800 max-h-40 overflow-y-auto">
            <button
              v-for="e in employeeOptions"
              :key="e.id"
              type="button"
              class="w-full text-left px-3 py-1.5 text-xs hover:bg-clinic-light dark:hover:bg-slate-700"
              @click="selectEmployee(e)"
            >
              {{ e.employee_code }} - {{ e.fullname }} <span class="text-slate-400">({{ e.department }})</span>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-2">
          <div>
            <div class="text-xs text-slate-600 dark:text-slate-300">Username</div>
            <input
              v-model="newUsername"
              type="text"
              placeholder="กรอกชื่อนำใช้ระบบ"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            />
          </div>
          <div>
            <div class="text-xs text-slate-600 dark:text-slate-300">Password</div>
            <input
              v-model="newPassword"
              type="password"
              placeholder="กรอกรหัสผ่าน"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            />
          </div>
          <div>
            <div class="text-xs text-slate-600 dark:text-slate-300">สถานะผู้ใช้</div>
            <select
              v-model="newStatus"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              :disabled="!isAdmin"
            >
              <option value="user">user</option>
              <option v-if="isAdmin" value="admin">admin</option>
            </select>
          </div>
        </div>
        <div class="text-xs text-red-600" v-if="saveError">{{ saveError }}</div>
        <div class="flex items-center justify-end gap-2 mt-auto">
          <button
            type="button"
            class="px-3 py-2 rounded-lg text-xs border border-clinic-border dark:border-slate-700"
            @click="closeAdd"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            class="px-3 py-2 rounded-lg text-xs bg-clinic-blue text-white"
            :disabled="saving"
            @click="requestSave"
          >
            บันทึก
          </button>
        </div>

        <div v-if="confirmAdd" class="fixed inset-0 z-50">
          <div class="absolute inset-0 bg-black/40"></div>
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="w-[320px] rounded-xl border border-clinic-border dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div class="text-sm font-semibold text-slate-900 dark:text-white">ยืนยันการเพิ่มผู้ใช้ใหม่</div>
              <div class="text-xs text-slate-700 dark:text-slate-300">
                คุณแน่ใจหรือไม่ที่จะเพิ่มผู้ใช้ใหม่ {{ selectedEmployee?.fullname }} , {{ newUsername }}
              </div>
              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  class="px-3 py-2 rounded-lg text-xs border border-clinic-border dark:border-slate-700"
                  @click="confirmAdd=false"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  class="px-3 py-2 rounded-lg text-xs bg-clinic-blue text-white"
                  :disabled="saving"
                  @click="confirmSave"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
