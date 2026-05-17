<script setup>
import { onMounted, ref, watch, computed } from 'vue'
import { supabase, supabaseStorage, DOCUMENT_BUCKET, STORAGE_BUCKET } from '../supabaseClient'
import { setNotifications, lowStockThreshold } from '../stores/notifications'
import { showToast, showConfirm } from '../stores/ui'

const getCookie = (name) => {
  const v = document.cookie.split('; ').find((row) => row.startsWith(name + '='))
  return v ? v.split('=')[1] : ''
}

const calculateTimeRemaining = (expDateStr) => {
  if (!expDateStr) return null
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expDate = new Date(expDateStr)
  expDate.setHours(0, 0, 0, 0)
  
  const diffTime = expDate - today
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays < 0) return { text: 'หมดอายุแล้ว', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20', days: diffDays }
  
  const years = Math.floor(diffDays / 365)
  const remainingDays = diffDays % 365
  const months = Math.floor(remainingDays / 30)
  const days = remainingDays % 30
  
  let text = ''
  if (years > 0) text += `${years} ปี `
  if (months > 0) text += `${months} เดือน `
  if (days > 0) text += `${days} วัน`
  
  let color, bgColor
  if (diffDays <= 60) {
    color = 'text-red-600 dark:text-red-400'
    bgColor = 'bg-red-50 dark:bg-red-900/20'
  } else if (diffDays <= 180) {
    color = 'text-orange-600 dark:text-orange-400'
    bgColor = 'bg-orange-50 dark:bg-orange-900/20'
  } else if (diffDays <= 365) {
    color = 'text-yellow-600 dark:text-yellow-400'
    bgColor = 'bg-yellow-50 dark:bg-yellow-900/20'
  } else {
    color = 'text-emerald-600 dark:text-emerald-400'
    bgColor = 'bg-emerald-50 dark:bg-emerald-900/20'
  }
  
  return { text: text.trim() || `${diffDays} วัน`, color, bgColor, days: diffDays }
}

const isExpiringSoon = (expDateStr) => {
  if (!expDateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expDate = new Date(expDateStr)
  expDate.setHours(0, 0, 0, 0)
  const diffTime = expDate - today
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays >= 0 && diffDays <= 60
}
let session = null
try {
  const raw = getCookie('clinic_tdl_session') || localStorage.getItem('clinic_tdl_session')
  session = raw ? JSON.parse(decodeURIComponent(raw)) : null
} catch {
  session = null
}
const isAdmin = computed(() => session?.status === 'admin')

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
const groupFilter = ref('')
const groups = ref([])

// Approval System State
const showPendingModal = ref(false)
const pendingImports = ref([])
const pendingCount = ref(0)
const showApprovalSidebar = ref(false)
const selectedImport = ref(null)
const showExportModal = ref(false)
const exportingExcel = ref(false)

// Action State
const actionStatus = ref('') // 'approving' | 'rejecting'
const rejectionNote = ref('')
const selectedFile = ref(null)
const photoPreview = ref(null)
const fileInput = ref(null)
const docBucketAvailable = ref(localStorage.getItem('doc_bucket_missing') ? false : true)

const showEditSidebar = ref(false)
const editForm = ref({
  id: '',
  sku: '',
  name: '',
  unit: '',
  current_stock: 0,
  group: '',
  indication: '',
  side_effect: '',
  mfg_date: '',
  exp_date: '',
})

const openEditSidebar = (m) => {
  editForm.value = {
    id: m.id,
    sku: m.sku || '',
    name: m.name || '',
    unit: m.unit || '',
    current_stock: m.current_stock || 0,
    group: m.group || '',
    indication: m.indication || '',
    side_effect: m.side_effect || '',
    mfg_date: m.mfg_date || '',
    exp_date: m.exp_date || '',
  }
  showEditSidebar.value = true
}

const closeEditSidebar = () => {
  showEditSidebar.value = false
}

const saveEdit = async () => {
  if (isAdmin.value) {
    showToast('error', 'เฉพาะแพทย์เท่านั้นที่แก้ไขข้อมูลนี้ได้')
    return
  }
  if (!editForm.value.id) return
  loading.value = true
  try {
    const { error } = await supabase
      .from('medicine_list')
      .update({
        indication: editForm.value.indication || null,
        side_effect: editForm.value.side_effect || null,
        mfg_date: editForm.value.mfg_date || null,
        exp_date: editForm.value.exp_date || null,
        updated_by: session.userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', editForm.value.id)
    if (error) throw error
    showToast('success', 'บันทึกข้อมูลสำเร็จ')
    showEditSidebar.value = false
    loadMedicines()
  } catch (e) {
    console.error('Update medicine error', e)
    showToast('error', 'บันทึกไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

const ensureXlsx = async () => {
  if (window.XLSX) return window.XLSX
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js'
    s.onload = () => resolve(window.XLSX)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

const openExportModal = () => {
  showExportModal.value = true
}

const closeExportModal = () => {
  if (exportingExcel.value) return
  showExportModal.value = false
}

const exportMedicineExcel = async (type) => {
  const exportConfig = {
    general: {
      label: 'ยาทั่วไป',
      fileSuffix: 'general_medicines',
      group: 'ยาทั่วไป',
    },
    device: {
      label: 'เครื่องมือแพทย์',
      fileSuffix: 'medical_devices',
      group: 'เครื่องมือแพทย์',
    },
    all: {
      label: 'ทั้งหมด',
      fileSuffix: 'all_items',
      group: '',
    },
  }[type]

  if (!exportConfig) return

  exportingExcel.value = true
  try {
    const XLSX = await ensureXlsx()

    let query = supabase
      .from('medicine_list')
      .select('sku, name, current_stock, unit, group, indication, side_effect')
      .order('name', { ascending: true })

    if (exportConfig.group) {
      query = query.eq('group', exportConfig.group)
    }

    const { data, error } = await query
    if (error) throw error

    const rows = data || []
    if (!rows.length) {
      showToast('error', `ไม่พบข้อมูลสำหรับส่งออกประเภท${exportConfig.label}`)
      return
    }

    const headerRow = [
      'No',
      'เลข SKU',
      'ชื่อยา',
      'จำนวนคงเหลือปัจจุบัน',
      'หน่วย (unit)',
      'ประเภท',
      'สรรพคุณ',
      'ผลข้างเคียง',
    ]

    const dataRows = rows.map((item, index) => ([
      index + 1,
      item.sku || '-',
      item.name || '-',
      Number(item.current_stock || 0),
      item.unit || '-',
      item.group || '-',
      item.indication || '-',
      item.side_effect || '-',
    ]))

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])
    ws['!cols'] = [
      { wch: 8 },
      { wch: 18 },
      { wch: 32 },
      { wch: 18 },
      { wch: 14 },
      { wch: 18 },
      { wch: 36 },
      { wch: 36 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Medicine List')

    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    XLSX.writeFile(wb, `medicine_list_${exportConfig.fileSuffix}_${yyyy}${mm}${dd}.xlsx`)

    showExportModal.value = false
    showToast('success', `ส่งออกข้อมูล${exportConfig.label}สำเร็จ`)
  } catch (err) {
    console.error('Export medicine excel error', err)
    showToast('error', 'เกิดข้อผิดพลาดในการส่งออก Excel')
  } finally {
    exportingExcel.value = false
  }
}

const loadMedicines = async () => {
  loading.value = true
  try {
    // --- Base data for filters and notifications ---
    const { data: allData, error: allError } = await supabase
      .from('medicine_list')
      .select('id, sku, name, unit, group, current_stock, mfg_date, exp_date')
    if (allError) throw allError

    const unitSet = new Set((allData || []).map((m) => (m.unit || '').toString().trim()).filter((v) => !!v))
    units.value = Array.from(unitSet).sort()
    const groupSet = new Set((allData || []).map((m) => (m.group || '').toString().trim()).filter((v) => !!v))
    groups.value = Array.from(groupSet).sort()
    
    const lows = (allData || []).filter((m) =>
      (m?.group || '').toString().trim() !== 'เครื่องมือแพทย์' &&
      Number(m?.current_stock || 0) <= Number(lowStockThreshold.value || 10)
    )
    const items = [
      ...lows.map(m => ({
        type: 'low_stock',
        text: `${m.sku ? `` : ''}${m.name} เหลือ ${Number(m.current_stock || 0)} ${m.unit || ''}`,
        id: m.id
      })),
      ...(allData || []).filter(m => isExpiringSoon(m.exp_date)).map(m => ({
        type: 'expiring',
        text: `${m.sku ? `` : ''}${m.name} จะหมดอายุในอีก ${calculateTimeRemaining(m.exp_date)?.text || 'ไม่กี่วัน'}`,
        id: `${m.id}-expiring`
      }))
    ]
    try {
      const { count: pendCount } = await supabase
        .from('medicine_import_logs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      if ((pendCount || 0) > 0) {
        items.unshift({
          type: 'pending_imports',
          text: `มีรายการที่รอการยืนยัน ${pendCount} รายการ — ไปที่ "รายการยา" เพื่อยืนยันสต๊อกจากฝ่ายจัดซื้อ`,
          id: 'pending_imports'
        })
      }
    } catch {}
    setNotifications(items)

    // --- Filtered data for table display ---
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
    if (groupFilter.value) {
      query = query.eq('group', groupFilter.value)
    }

    const { data, error } = await query
    if (error) throw error
    medicines.value = data || []

    await loadPendingImports()
  } catch (err) {
    console.error('Load medicines error', err)
  } finally {
    loading.value = false
  }
}

const loadPendingImports = async () => {
  try {
    const { data, error } = await supabase
      .from('medicine_import_logs')
      .select(`
        *,
        medicine:medicine_list(name, sku, unit, current_stock),
        requester:system_users!created_by(full_name)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    // Parse temporary info from 'note' if it's a new item
    pendingImports.value = (data || []).map(item => {
      if (!item.medicine_id && item.note) {
        const tempInfo = safeParse(item.note)
        if (tempInfo.name) {
          return {
            ...item,
            tempInfo
          }
        }
      }
      return item
    })
    
    pendingCount.value = pendingImports.value.length
  } catch (err) {
    console.error('Load pending error', err)
  }
}

const openPendingModal = () => {
  showPendingModal.value = true
}

const openApprovalSidebar = (item) => {
  selectedImport.value = item
  actionStatus.value = ''
  rejectionNote.value = ''
  selectedFile.value = null
  photoPreview.value = null
  showApprovalSidebar.value = true
}

const handleFileChange = (e) => {
  const file = e.target.files[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showToast('error', 'กรุณาเลือกไฟล์รูปภาพเท่านั้น')
    return
  }
  selectedFile.value = file
  const reader = new FileReader()
  reader.onload = (e) => photoPreview.value = e.target.result
  reader.readAsDataURL(file)
}

const compressImage = async (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        const max = 1200
        if (width > height && width > max) {
          height *= max / width
          width = max
        } else if (height > max) {
          width *= max / height
          height = max
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

const processApproval = async () => {
  if (!selectedFile.value) {
    showToast('error', 'กรุณาแนบรูปภาพเอกสารยืนยัน')
    return
  }

  loading.value = true
  try {
    // 1. Compress and Upload Image
    const blob = await compressImage(selectedFile.value)
    const fileName = `import-${selectedImport.value.id}.jpg`

    // ใช้ Storage ของโปรเจ็ก DB สำหรับ document_images
    const dbStorage = supabase.storage
    const patientsStorage = (supabaseStorage ?? supabase).storage

    // พยายามอัปโหลดเข้า document_images ในโปรเจ็ก DB ก่อน
    let bucketName = DOCUMENT_BUCKET
    let storageClient = dbStorage
    let { data: uploadData, error: uploadError } = await storageClient
      .from(bucketName)
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true })

    // Fallback: ถ้าไม่พบ bucket เอกสาร ให้ไปเก็บที่ patient-photos (โปรเจ็ก patients)
    if (uploadError && /Bucket not found/i.test(uploadError.message || '')) {
      storageClient = patientsStorage
      bucketName = STORAGE_BUCKET
      const retry = await storageClient.from(bucketName).upload(fileName, blob, { contentType: 'image/jpeg', upsert: true })
      uploadData = retry.data
      uploadError = retry.error
    }
    if (uploadError) throw uploadError

    const { data: pubUrl } = storageClient.from(bucketName).getPublicUrl(fileName)
    const docUrl = pubUrl?.publicUrl || ''

    // 2. Update medicine_list and insert stock_transactions
    if (selectedImport.value.medicine_id) {
      // RESTOCK
      const newStock = (selectedImport.value.medicine?.current_stock || 0) + selectedImport.value.quantity
      const { error: updateError } = await supabase
        .from('medicine_list')
        .update({
          current_stock: newStock,
          updated_by: session.userId,
          updated_at: new Date()
        })
        .eq('id', selectedImport.value.medicine_id)
      
      if (updateError) throw updateError
    } else {
      // NEW ITEM
      const tempInfo = selectedImport.value.tempInfo || {}
      const { data: newMed, error: createError } = await supabase
        .from('medicine_list')
        .insert({
          name: tempInfo.name,
          sku: tempInfo.sku,
          unit: tempInfo.unit,
          group: selectedImport.value.category || 'ยาทั่วไป',
          current_stock: selectedImport.value.quantity,
          created_by: selectedImport.value.created_by,
          updated_by: session.userId
        })
        .select()
        .single()
      
      if (createError) throw createError
      selectedImport.value.medicine_id = newMed.id
    }

    // 3. Stock Transaction
    const { error: transError } = await supabase
      .from('stock_transactions')
      .insert({
        medicine_id: selectedImport.value.medicine_id,
        transaction_type: 'RECEIVE',
        quantity: selectedImport.value.quantity,
        note: selectedImport.value.note_transaction,
        created_by: session.userId
      })
    
    if (transError) throw transError

    // 4. Update Import Log
    const { error: logUpdateError } = await supabase
      .from('medicine_import_logs')
      .update({
        status: 'approved',
        approved_by: session.userId,
        document_url: docUrl,
        updated_at: new Date()
      })
      .eq('id', selectedImport.value.id)
    
    if (logUpdateError) throw logUpdateError

    showToast('success', 'อนุมัติและอัปเดตสต็อกเรียบร้อยแล้ว')
    showApprovalSidebar.value = false
    loadMedicines()
  } catch (err) {
    console.error('Approval error', err)
    showToast('error', 'เกิดข้อผิดพลาด: ' + err.message)
  } finally {
    loading.value = false
  }
}

const processRejection = async () => {
  if (!rejectionNote.value) {
    showToast('error', 'กรุณาระบุเหตุผลที่ปฏิเสธ')
    return
  }

  loading.value = true
  try {
    const { error } = await supabase
      .from('medicine_import_logs')
      .update({
        status: 'rejected',
        remark: rejectionNote.value,
        updated_at: new Date()
      })
      .eq('id', selectedImport.value.id)
    
    if (error) throw error
    showToast('success', 'ปฏิเสธรายการเรียบร้อยแล้ว')
    showApprovalSidebar.value = false
    loadMedicines()
  } catch (err) {
    showToast('error', 'เกิดข้อผิดพลาด: ' + err.message)
  } finally {
    loading.value = false
  }
}

watch([search, unitFilter, groupFilter], () => {
  loadMedicines()
})

onMounted(loadMedicines)
</script>

<template>
  <div class="space-y-4 relative">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-white">รายการยา</h1>
      <div class="flex items-center gap-2">
        <router-link
          :to="{ name: 'approve-history' }"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-medium hover:bg-blue-200 dark:hover:text-blue-700 cursor-pointer transition-all"
        >
          <i class="fa-solid fa-list"></i>
          <span>รายการเติมสินค้า</span>
        </router-link>
        <button
          @click="openPendingModal"
          class="relative inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-xs font-medium hover:bg-amber-200 dark:hover:text-amber-700 cursor-pointer transition-all"
        >
          <i class="fa-solid fa-bell"></i>
          <span>รายการที่รอการยืนยัน</span>
          <span v-if="pendingCount > 0" class="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold ring-2 ring-white dark:ring-slate-900">
            {{ pendingCount }}
          </span>
        </button>
      </div>
    </div>

    <!-- Controls -->
    <div class="flex flex-wrap gap-2">
      <input v-model="search" type="text" placeholder="ค้นหา..." class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs" />
      <select v-model="unitFilter" class="rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
        <option value="">ประเภททั้งหมด</option>
        <option v-for="u in units" :key="u" :value="u">{{ u }}</option>
      </select>
      <select v-model="groupFilter" class="rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
        <option value="">กลุ่มทั้งหมด</option>
        <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
      </select>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        :disabled="exportingExcel"
        @click="openExportModal"
      >
        <i class="fa-solid fa-file-excel"></i>
        <span>{{ exportingExcel ? 'กำลังส่งออก...' : 'ส่งออก Excel' }}</span>
      </button>
    </div>

    <!-- Table -->
    <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3 overflow-x-auto">
      <div class="flex items-center justify-between mb-2">
        <div class="text-xs text-slate-600 dark:text-slate-300">
          ทั้งหมด {{ medicines.length }} รายการ
        </div>
      </div>
      <table class="min-w-full text-xs">
        <thead>
          <tr class="text-left text-slate-500 dark:text-slate-400 border-b border-clinic-border dark:border-slate-700">
            <!-- <th class="py-2 pr-3">SKU</th> -->
            <th class="py-2 pr-3">ชื่อ</th>
            <th class="py-2 pr-3">คงเหลือปัจจุบัน</th>
            <th class="py-2 pr-3">ประเภท</th>
            <th class="py-2 pr-3">วันผลิต-วันหมดอายุ</th>
            <!-- <th class="py-2 pr-3">วันหมดอายุ</th> -->
            <th class="py-2 pr-3">เหลือเวลา</th>
            <th class="py-2 pr-3">สรรพคุณ</th>
            <th class="py-2 pr-3">ผลข้างเคียง</th>
            <th class="py-2 pr-3">ผู้เพิ่ม</th>
            <th class="py-2 pr-3">ผู้เติมสินค้า</th>
            <th class="py-2 pr-3">อัปเดตล่าสุด</th>
            <th class="py-2 pr-3 text-right" v-if="!isAdmin">แก้ไข</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="13" class="py-8 text-center">
              <div class="flex flex-col items-center gap-2">
                <i class="fa-solid fa-circle-notch fa-spin text-2xl text-clinic-blue dark:text-blue-200"></i>
                <span class="text-slate-500 animate-pulse">กำลังโหลดข้อมูล...</span>
              </div>
            </td>
          </tr>
          <tr v-else v-for="m in medicines" :key="m.id" class="border-b border-clinic-border/60 dark:border-slate-800">
            <!-- <td class="py-1.5 pr-3 text-slate-400">{{ m.sku || '-' }}</td> -->
            <td class="py-1.5 pr-3 font-medium">
              <div class="font-medium text-slate-900 dark:text-slate-100">
                {{ m.name || '-'}}
              </div>
              <div class="text-[10px] text-slate-400">
                [ {{ m.sku || '-' }} ]
              </div>
            </td>
            <td class="py-1.5 pr-3">
              <span class="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                {{ m.current_stock }} {{ m.unit }}
              </span>
            </td>
            <td class="py-1.5 pr-3 text-slate-500 dark:text-slate-300">{{ m.group || '-' }}</td>
            <td class="py-1.5 pr-3 text-slate-500 dark:text-slate-300">
              {{ m.mfg_date ? new Date(m.mfg_date).toLocaleDateString('en-UK', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '' }} - 
              {{ m.exp_date ? new Date(m.exp_date).toLocaleDateString('en-UK', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '' }}
            </td>
            <!-- <td class="py-1.5 pr-3 text-slate-500 dark:text-slate-300">{{ m.exp_date ? new Date(m.exp_date).toLocaleDateString('en-UK') : '-' }}</td> -->
            <td class="py-1.5 pr-3">
              <span v-if="calculateTimeRemaining(m.exp_date)" :class="['px-2 py-0.5 rounded-full text-xs font-medium', calculateTimeRemaining(m.exp_date).bgColor, calculateTimeRemaining(m.exp_date).color]">
                {{ calculateTimeRemaining(m.exp_date).text }}
              </span>
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="py-1.5 pr-3 text-slate-500 dark:text-slate-300">{{ m.indication || '-' }}</td>
            <td class="py-1.5 pr-3 text-slate-500 dark:text-slate-300">{{ m.side_effect || '-' }}</td>
            <td class="py-1.5 pr-3 text-slate-500 dark:text-slate-300">{{ m.creator?.full_name || '-' }}</td>
            <td class="py-1.5 pr-3 text-slate-500 dark:text-slate-300">{{ m.updater?.full_name || '-' }}</td>
            <td class="py-1.5 pr-3 text-slate-500 dark:text-slate-300">{{ m.updated_at ? new Date(m.updated_at).toLocaleString('en-UK') : '-' }}</td>
            <td class="py-1.5 pr-3 text-right" v-if="!isAdmin">
              <button
                @click="openEditSidebar(m)"
                class="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
              >
                <i class="fa-solid fa-pen-to-square text-[10px]"></i>
                แก้ไข
              </button>
            </td>
          </tr>
          <tr v-if="!loading && !medicines.length">
            <td colspan="13" class="py-8 text-center text-slate-400">
              ไม่พบรายการยาในคลัง
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Export Modal -->
    <div v-if="showExportModal" class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" @click.self="closeExportModal">
      <div class="w-full max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900 overflow-hidden border-1 border-slate-300 dark:border-slate-700 rounded-xl">
        <div class="flex items-center justify-between border-b border-clinic-border dark:border-slate-700 p-4">
          <div>
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">ส่งออกข้อมูลรายการยา</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">เลือกประเภทข้อมูลที่ต้องการส่งออกเป็นไฟล์ Excel</p>
          </div>
          <button @click="closeExportModal" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" :disabled="exportingExcel">
            <i class="fa-solid fa-times"></i>
          </button>
        </div>

        <div class="grid gap-3 p-4 md:grid-cols-3">
          <button
            type="button"
            class="rounded-xl border border-clinic-border dark:border-slate-700 p-4 text-left transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-800 disabled:opacity-50"
            :disabled="exportingExcel"
            @click="exportMedicineExcel('general')"
          >
            <div class="text-sm font-semibold text-slate-900 dark:text-white">ยาทั้งหมด</div>
            <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">ส่งออกเฉพาะรายการที่เป็นประเภท ยาทั่วไป</div>
          </button>

          <button
            type="button"
            class="rounded-xl border border-clinic-border dark:border-slate-700 p-4 text-left transition-colors hover:bg-amber-50 dark:hover:bg-amber-800 disabled:opacity-50"
            :disabled="exportingExcel"
            @click="exportMedicineExcel('device')"
          >
            <div class="text-sm font-semibold text-slate-900 dark:text-white">เครื่องมือแพทย์</div>
            <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">ส่งออกเฉพาะรายการที่เป็นประเภท เครื่องมือแพทย์</div>
          </button>

          <button
            type="button"
            class="rounded-xl border border-clinic-border dark:border-slate-700 p-4 text-left transition-colors hover:bg-teal-50 dark:hover:bg-teal-800 disabled:opacity-50"
            :disabled="exportingExcel"
            @click="exportMedicineExcel('all')"
          >
            <div class="text-sm font-semibold text-slate-900 dark:text-white">ทั้งหมด</div>
            <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">ส่งออกข้อมูลทุกรายการทั้งยาและเครื่องมือแพทย์</div>
          </button>
        </div>

        <div class="flex justify-end gap-2 p-4">
          <button
            type="button"
            class="rounded-lg border border-clinic-border dark:border-slate-600 px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            :disabled="exportingExcel"
            @click="closeExportModal"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>

    <!-- Pending List Modal -->
    <div v-if="showPendingModal" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" @click.self="showPendingModal = false">
      <div class="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        <div class="p-4 border-b border-clinic-border dark:border-slate-700 flex items-center justify-between">
          <h2 class="font-bold text-lg">รายการรอการตรวจสอบ</h2>
          <button @click="showPendingModal = false" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-times"></i></button>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <table class="min-w-full text-xs">
            <thead>
              <tr class="text-left text-slate-500 border-b">
                <th class="pb-2 text-slate-500 text-[12px]">วันที่แจ้ง</th>
                <th class="pb-2 text-slate-500 text-[12px]">รายการ</th>
                <th class="pb-2 text-slate-500 text-[12px]">จำนวน</th>
                <th class="pb-2 text-slate-500 text-[12px]">ประเภท</th>
                <th class="pb-2 text-slate-500 text-[12px]">เหตุผล</th>
                <th class="pb-2 text-slate-500 text-[12px]">ผู้แจ้ง</th>
                <th class="pb-2 text-slate-500 text-[12px] text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-if="loading">
                <td colspan="10" class="py-8 text-center">
                  <div class="flex flex-col items-center gap-2">
                    <i class="fa-solid fa-circle-notch fa-spin text-2xl text-clinic-blue dark:text-blue-200"></i>
                    <span class="text-slate-500 animate-pulse">กำลังโหลดข้อมูล...</span>
                  </div>
                </td>
              </tr>
              <tr v-else v-for="item in pendingImports" :key="item.id">
                <td class="py-3 text-slate-600 dark:text-slate-300 text-[12px]">{{ new Date(item.created_at).toLocaleString('th-TH') }}</td>
                <td class="py-3">
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
                <td class="py-3">
                  <span :class="item.medicine_id ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'" class="px-2 py-0.5 rounded-full text-[12px]">
                    {{ item.medicine_id ? 'เติมสต็อก' : 'ยาใหม่' }}
                  </span>
                </td>
                <td class="py-3 text-slate-500 text-[12px]">{{ item.remark || '-' }}</td>
                <td class="py-3 text-slate-600 dark:text-slate-300 text-[12px]">{{ item.requester?.full_name || '-' }}</td>
                <td class="py-3 text-right">
                  <button @click="openApprovalSidebar(item)" class="text-amber-600 dark:text-amber-400 hover:underline font-medium text-[12px]">กดเพื่ออนุมัติ</button>
                </td>
              </tr>
              <tr v-if="!loading && !pendingImports.length">
                <td colspan="7" class="py-8 text-center text-slate-400">ไม่มีรายการรอตรวจสอบ</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div
      v-if="showEditSidebar"
      class="fixed inset-0 z-[65] flex justify-end bg-black/50 backdrop-blur-sm"
      @click.self="closeEditSidebar"
    >
      <div class="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl p-6 flex flex-col">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">แก้ไขข้อมูลยา</h2>
          <button @click="closeEditSidebar" class="text-slate-400 hover:text-slate-600">
            <i class="fa-solid fa-times text-lg"></i>
          </button>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto">
          <div>
            <label class="block text-xs font-medium mb-1">SKU</label>
            <input :value="editForm.sku" type="text" readonly class="w-full rounded-lg border p-2 text-sm bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">ชื่อยา</label>
            <input :value="editForm.name" type="text" readonly class="w-full rounded-lg border p-2 text-sm bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium mb-1">หน่วย</label>
              <input :value="editForm.unit" type="text" readonly class="w-full rounded-lg border p-2 text-sm bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500" />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">คงเหลือ</label>
              <input :value="editForm.current_stock" type="text" readonly class="w-full rounded-lg border p-2 text-sm bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium mb-1">วันผลิต</label>
              <input v-model="editForm.mfg_date" type="date" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clinic-blue" />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">วันหมดอายุ</label>
              <input v-model="editForm.exp_date" type="date" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clinic-blue" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">ประเภท</label>
            <input :value="editForm.group" type="text" readonly class="w-full rounded-lg border p-2 text-sm bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">สรรพคุณ</label>
            <textarea v-model="editForm.indication" rows="3" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clinic-blue"></textarea>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">ผลข้างเคียง</label>
            <textarea v-model="editForm.side_effect" rows="3" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clinic-blue"></textarea>
          </div>
        </div>

        <div class="pt-4 mt-4 border-t border-clinic-border dark:border-slate-700 flex gap-3">
          <button @click="closeEditSidebar" class="flex-1 px-4 py-2 rounded-lg border border-clinic-border dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            ยกเลิก
          </button>
          <button @click="saveEdit" :disabled="loading || isAdmin" class="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
            บันทึก
          </button>
        </div>
      </div>
    </div>

    <!-- Approval Sidebar -->
    <div v-if="showApprovalSidebar" class="fixed inset-0 z-[70] flex justify-end bg-black/50" @click.self="showApprovalSidebar = false">
      <div class="w-full max-w-md h-full bg-white dark:bg-slate-900 p-6 flex flex-col shadow-2xl">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-bold">ตรวจสอบการนำเข้ายา</h2>
          <button @click="showApprovalSidebar = false" class="text-slate-400"><i class="fa-solid fa-times"></i></button>
        </div>

        <div class="flex-1 space-y-6 overflow-y-auto">
          <div class="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl space-y-2">
            <div class="text-[12px] text-slate-400 uppercase font-bold">ข้อมูลการนำเข้า</div>
            <div class="flex justify-between">
              <span class="text-xs text-slate-600 dark:text-slate-300">ชื่อยา:</span>
              <span class="text-xs font-bold text-slate-600 dark:text-slate-300">{{ selectedImport.medicine?.name || selectedImport.tempInfo?.name }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-xs text-slate-600 dark:text-slate-300">จำนวน:</span>
              <span class="text-xs font-bold text-green-600 dark:text-green-400">{{ selectedImport.quantity }} {{ selectedImport.medicine?.unit || selectedImport.tempInfo?.unit }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-xs text-slate-600 dark:text-slate-300">ประเภท:</span>
              <span class="text-xs font-bold text-slate-600 dark:text-slate-300">{{ selectedImport.category }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-xs text-slate-600 dark:text-slate-300">หมายเหตุจาก Admin:</span>
              <span class="text-xs italic text-slate-500 dark:text-slate-400">{{ selectedImport.note_transaction || '-' }}</span>
            </div>
          </div>

          <div v-if="actionStatus === 'rejecting'" class="space-y-3">
            <label class="block text-xs font-medium text-red-500 dark:text-red-400">เหตุผลที่ปฏิเสธ *</label>
            <textarea v-model="rejectionNote" rows="3" class="w-full rounded-lg border-red-200 border p-2 text-sm" placeholder="ระบุเหตุผล..."></textarea>
          </div>

          <div v-if="actionStatus === 'approving'" class="space-y-4">
            <div class="space-y-2">
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-300">แนบหลักฐานเอกสารยืนยัน (รูปภาพ) *</label>
              <div 
                @click="$refs.fileInput.click()"
                class="border-2 border-dashed border-slate-600 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-slate-300 transition-colors"
              >
                <img v-if="photoPreview" :src="photoPreview" class="max-h-40 rounded-lg mb-2" />
                <div v-else class="text-center">
                  <i class="fa-solid fa-cloud-upload text-2xl text-slate-300 mb-1"></i>
                  <div class="text-[10px] text-slate-400">Click to upload image</div>
                </div>
                <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="handleFileChange" />
              </div>
            </div>
          </div>
        </div>

        <div class="pt-6 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-3"> 
          <template v-if="!actionStatus">
            <button @click="actionStatus = 'approving'" class="w-full p-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 cursor-pointer">อนุมัติรายการ</button>
            <button @click="actionStatus = 'rejecting'" class="w-full p-3 rounded-xl border border-red-200 text-red-500 font-bold hover:bg-red-50 dark:hover:bg-slate-800 cursor-pointer">ปฏิเสธ</button>
          </template>
          <template v-else>
            <button v-if="actionStatus === 'approving'" @click="processApproval" :disabled="loading" class="w-full p-3 rounded-xl bg-blue-600 text-slate-100 hover:bg-blue-700 font-bold cursor-pointer">
              {{ loading ? 'กำลังอัปโหลดและบันทึก...' : 'ยืนยันอนุมัติ' }}
            </button>
            <button v-if="actionStatus === 'rejecting'" @click="processRejection" :disabled="loading" class="w-full p-3 rounded-xl border border-red-200 cursor-pointer bg-red-50 text-slate-800 dark:text-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold">ยืนยันปฏิเสธ</button>
            <button @click="actionStatus = ''" class="w-full p-2 text-xs text-slate-400 hover:underline cursor-pointer">ย้อนกลับ</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
