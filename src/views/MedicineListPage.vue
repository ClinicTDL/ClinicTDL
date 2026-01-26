<script setup>
import { onMounted, ref, watch, computed } from 'vue'
import { supabase } from '../supabaseClient'
import { setNotifications, lowStockThreshold } from '../stores/notifications'
import { showToast, showConfirm } from '../stores/ui'

const loading = ref(false)
const medicines = ref([])
const search = ref('')
const unitFilter = ref('')
const units = ref([])

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
  note: ''
})

const loadMedicines = async () => {
  loading.value = true
  try {
    // Select with joins for created_by and updated_by
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
    const lows = (data || []).filter((m) => Number(m?.current_stock || 0) <= Number(lowStockThreshold.value || 10))
    const items = lows.map((m) => ({
      type: 'low_stock',
      text: `${m.sku ? `[${m.sku}] ` : ''}${m.name} เหลือ ${Number(m.current_stock || 0)} ${m.unit || ''}`,
      id: m.id
    }))
    setNotifications(items)
  } catch (err) {
    console.error('Load medicines error', err)
  } finally {
    loading.value = false
  }
}

// Watch search for real-time filtering
watch(search, () => {
  loadMedicines()
})
watch(unitFilter, () => {
  loadMedicines()
})

const driveFolderId = '1B9RM8MuvRKd_AQO-FZ2-9N_crPrfR6P1'
const driveSearchUrl = (name) =>
  `https://drive.google.com/drive/search?q=${encodeURIComponent(name)}`
const thumbSize = 40
const getThumb = (m) => null

const openAddSidebar = () => {
  sidebarMode.value = 'add'
  formData.value = {
    name: '',
    sku: '',
    unit: '',
    quantity: 0,
    note: ''
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
    quantity: 0,
    note: ''
  }
  showSidebar.value = true
}

const closeSidebar = () => {
  showSidebar.value = false
}

const handleSave = async () => {
  try {
    const sessionRaw = localStorage.getItem('clinic_tdl_session')
    const session = sessionRaw ? JSON.parse(sessionRaw) : null

    if (!session || !session.userId) {
      showToast('error', 'กรุณาเข้าสู่ระบบก่อน')
      return
    }

    const userId = session.userId

    if (sidebarMode.value === 'add') {
      if (!formData.value.name || !formData.value.unit || formData.value.quantity < 0) {
        showToast('error', 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน')
        return
      }

      // 1. Insert into medicine_list
      const { data: medData, error: medError } = await supabase
        .from('medicine_list')
        .insert({
          name: formData.value.name,
          sku: formData.value.sku || null,
          unit: formData.value.unit,
          current_stock: formData.value.quantity,
          created_by: userId,
          updated_by: userId,
          created_at: new Date(),
          updated_at: new Date()
        })
        .select()
        .single()

      if (medError) throw medError

      // 2. Insert into stock_transactions
      const { error: transError } = await supabase
        .from('stock_transactions')
        .insert({
          medicine_id: medData.id,
          transaction_type: 'RECEIVE',
          quantity: formData.value.quantity,
          note: 'ยาเข้าใหม่(นำเข้าครั้งแรก)',
          created_by: userId,
          created_at: new Date()
        })

      if (transError) {
        console.error('Transaction log error', transError)
        showToast('error', `บันทึกยาแล้วแต่บันทึกประวัติรับเข้าไม่สำเร็จ: ${transError.message}`)
        // Note: Medicine was created but log failed. Ideally we'd rollback but client-side rollback is complex.
        // For now, we proceed as the primary data is safe.
      }

      showToast('success', 'เพิ่มยาชนิดใหม่สำเร็จ')

    } else if (sidebarMode.value === 'restock') {
      if (formData.value.quantity <= 0) {
        showToast('error', 'กรุณากรอกจำนวนเพิ่มเติมมากกว่า 0')
        return
      }

      const ok = await showConfirm({
        title: 'ยืนยันการเติมสินค้า',
        message: `ยา: ${formData.value.name}\nจำนวน: ${formData.value.quantity} ${formData.value.unit}`,
        type: 'info'
      })
      if (!ok) return

      const newStock = (selectedMedicine.value.current_stock || 0) + formData.value.quantity

      // 1. Update medicine_list
      const { error: updateError } = await supabase
        .from('medicine_list')
        .update({
          current_stock: newStock,
          updated_by: userId,
          updated_at: new Date()
        })
        .eq('id', selectedMedicine.value.id)

      if (updateError) {
        showToast('error', 'ปรับปรุงสต็อกไม่สำเร็จ ยกเลิกรายการ')
        console.error(updateError)
        return // Stop here, do not insert transaction
      }

      // 2. Insert into stock_transactions (Only if update succeeded)
      const { error: transError } = await supabase
        .from('stock_transactions')
        .insert({
          medicine_id: selectedMedicine.value.id,
          transaction_type: 'RECEIVE',
          quantity: formData.value.quantity,
          note: formData.value.note || 'เติมสินค้า',
          created_by: userId,
          created_at: new Date()
        })

      if (transError) {
        console.error('Failed to log transaction', transError)
        showToast('error', `ปรับปรุงสต็อกแล้ว แต่บันทึกประวัติรับเข้าไม่สำเร็จ: ${transError.message}`)
      } else {
        showToast('success', 'เติมสินค้าสำเร็จ')
      }
    }

    closeSidebar()
    loadMedicines()

  } catch (err) {
    console.error('Save error', err)
    showToast('error', 'เกิดข้อผิดพลาด: ' + err.message)
  }
}

onMounted(loadMedicines)
</script>

<template>
  <div class="space-y-4 relative">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
        รายการยา
      </h1>
    </div>

    <!-- Controls -->
    <div class="flex gap-2">
      <!-- Search Input (Real-time) -->
      <input
        v-model="search"
        type="text"
        placeholder="ค้นหา..."
        class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
      />
      <select
        v-model="unitFilter"
        class="rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
        :disabled="loading"
      >
        <option value="">ประเภททั้งหมด</option>
        <option v-for="u in units" :key="u" :value="u">{{ u }}</option>
      </select>
      <!-- Add Button -->

      <button
        type="button"
        class="inline-flex items-center justify-center gap-1 rounded-lg bg-clinic-blue text-white px-3 py-2 text-xs hover:bg-blue-700"
        @click="openAddSidebar"
      >
        <i class="fa-solid fa-plus"></i>
        <span>เพิ่มยาชะนิดใหม่</span>
      </button>
    </div>

    <!-- Table -->
    <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3 overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead>
          <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
            <!-- <th class="py-2 pr-3">Image</th> -->
            <th class="py-2 pr-3">SKU / ชื่อ</th>
            <th class="py-2 pr-3">คงเหลือปัจจุบัน</th>
            <th class="py-2 pr-3">ผู้เพิ่มยาเข้ามา</th>
            <th class="py-2 pr-3">ผู้เติมสินค้าล่าสุด</th>
            <th class="py-2 pr-3">เพิ่มล่าสุด</th>
            <th class="py-2 pr-3 text-right">เติมสินค้า</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in medicines"
            :key="m.id"
            class="border-b border-clinic-border/60 dark:border-slate-800"
          >
            <!-- <td class="py-1.5 pr-3">
              <a
                :href="driveSearchUrl(m.name)"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center"
              >
                <img
                  v-if="getThumb(m)"
                  :src="getThumb(m)"
                  :alt="m.name"
                  class="w-10 h-10 object-cover rounded border border-clinic-border dark:border-slate-700"
                />
                <i v-else class="fa-regular fa-image text-slate-400 text-lg"></i>
              </a>
            </td> -->
            <td class="py-1.5 pr-3 font-medium">
              <span class="text-slate-400 mr-2">{{ m.sku || '-' }}</span>
              {{ m.name }}
            </td>
            <td class="py-1.5 pr-3">
              <span :class="{'text-red-500 font-bold': m.current_stock <= (m.min_stock || 0)}">
                {{ m.current_stock }}
              </span>
              <span class="text-slate-400 ml-1">{{ m.unit }}</span>
            </td>
            <td class="py-1.5 pr-3 text-slate-600 dark:text-slate-400">
              {{ m.creator?.full_name || '-' }}
            </td>
            <td class="py-1.5 pr-3 text-slate-600 dark:text-slate-400">
              {{ m.updater?.full_name || '-' }}
            </td>
            <td class="py-1.5 pr-3 text-slate-600 dark:text-slate-400">
              {{ m.updated_at ? new Date(m.updated_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '-' }}
            </td>
            <td class="py-1.5 pr-3 text-right">
              <button
                @click="openRestockSidebar(m)"
                class="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800 transition-colors"
              >
                <i class="fa-solid fa-box-open text-[10px]"></i>
                เติมสินค้า
              </button>
            </td>
          </tr>
          <tr v-if="loading">
            <td colspan="6" class="py-4 text-center text-slate-400">
              กำลังโหลด...
            </td>
          </tr>
          <tr v-else-if="!medicines.length">
            <td colspan="6" class="py-4 text-center text-slate-400">
              ไม่พบข้อมูลรายการยา
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Right Sidebar (Drawer) -->
    <div
      v-if="showSidebar"
      class="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm transition-opacity"
      @click.self="closeSidebar"
    >
      <div class="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl p-6 flex flex-col animate-slide-in-right">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
            {{ sidebarMode === 'add' ? 'เพิ่มยาเข้าไปใหม่' : 'เติมสินค้า' }}
          </h2>
          <button
            @click="closeSidebar"
            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <i class="fa-solid fa-times text-lg"></i>
          </button>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto">
          <!-- SKU Field -->
          <div>
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              SKU
            </label>
            <input
              v-model="formData.sku"
              type="text"
              :readonly="sidebarMode === 'restock'"
              :class="[
                'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
                sidebarMode === 'restock'
                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                  : 'bg-white dark:bg-slate-800 border-clinic-border dark:border-slate-600 focus:ring-clinic-blue'
              ]"
              placeholder='e.g. "C-GN-GN-911341"'
            />
          </div>
          <!-- Name Field -->
          <div>
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              ชื่อยา
            </label>
            <input
              v-model="formData.name"
              type="text"
              :readonly="sidebarMode === 'restock'"
              :class="[
                'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
                sidebarMode === 'restock'
                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                  : 'bg-white dark:bg-slate-800 border-clinic-border dark:border-slate-600 focus:ring-clinic-blue'
              ]"
              placeholder="กรอกชื่อยา"
            />
          </div>

          <!-- Unit Field -->
          <div v-if="sidebarMode === 'add'">
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              หน่วย (แผง, ซอง, ...)
            </label>
            <input
              v-model="formData.unit"
              type="text"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              placeholder="กรอกข้อมูล"
            />
          </div>

          <!-- Quantity Field -->
          <div>
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {{ sidebarMode === 'add' ? 'จำนวนที่จะนำเข้า' : 'จำนวนที่จะเพิ่ม' }}
            </label>
            <input
              v-model.number="formData.quantity"
              type="number"
              min="1"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            />
            <p v-if="sidebarMode === 'restock'" class="text-xs text-slate-500 mt-1">
              คงเหลือปัจจุบัน: {{ selectedMedicine?.current_stock }} {{ selectedMedicine?.unit }}
            </p>
          </div>

          <!-- Note Field (Restock only or both? User mentioned Note for Restock) -->
          <div v-if="sidebarMode === 'restock'">
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              หมายเหตุ(ถ้ามี)
            </label>
            <textarea
              v-model="formData.note"
              rows="3"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              placeholder="..."
            ></textarea>
          </div>

          <!-- Type Display -->
          <div>
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              ประเภทการนำเข้า
            </label>
            <div class="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-400">
              {{ sidebarMode === 'add' ? 'New Item (เพิ่มเข้ามาใหม่)' : 'Restock (เติมสินค้า)' }}
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="pt-4 mt-4 border-t border-clinic-border dark:border-slate-700 flex gap-3">
          <button
            @click="closeSidebar"
            class="flex-1 px-4 py-2 rounded-lg border border-clinic-border dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            @click="handleSave"
            class="flex-1 px-4 py-2 rounded-lg bg-clinic-blue text-white hover:bg-blue-700 transition-colors"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-slide-in-right {
  animation: slideInRight 0.3s ease-out;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
