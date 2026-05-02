<script setup>
import { onMounted, ref, watch, computed } from 'vue'
import { supabase } from '../../supabaseClient'
import { showToast, showConfirm } from '../../stores/ui'
import { setNotifications, lowStockThreshold } from '../../stores/notifications'

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

const loading = ref(false)

const safeParse = (str) => {
  if (!str) return {}
  try {
    return JSON.parse(str)
  } catch (e) {
    return {}
  }
}

const medicines = ref([])
const search = ref('')
const unitFilter = ref('')
const units = ref([])
const pendingCount = ref(0)
const showPendingModal = ref(false)
const pendingImports = ref([])

// Sidebar State
const showSidebar = ref(false)
const sidebarMode = ref('add') // 'add' | 'restock'
const selectedMedicine = ref(null)

// Form Data
const formData = ref({
  name: '',
  sku: '',
  unit: '',
  quantity: 0,
  category: 'ยาทั่วไป',
  remark: ''
})

const loadMedicines = async () => {
  loading.value = true
  try {
    let query = supabase
      .from('medicine_list')
      .select(`
        *,
        creator:system_users!created_by(full_name),
        updater:system_users!updated_by(full_name)
      `)
      .order('name')

    if (search.value) {
      query = query.ilike('name', `%${search.value}%`)
    }
    if (unitFilter.value) {
      query = query.eq('unit', unitFilter.value)
    }

    const { data, error } = await query
    if (error) throw error
    medicines.value = data || []
    const unitSet = new Set((data || []).map((m) => (m.unit || '').toString().trim()).filter((v) => !!v))
    units.value = Array.from(unitSet).sort()
    
    // Admin notifications: only low stock (exclude medical devices)
    const lows = (data || []).filter((m) =>
      (m?.group || '').toString().trim() !== 'เครื่องมือแพทย์' &&
      Number(m?.current_stock || 0) <= Number(lowStockThreshold.value || 10)
    )
    const items = lows.map((m) => ({
      type: 'low_stock',
      text: `${m.sku ? `[${m.sku}] ` : ''}${m.name} เหลือ ${Number(m.current_stock || 0)} ${m.unit || ''}`,
      id: m.id
    }))
    setNotifications(items)

    await loadPendingCount()
  } catch (err) {
    console.error('Load medicines error', err)
  } finally {
    loading.value = false
  }
}

const loadPendingCount = async () => {
  try {
    const { count, error } = await supabase
      .from('medicine_import_logs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    
    if (!error) pendingCount.value = count || 0
  } catch (e) {}
}

watch([search, unitFilter], () => {
  loadMedicines()
})

const loadPendingImports = async () => {
  try {
    const { data, error } = await supabase
      .from('medicine_import_logs')
      .select(`
        *,
        medicine:medicine_list(name, sku, unit),
        requester:system_users!created_by(full_name)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    pendingImports.value = data || []
  } catch (e) {}
}

const openPending = async () => {
  await loadPendingImports()
  showPendingModal.value = true
}

const openAddSidebar = () => {
  sidebarMode.value = 'add'
  formData.value = {
    name: '',
    sku: '',
    unit: '',
    quantity: 1,
    category: 'ยาทั่วไป',
    remark: ''
  }
  selectedMedicine.value = null
  showSidebar.value = true
}

const openRestockSidebar = (medicine) => {
  sidebarMode.value = 'restock'
  selectedMedicine.value = medicine
  formData.value = {
    name: medicine.name,
    sku: medicine.sku || '',
    unit: medicine.unit,
    quantity: 1,
    category: medicine.group || 'ยาทั่วไป',
    remark: ''
  }
  showSidebar.value = true
}

const closeSidebar = () => {
  showSidebar.value = false
}

const handleSaveRequest = async () => {
  try {
    if (!session || !session.userId) {
      showToast('error', 'กรุณาเข้าสู่ระบบก่อน')
      return
    }

    if (sidebarMode.value === 'add') {
      if (!formData.value.name || !formData.value.unit || formData.value.quantity <= 0) {
        showToast('error', 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน')
        return
      }
    } else {
      if (formData.value.quantity <= 0) {
        showToast('error', 'กรุณากรอกจำนวนมากกว่า 0')
        return
      }
    }

    loading.value = true
    
    // 2. Insert into medicine_import_logs
    const logData = {
      medicine_id: selectedMedicine.value?.id || null,
      quantity: formData.value.quantity,
      category: formData.value.category,
      note_transaction: sidebarMode.value === 'add' ? 'ยาเข้าใหม่(นำเข้าครั้งแรก)' : 'เติมสินค้า',
      remark: formData.value.remark,
      // Store temporary medicine info in 'note' column as JSON for new items
      note: sidebarMode.value === 'add' ? JSON.stringify({
        name: formData.value.name,
        sku: formData.value.sku,
        unit: formData.value.unit
      }) : null,
      status: 'pending',
      created_by: session.userId,
      created_at: new Date()
    }

    const { error } = await supabase
      .from('medicine_import_logs')
      .insert(logData)

    if (error) throw error

    showToast('success', 'เพิ่มสำเร็จ รอการตรวจสอบจากแพทย์')
    closeSidebar()
    loadPendingCount()
  } catch (err) {
    console.error('Save request error', err)
    showToast('error', 'เกิดข้อผิดพลาด: ' + err.message)
  } finally {
    loading.value = false
  }
}

onMounted(loadMedicines)
</script>

<template>
  <div class="space-y-4 relative">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
        จัดการรายการยา
      </h1>
      <div class="flex items-center gap-2">
        <router-link
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-medium hover:bg-blue-200 dark:hover:text-blue-700 cursor-pointer transition-all"
          :to="{ name: 'admin-approve-history' }"
        >
          <i class="fa-solid fa-list"></i>
          <span>รายการเติมสินค้า</span>
        </router-link>
        <button
          type="button"
          @click="openPending"
          class="relative inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-xs font-medium hover:bg-amber-200 dark:hover:text-amber-700 cursor-pointer transition-all"
        >
          <i class="fa-solid fa-clock-rotate-left"></i>
          <span>รายการที่รอการยืนยัน</span>
          <span v-if="pendingCount > 0" class="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold ring-2 ring-white dark:ring-slate-900">
            {{ pendingCount }}
          </span>
        </button>
      </div>
    </div>

    <!-- Controls -->
    <div class="flex gap-2">
      <input
        v-model="search"
        type="text"
        placeholder="ค้นหา..."
        class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
      />
      <select
        v-model="unitFilter"
        class="rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
      >
        <option value="">ประเภททั้งหมด</option>
        <option v-for="u in units" :key="u" :value="u">{{ u }}</option>
      </select>

      <button
        type="button"
        class="inline-flex items-center justify-center gap-1 rounded-lg bg-clinic-blue text-white px-3 py-2 text-xs hover:bg-blue-700"
        @click="openAddSidebar"
      >
        <i class="fa-solid fa-plus"></i>
        <span>เพิ่มยาชนิดใหม่</span>
      </button>
    </div>

    <!-- Table -->
    <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3 overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead>
          <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
            <th class="py-2 pr-3">SKU</th>
            <th class="py-2 pr-3">ชื่อ</th>
            <th class="py-2 pr-3">ประเภท</th>
            <th class="py-2 pr-3">คงเหลือปัจจุบัน</th>
            <th class="py-2 pr-3">ผู้เพิ่ม</th>
            <th class="py-2 pr-3">ผู้เติมสินค้าล่าสุด</th>
            <th class="py-2 pr-3">เพิ่มล่าสุด</th>
            <th class="py-2 pr-3 text-right">ดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in medicines"
            :key="m.id"
            class="border-b border-clinic-border/60 dark:border-slate-800"
          >
            <td class="py-1.5 pr-3 font-medium text-slate-400">
              {{ m.sku || '-' }}
            </td>
            <td class="py-1.5 pr-3 font-medium">
              {{ m.name }}
            </td>
            <td class="py-1.5 pr-3">
              {{ m.group || '-' }}
            </td>
            <td class="py-1.5 pr-3">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {{ m.current_stock }} {{ m.unit }}
              </span>
            </td>
            <td class="py-1.5 pr-3 text-slate-500">
              {{ m.creator?.full_name || '-' }}
            </td>
            <td class="py-1.5 pr-3 text-slate-500">
              {{ m.updater?.full_name || '-' }}
            </td>
            <td class="py-1.5 pr-3 text-slate-500">
              {{ m.updated_at ? new Date(m.updated_at).toLocaleDateString('en-UK') : '-' }}
            </td>
            <td class="py-1.5 pr-3 text-right">
              <button
                @click="openRestockSidebar(m)"
                class="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800"
              >
                <i class="fa-solid fa-box-open text-[10px]"></i>
                เติมสต็อก
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Sidebar -->
    <div v-if="showSidebar" class="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" @click.self="closeSidebar">
      <div class="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl p-6 flex flex-col">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold">{{ sidebarMode === 'add' ? 'เพิ่มยาใหม่' : 'เติมสต็อก' }}</h2>
          <button @click="closeSidebar" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-times text-lg"></i></button>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto">
          <div>
            <label class="block text-xs font-medium mb-1">SKU</label>
            <input v-model="formData.sku" placeholder="เช่น CN-9..." type="text" :readonly="sidebarMode === 'restock'" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 p-2 text-sm dark:bg-slate-800" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">ชื่อยา</label>
            <input v-model="formData.name" placeholder="เช่น Paracetamol..." type="text" :readonly="sidebarMode === 'restock'" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 p-2 text-sm dark:bg-slate-800" />
          </div>
          <div v-if="sidebarMode === 'add'">
            <label class="block text-xs font-medium mb-1">หน่วย</label>
            <select
              v-model="formData.unit"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 p-2 text-sm dark:bg-slate-800"
            >
              <option value="">-- เลือกหน่วย --</option>
              <option value="แผง">แผง</option>
              <option value="เม็ด">เม็ด</option>
              <option value="ซอง">ซอง</option>
              <option value="หลอด">หลอด</option>
              <option value="ถุง">ถุง</option>
              <option value="ขวด">ขวด</option>
              <option value="คู่">คู่</option>
              <option value="ดวง">ดวง</option>
              <option value="อัน">อัน</option>
              <option value="กล่อง">กล่อง</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">หมวดหมู่</label>
            <select v-model="formData.category" :disabled="sidebarMode === 'restock'" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 p-2 text-sm dark:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed">
              <option value="ยาทั่วไป">ยาทั่วไป</option>
              <option value="เครื่องมือแพทย์">เครื่องมือแพทย์</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">จำนวน</label>
            <input v-model.number="formData.quantity" type="number" min="1" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 p-2 text-sm dark:bg-slate-800" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">เหตุผล/หมายเหตุ</label>
            <textarea v-model="formData.remark" rows="3" placeholder="ระบุเหตุผล (ถ้ามี)..." class="w-full rounded-lg border border-clinic-border dark:border-slate-600 p-2 text-sm dark:bg-slate-800"></textarea>
          </div>
        </div>

        <div class="pt-4 mt-4 border-t border-clinic-border dark:border-slate-600 flex gap-3">
          <button @click="closeSidebar" class="flex-1 p-2 rounded-lg border border-clinic-border dark:border-slate-600">ยกเลิก</button>
          <button @click="handleSaveRequest" :disabled="loading" class="flex-1 p-2 rounded-lg bg-clinic-blue text-white disabled:opacity-50">
            {{ loading ? 'กำลังบันทึก...' : 'ส่งคำขออนุมัติ' }}
          </button>
        </div>
      </div>
    </div>
  </div>
    <div v-if="showPendingModal" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" @click.self="showPendingModal=false">
      <div class="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        <div class="p-4 border-b flex items-center justify-between">
          <div class="font-bold text-lg">รายการรอการยืนยัน</div>
          <button @click="showPendingModal=false" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-times"></i></button>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <table class="min-w-full text-xs">
            <thead>
              <tr class="text-left text-slate-500 border-b">
                <th class="pb-3 text-center">วันที่แจ้ง</th>
                <th class="pb-3 text-center">รายการ</th>
                <th class="pb-3 text-center">จำนวน</th>
                <th class="pb-3 text-center">ประเภท</th>
                <th class="pb-3 text-center">สถานะ</th>
                <th class="pb-3 text-center">เหตุผล</th>
                <th class="pb-3 text-center">ผู้แจ้ง</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="item in pendingImports" :key="item.id">
                <td class="py-3 text-center">{{ new Date(item.created_at).toLocaleString('th-TH') }}</td>
                <td class="py-3 text-center">
                  <div class="font-medium text-slate-900 dark:text-white">
                    {{ item.medicine?.name || (safeParse(item.note)?.name || '-') }}
                  </div>
                  <div class="text-[10px] text-slate-400">
                    {{ item.medicine?.sku || (safeParse(item.note)?.sku || '-') }}
                  </div>
                </td>
                <td class="py-3 text-center">
                  <span class="font-bold text-clinic-blue">+{{ item.quantity }}</span>
                  <span class="ml-1 text-slate-400">{{ item.medicine?.unit || (safeParse(item.note)?.unit || '') }}</span>
                </td>
                <td class="py-3 text-center">
                  <span :class="item.medicine_id ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'" class="px-2 py-0.5 rounded-full text-[10px]">
                    {{ item.medicine_id ? 'เติมสต็อก' : 'ยาใหม่' }}
                  </span>
                </td>
                <td class="py-3 text-center">
                  <span :class="{
                    'text-amber-600': item.status==='pending',
                    'text-emerald-600 dark:text-emerald-400': item.status==='approved',
                    'text-red-600': item.status==='rejected'
                  }">{{ item.status==='pending' ? 'รอการอนุมัติ' : (item.status==='approved' ? 'อนุมัติแล้ว' : (item.status==='rejected' ? 'ปฏิเสธแล้ว' : item.status)) }}</span>
                </td>
                <td class="py-3 text-center text-slate-500">{{ item.remark || '-' }}</td>
                <td class="py-3 text-center text-slate-500">{{ item.requester?.full_name || '-' }}</td>
              </tr>
              <tr v-if="!pendingImports.length">
                <td colspan="6" class="py-8 text-center text-slate-400">ไม่มีรายการรอตรวจสอบ</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
</template>
