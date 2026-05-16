<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { supabase, supabaseStorage, STORAGE_BUCKET } from '../supabaseClient'
import { showToast, showConfirm } from '../stores/ui'
const employeeCode = ref('')
const employeeInfo = ref(null)
const loadingEmployee = ref(false)
const employeeOptions = ref([])
const showEmployeeOptions = ref(false)
let employeeSearchTimer = null
const suppressEmployeeSearch = ref(false)

const clinicLocation = ref('ไทยดริว-เมืองวัง')
const temp = ref('')
const bp = ref('')
const pulse = ref('')
const rr = ref('')
const spo2 = ref('')
const symptoms = ref('')
const diagnosis = ref('')
const diagnosisOptions = ref([])
const showDiagnosisOptions = ref(false)
let diagnosisBlurTimer = null

// Diagnosis Management
const showDiagnosisManageModal = ref(false)
const loadingDiagnoses = ref(false)
const diagnoses = ref([])
const editingDiagnosis = ref(null)
const newDiagnosisName = ref('')
const newDiagnosisDetail = ref('')

const fetchDiagnoses = async () => {
  loadingDiagnoses.value = true
  try {
    const { data, error } = await supabase
      .from('diagnosis')
      .select('id, name, detail')
      .order('name', { ascending: true })
    if (error) throw error
    
    console.log('Diagnoses from DB:', data)
    if (data && data.length > 0) {
      console.log('First diagnosis item:', data[0])
      console.log('First diagnosis item keys:', Object.keys(data[0]))
    }
    
    diagnoses.value = data || []
    
    // Build a completely new, clean array of strings
    const newOptions = []
    if (data && Array.isArray(data)) {
      data.forEach((item, index) => {
        console.log(`Item ${index}:`, item)
        if (item && typeof item === 'object' && item !== null) {
          const name = item.name
          if (typeof name === 'string' && name.trim().length > 0) {
            newOptions.push(name.trim())
          }
        }
      })
    }
    
    // Replace the array contents completely instead of reassigning
    diagnosisOptions.value.splice(0, diagnosisOptions.value.length, ...newOptions)
    
    console.log('Final diagnosisOptions:', diagnosisOptions.value)
    console.log('Is array?', Array.isArray(diagnosisOptions.value))
  } catch (err) {
    console.error('Fetch diagnoses error', err)
    showToast('error', 'โหลดรายชื่อโรคไม่สำเร็จ')
    diagnosisOptions.value.splice(0, diagnosisOptions.value.length)
  } finally {
    loadingDiagnoses.value = false
  }
}

const saveDiagnosis = async () => {
  const name = newDiagnosisName.value.trim()
  if (!name) {
    showToast('error', 'กรุณากรอกชื่อโรค')
    return
  }

  try {
    // Get session (same as saveCheckup)
    const getCookie = (name) => {
      const v = document.cookie.split('; ').find((row) => row.startsWith(name + '='))
      return v ? v.split('=')[1] : ''
    }
    let session = null
    try {
      const raw = getCookie('clinic_tdl_session') || localStorage.getItem('clinic_tdl_session')
      session = raw ? JSON.parse(decodeURIComponent(raw)) : null
    } catch { session = null }

    const userId = session?.userId || null

    // Check for duplicates before saving
    if (!editingDiagnosis.value) {
      const existing = diagnoses.value.find(d => 
        d.name && d.name.toLowerCase() === name.toLowerCase()
      )
      if (existing) {
        showToast('error', 'ชื่อโรคนี้มีอยู่แล้ว')
        return
      }
    }

    if (editingDiagnosis.value) {
      // Update existing - simplest possible query
      const updateData = {
        name,
        detail: newDiagnosisDetail.value.trim() || null
      }
      
      console.log('Updating diagnosis with ID:', editingDiagnosis.value.id)
      console.log('Update data:', updateData)
      
      const { error, count } = await supabase
        .from('diagnosis')
        .update(updateData, { count: 'exact' })
        .eq('id', editingDiagnosis.value.id)
      
      console.log('Update response - error:', error)
      console.log('Update response - count:', count)
      
      if (error) throw error
      if (count === 0) {
        showToast('error', 'ไม่สามารถอัปเดตข้อมูลได้! กรุณาตรวจสอบ RLS Policy ใน Supabase Dashboard')
        return
      }
      showToast('success', 'อัปเดตโรคสำเร็จ')
    } else {
      // Create new - simple data only
      const insertData = {
        name,
        detail: newDiagnosisDetail.value.trim() || null
      }
      
      // Only add created_by/updated_by if we have a valid userId
      if (userId) {
        insertData.created_by = userId
        insertData.updated_by = userId
      }
      
      console.log('Inserting diagnosis:', insertData)
      
      const { error } = await supabase
        .from('diagnosis')
        .insert(insertData)
      if (error) throw error
      showToast('success', 'เพิ่มโรคสำเร็จ')
    }
    
    // Refresh
    await fetchDiagnoses()
    closeDiagnosisForm()
  } catch (err) {
    console.error('Save diagnosis error', err)
    showToast('error', 'บันทึกโรคไม่สำเร็จ: ' + (err?.message || 'Unknown error'))
  }
}

const editDiagnosis = (diagnosisItem) => {
  editingDiagnosis.value = diagnosisItem
  newDiagnosisName.value = diagnosisItem.name
  newDiagnosisDetail.value = diagnosisItem.detail || ''
}

const deleteDiagnosis = async (diagnosisItem) => {
  const ok = await showConfirm({
    title: 'ยืนยันการลบ',
    message: `ต้องการลบโรค "${diagnosisItem.name}" หรือไม่?`,
    type: 'warning'
  })
  if (!ok) return

  try {
    console.log('Deleting diagnosis with ID:', diagnosisItem.id)
    const { error, count } = await supabase
      .from('diagnosis')
      .delete({ count: 'exact' })
      .eq('id', diagnosisItem.id)
    
    console.log('Delete response - error:', error)
    console.log('Delete response - count:', count)
    
    if (error) throw error
    if (count === 0) {
      showToast('error', 'ไม่สามารถลบข้อมูลได้! กรุณาตรวจสอบ RLS Policy ใน Supabase Dashboard')
      return
    }
    showToast('success', 'ลบโรคสำเร็จ')
    await fetchDiagnoses()
  } catch (err) {
    console.error('Delete diagnosis error', err)
    showToast('error', 'ลบโรคไม่สำเร็จ: ' + (err?.message || 'Unknown error'))
  }
}

const closeDiagnosisForm = () => {
  editingDiagnosis.value = null
  newDiagnosisName.value = ''
  newDiagnosisDetail.value = ''
}
const vitalHelperConfigs = {
  bp: {
    title: 'BP',
    options: ['90/60', '100/60', '110/70', '118/120', '119/79', '119/80', '120/78', '120/79', '120/80', '120/81', '130/80', '140/90'],
  },
  pulse: {
    title: 'Pulse',
    options: ['60', '67', '68', '69', '70', '71', '72', '73', '80', '90', '100', '110'],
  },
  rr: {
    title: 'RR',
    options: ['12', '13', '14', '15', '16', '17', '18', '20', '22'],
  },
  temp: {
    title: 'Temp',
    options: ['35', '36', '37', '38', '39', '40'],
  },
  spo2: {
    title: 'SpO2',
    options: ['95', '96', '97', '98', '99', '100'],
  },
}
const activeVitalHelper = ref('')
let vitalHelperBlurTimer = null
const remark = ref('')
const isLeaveAllowed = ref(false)
const leaveStart = ref('')
const leaveEnd = ref('')
const totalLeaveDays = ref('')
const isDrugAllergy = ref(false)
const isHaveConditions = ref(false)
const drugAllergyText = ref('')
const congenitalDiseaseText = ref('')

const toTitleCaseEng = (s) => {
  const str = typeof s === 'string' ? s : ''
  return str.replace(/\b([A-Za-z])([A-Za-z]*)\b/g, (_, a, b) => a.toUpperCase() + b.toLowerCase())
}
const filteredDiagnosisOptions = computed(() => {
  try {
    const keyword = typeof diagnosis.value === 'string' 
      ? diagnosis.value.trim().toLowerCase() 
      : ''
    
    // First make sure we only work with valid arrays
    const safeOptions = Array.isArray(diagnosisOptions.value) 
      ? diagnosisOptions.value 
      : []
    
    // Filter to only valid string options
    const validOptions = safeOptions.filter(opt => 
      typeof opt === 'string' && opt.trim() !== ''
    )
    
    if (!keyword) {
      return validOptions
    }
    
    return validOptions.filter((option) => {
      try {
        return typeof option === 'string' && option.toLowerCase().includes(keyword)
      } catch {
        return false
      }
    })
  } catch (err) {
    console.error('filteredDiagnosisOptions error', err)
    return []
  }
})
const openDiagnosisOptions = () => {
  if (diagnosisBlurTimer) {
    clearTimeout(diagnosisBlurTimer)
    diagnosisBlurTimer = null
  }
  showDiagnosisOptions.value = true
}
const closeDiagnosisOptions = () => {
  diagnosisBlurTimer = setTimeout(() => {
    showDiagnosisOptions.value = false
    formatDiagnosisOnBlur()
    diagnosisBlurTimer = null
  }, 120)
}
const selectDiagnosisOption = (option) => {
  if (diagnosisBlurTimer) {
    clearTimeout(diagnosisBlurTimer)
    diagnosisBlurTimer = null
  }
  if (typeof option === 'string') {
    diagnosis.value = option
  }
  showDiagnosisOptions.value = false
}
const formatDiagnosisOnBlur = () => {
  try {
    diagnosis.value = toTitleCaseEng(diagnosis.value)
  } catch (err) {
    console.error('formatDiagnosisOnBlur error', err)
  }
}
const openVitalHelper = (field) => {
  if (vitalHelperBlurTimer) {
    clearTimeout(vitalHelperBlurTimer)
    vitalHelperBlurTimer = null
  }
  activeVitalHelper.value = field
}
const closeVitalHelper = () => {
  vitalHelperBlurTimer = setTimeout(() => {
    activeVitalHelper.value = ''
    vitalHelperBlurTimer = null
  }, 120)
}
const applyVitalSuggestion = (field, value) => {
  if (vitalHelperBlurTimer) {
    clearTimeout(vitalHelperBlurTimer)
    vitalHelperBlurTimer = null
  }
  if (field === 'bp') bp.value = value
  if (field === 'pulse') pulse.value = value
  if (field === 'rr') rr.value = value
  if (field === 'temp') temp.value = value
  if (field === 'spo2') spo2.value = value
  activeVitalHelper.value = ''
}

const photoDataUrl = ref('')
const fileInputRef = ref(null)
const isDragging = ref(false)

const handleDrop = (e) => {
  isDragging.value = false
  const file = e.dataTransfer.files?.[0]
  if (file && file.type.startsWith('image/')) {
    processFile(file)
  } else {
    showToast('error', 'กรุณาเลือกไฟล์รูปภาพเท่านั้น')
  }
}

const handleDragOver = (e) => {
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const processFile = async (file) => {
  const toDataURL = (blob) =>
    new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.readAsDataURL(blob)
    })
  
  const reader = new FileReader()
  reader.onload = async (e) => {
    const baseDataUrl = e.target.result
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = reject
        i.src = baseDataUrl
      })
      const ow = img.naturalWidth || img.width || 1280
      const oh = img.naturalHeight || img.height || 720
      const maxDim = 1024
      let rw = ow
      let rh = oh
      if (ow > oh && ow > maxDim) {
        rw = maxDim
        rh = Math.round((oh * maxDim) / ow)
      } else if (oh >= ow && oh > maxDim) {
        rh = maxDim
        rw = Math.round((ow * maxDim) / oh)
      }
      const canvas = document.createElement('canvas')
      canvas.width = rw
      canvas.height = rh
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, rw, rh)
      const qualities = [0.8, 0.7, 0.6, 0.5, 0.4]
      let best = null
      for (const q of qualities) {
        const webpBlob = await new Promise((resolve) =>
          canvas.toBlob(resolve, 'image/webp', q),
        )
        const jpegBlob = await new Promise((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', q),
        )
        const pick =
          webpBlob && jpegBlob
            ? webpBlob.size <= jpegBlob.size
              ? { blob: webpBlob, mime: 'image/webp' }
              : { blob: jpegBlob, mime: 'image/jpeg' }
            : jpegBlob
            ? { blob: jpegBlob, mime: 'image/jpeg' }
            : { blob: webpBlob, mime: 'image/webp' }
        if (!best || pick.blob.size < best.blob.size) best = pick
        if (pick.blob.size <= 100 * 1024) {
          const out = await toDataURL(pick.blob)
          photoDataUrl.value = out
          return
        }
      }
      const out = await toDataURL(best.blob)
      photoDataUrl.value = out
    } catch {
      photoDataUrl.value = baseDataUrl
    }
  }
  reader.readAsDataURL(file)
}

const medicineSearch = ref('')
const medicineResults = ref([])
const selectedItems = ref([])
const searchingMedicines = ref(false)

const saving = ref(false)
const message = ref('')

watch(employeeCode, async (val) => {
  if (suppressEmployeeSearch.value) {
    if (employeeSearchTimer) {
      clearTimeout(employeeSearchTimer)
      employeeSearchTimer = null
    }
    employeeOptions.value = []
    showEmployeeOptions.value = false
    suppressEmployeeSearch.value = false
    return
  }
  if (employeeSearchTimer) clearTimeout(employeeSearchTimer)

  const q = (val || '').trim()
  if (!q) {
    employeeInfo.value = null
    employeeOptions.value = []
    showEmployeeOptions.value = false
    return
  }

  employeeSearchTimer = setTimeout(async () => {
    loadingEmployee.value = true
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_code, fullname, department, project, status, congenital_disease, drug_allergy')
        .or(`employee_code.ilike.%${q}%,fullname.ilike.%${q}%`)
        .order('employee_code', { ascending: true })
        .limit(10)

      if (error) throw error
      employeeOptions.value = data || []
      showEmployeeOptions.value = employeeOptions.value.length > 0

      const exact = (data || []).find(
        (e) =>
          String(e.employee_code || '').toLowerCase() === q.toLowerCase() ||
          String(e.fullname || '').toLowerCase() === q.toLowerCase(),
      )
      employeeInfo.value = exact || null
    } catch (err) {
      console.error('Employee search failed', err)
      employeeInfo.value = null
      employeeOptions.value = []
      showEmployeeOptions.value = false
    } finally {
      loadingEmployee.value = false
    }
  }, 200)
})

const selectEmployee = (emp) => {
  suppressEmployeeSearch.value = true
  employeeCode.value = emp?.employee_code || ''
  employeeInfo.value = emp || null
  employeeOptions.value = []
  showEmployeeOptions.value = false
}

const clearPhoto = () => {
  photoDataUrl.value = ''
}

const triggerFileSelect = () => {
  fileInputRef.value?.click()
}

const onFileSelected = async (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showToast('error', 'กรุณาเลือกไฟล์รูปภาพเท่านั้น')
    return
  }
  processFile(file)
}

const searchMedicines = async () => {
  searchingMedicines.value = true
  try {
    const query = supabase
      .from('medicine_list')
      .select('*')
      .ilike('name', `%${medicineSearch.value}%`)
      .neq('group', 'เครื่องมือแพทย์')
      .limit(20)
    const { data, error } = await query
    if (error) throw error
    medicineResults.value = (data || []).filter((m) => (m?.group || '').trim() !== 'เครื่องมือแพทย์')
  } catch (err) {
    console.error('Search medicines error', err)
  } finally {
    searchingMedicines.value = false
  }
}

const roundCount = ref(0)
const roundText = ref('')
const updateMonthlyRound = async () => {
  try {
    let empId = employeeInfo.value?.id || null
    if (!empId && employeeCode.value) {
      const { data: empLookup } = await supabase
        .from('employees')
        .select('id')
        .eq('employee_code', employeeCode.value)
        .maybeSingle()
      empId = empLookup?.id || null
    }
    if (!empId) {
      roundCount.value = 0
      roundText.value = ''
      return
    }
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const { count } = await supabase
      .from('checkups')
      .select('*', { count: 'exact', head: true })
      .eq('employee_id', empId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
    const next = (count || 0) + 1
    roundCount.value = next
    roundText.value = `ครั้งที่ ${next} ของเดือนนี้`
  } catch {
    roundCount.value = 0
    roundText.value = ''
  }
}

watch(() => employeeInfo.value?.id, () => {
  updateMonthlyRound()
})
watch(employeeCode, () => {
  updateMonthlyRound()
})

watch(isDrugAllergy, (val) => {
  if (val && !String(drugAllergyText.value || '').trim()) {
    drugAllergyText.value = employeeInfo.value?.drug_allergy || ''
  }
})
watch(isHaveConditions, (val) => {
  if (val && !String(congenitalDiseaseText.value || '').trim()) {
    congenitalDiseaseText.value = employeeInfo.value?.congenital_disease || ''
  }
})

const getUnitCap = (unitRaw) => {
  const unit = (unitRaw || '').toString().trim()
  if (unit === 'แผง') return 3
  if (unit === 'เม็ด') return 10
  if (unit === 'ซอง') return 3
  if (unit === 'ขวด') return 1
  if (unit === 'หลอด') return 3
  if (unit === 'ถุง') return 1
  if (unit === 'กล่อง') return 1
  return 3
}

const addMedicine = (med) => {
  if ((med?.group || '').toString().trim() === 'เครื่องมือแพทย์') {
    showToast('error', 'อุปกรณ์/เครื่องมือแพทย์ไม่สามารถจ่ายในหน้านี้ได้')
    return
  }
  if (selectedItems.value.length >= 7) {
    showToast('error', 'สามารถเพิ่มรายการยาได้สูงสุด 7 รายการ')
    return
  }
  if (selectedItems.value.some((i) => i.id === med.id)) return
  const stock = Number(med.current_stock || 0)
  if (stock <= 0) {
    showToast('error', `ยา ${med.name} หมดสต็อก ไม่สามารถจ่ายได้`)
    return
  }
  const unitCap = getUnitCap(med.unit)
  const maxQ = Math.max(0, Math.min(stock, unitCap))
  selectedItems.value.push({
    id: med.id,
    name: med.name,
    unit: med.unit,
    quantity: Math.min(1, maxQ) || 1,
    maxQuantity: maxQ,
  })
}

const removeItem = (id) => {
  selectedItems.value = selectedItems.value.filter((i) => i.id !== id)
}

const uploadPhotoToServer = async () => {
  if (!photoDataUrl.value) return null
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const name = `checkup-${employeeCode.value || 'unknown'}-${ts}.jpg`
    if (supabaseStorage) {
      const compressDataUrl = async (dataUrl, maxBytes = 100 * 1024) => {
        const img = await new Promise((resolve, reject) => {
          const i = new Image()
          i.onload = () => resolve(i)
          i.onerror = reject
          i.src = dataUrl
        })
        const ow = img.naturalWidth || img.width || 1280
        const oh = img.naturalHeight || img.height || 720
        const ratios = [1, 0.85, 0.7, 0.6, 0.5]
        const qualities = [0.85, 0.7, 0.6, 0.5, 0.4]
        for (const r of ratios) {
          const cw = Math.max(1, Math.round(ow * r))
          const ch = Math.max(1, Math.round(oh * r))
          const canvas = document.createElement('canvas')
          canvas.width = cw
          canvas.height = ch
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, cw, ch)
          for (const q of qualities) {
            const blob = await new Promise((resolve) =>
              canvas.toBlob(resolve, 'image/jpeg', q),
            )
            if (blob && blob.size <= maxBytes) return { blob, mime: 'image/jpeg' }
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(ow * 0.5))
        canvas.height = Math.max(1, Math.round(oh * 0.5))
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.4),
        )
        return { blob, mime: 'image/jpeg' }
      }
      const { blob, mime } = await compressDataUrl(photoDataUrl.value, 100 * 1024)
      const path = name
      const { data: upRes, error: upErr } = await supabaseStorage.storage
        .from(STORAGE_BUCKET)
        .upload(path, blob, { contentType: mime, upsert: true })
      if (upErr) throw upErr
      const { data: pub } = await supabaseStorage.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(path)
      return pub?.publicUrl || upRes?.path || path
    } else {
      const res = await fetch('/api/upload-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: photoDataUrl.value, fileName: name }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'Upload failed')
      return json?.webViewLink || json?.id || name
    }
  } catch (err) {
    console.error('Photo upload error', err)
    return null
  }
}

const saveCheckup = async () => {
  if (!employeeCode.value) {
    message.value = 'Please enter employee code.'
    showToast('error', 'กรุณากรอกรหัสพนักงาน')
    return
  }
  if (selectedItems.value.length && !photoDataUrl.value) {
    showToast('error', 'กรุณาแนบรูปผู้ป่วยขณะรับยา')
    return
  }

  const optionalEmpty =
    !temp.value ||
    !bp.value ||
    !pulse.value ||
    !rr.value ||
    !spo2.value ||
    !symptoms.value ||
    !diagnosis.value ||
    !leaveStart.value ||
    !leaveEnd.value ||
    !totalLeaveDays.value ||
    !clinicLocation.value
  if (optionalEmpty || !selectedItems.value.length) {
    const ok = await showConfirm({
      title: 'ยืนยันการบันทึก',
      message: 'ข้อมูลไม่ครบ ต้องการบันทึกหรือไม่',
      type: 'info',
    })
    if (!ok) return
  }

  saving.value = true
  message.value = ''

  try {
    const parseDec = (v) => {
      const n = parseFloat(String(v ?? '').toString().replace(',', '.'))
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
    }
    const clamp = (n, min, max) =>
      n == null ? null : Math.max(min, Math.min(max, n))

    const tempNumRaw = parseDec(temp.value)
    if (tempNumRaw !== null && (tempNumRaw < 30 || tempNumRaw > 45)) {
      showToast('error', 'อุณหภูมิร่างกายไม่อยู่ในเกณฑ์ที่เหมาะสม (30-45 °C)')
      saving.value = false
      return
    }

    const pulseNumRaw = parseDec(pulse.value)
    if (pulseNumRaw !== null && (pulseNumRaw < 30 || pulseNumRaw > 250)) {
      showToast('error', 'ชีพจรไม่อยู่ในเกณฑ์ที่เหมาะสม (30-250 bpm)')
      saving.value = false
      return
    }

    const rrNumRaw = parseDec(rr.value)
    if (rrNumRaw !== null && (rrNumRaw < 5 || rrNumRaw > 60)) {
      showToast('error', 'อัตราการหายใจไม่อยู่ในเกณฑ์ที่เหมาะสม (5-60 /min)')
      saving.value = false
      return
    }

    const spo2NumRaw = parseDec(spo2.value)
    if (spo2NumRaw !== null && (spo2NumRaw < 50 || spo2NumRaw > 100)) {
      showToast('error', 'ค่า SpO2 ไม่อยู่ในเกณฑ์ที่เหมาะสม (50-100 %)')
      saving.value = false
      return
    }

    // Check medicine stock
    for (const item of selectedItems.value) {
      if (item.quantity > (item.maxQuantity || 0)) {
        showToast('error', `ยา ${item.name} มีสต็อกไม่เพียงพอ (คงเหลือ ${item.maxQuantity} ${item.unit})`)
        saving.value = false
        return
      }
      if (item.quantity <= 0) {
        showToast('error', `กรุณาระบุจำนวนยา ${item.name} ให้ถูกต้อง`)
        saving.value = false
        return
      }
    }

    const photoFileName = await uploadPhotoToServer()

    const getCookie = (name) => {
      const v = document.cookie.split('; ').find((row) => row.startsWith(name + '='))
      return v ? v.split('=')[1] : ''
    }
    let session = null
    try {
      const raw = getCookie('clinic_tdl_session') || localStorage.getItem('clinic_tdl_session')
      session = raw ? JSON.parse(decodeURIComponent(raw)) : null
    } catch { session = null }

    let employeeIdToSave = employeeInfo.value?.id || null
    if (!employeeIdToSave && employeeCode.value) {
      const { data: empLookup } = await supabase
        .from('employees')
        .select('id')
        .eq('employee_code', employeeCode.value)
        .maybeSingle()
      employeeIdToSave = empLookup?.id || null
    }
    if (!employeeIdToSave) {
      message.value = 'Please select a valid employee.'
      throw new Error('Missing employee id')
    }

    const tempNum = clamp(tempNumRaw, -99.99, 99.99)
    const bpText = (bp.value ?? '').toString().trim() || null
    const pulseNum = pulseNumRaw
    const rrNum = rrNumRaw
    const spo2Num = clamp(spo2NumRaw, 0, 99.99)
    const totalLeaveDaysNum =
      totalLeaveDays.value !== '' && totalLeaveDays.value != null
        ? Number(totalLeaveDays.value)
        : null

    diagnosis.value = toTitleCaseEng(diagnosis.value || '')

    const { data: checkup, error: checkupError } = await supabase
      .from('checkups')
      .insert({
        employee_id: employeeIdToSave,
        clinic_location: clinicLocation.value || null,
        round: roundText.value || null,
        temp: tempNum,
        bp: bpText,
        pulse: pulseNum,
        rr: rrNum,
        spo2: spo2Num,
        symptoms: symptoms.value || null,
        diagnosis: diagnosis.value || null,
        remark: remark.value || null,
        is_leave_allowed: isLeaveAllowed.value,
        leave_start: leaveStart.value || null,
        leave_end: leaveEnd.value || null,
        total_leave_days: totalLeaveDaysNum,
        image_url: photoFileName,
        is_drug_allergy: isDrugAllergy.value,
        is_have_conditions: isHaveConditions.value,
        created_by: session?.userId || null,
      })
      .select('*')
      .single()

    if (checkupError) throw checkupError

    const allergyText = String(drugAllergyText.value || '').trim()
    const diseaseText = String(congenitalDiseaseText.value || '').trim()
    const empUpdate = {}
    if (isDrugAllergy.value && allergyText) {
      empUpdate.drug_allergy = allergyText
    }
    if (isHaveConditions.value && diseaseText) {
      empUpdate.congenital_disease = diseaseText
    }
    if (Object.keys(empUpdate).length > 0) {
      empUpdate.updated_at = new Date()
      const { data: empRes, error: empErr } = await supabase
        .from('employees')
        .update(empUpdate)
        .eq('id', employeeIdToSave)
        .select('id, drug_allergy, congenital_disease')
      if (empErr) throw empErr
      if (!empRes || !empRes.length) throw new Error('ไม่พบพนักงานสำหรับอัปเดต')
      const row = empRes[0]
      employeeInfo.value = {
        ...(employeeInfo.value || {}),
        drug_allergy: row.drug_allergy,
        congenital_disease: row.congenital_disease,
      }
      showToast('success', 'อัปเดตข้อมูลแพ้ยา/โรคประจำตัวของพนักงานสำเร็จ')
    }

    if (selectedItems.value.length) {
      const { error: dispensingError } = await supabase
        .from('dispensing_records')
        .insert(
          selectedItems.value.map((item) => ({
            checkup_id: checkup.id,
            medicine_id: item.id,
            amount: item.quantity,
          })),
        )
      if (dispensingError) throw dispensingError

      for (const item of selectedItems.value) {
        const { data: m } = await supabase
          .from('medicine_list')
          .select('current_stock')
          .eq('id', item.id)
          .maybeSingle()
        const cur = Number(m?.current_stock || 0)
        const next = Math.max(0, cur - Number(item.quantity || 0))
        await supabase
          .from('medicine_list')
          .update({ current_stock: next })
          .eq('id', item.id)
      }
    }

    message.value = 'Checkup and dispensing saved successfully.'
    showToast('success', 'บันทึกสำเร็จ')
    employeeCode.value = ''
    employeeInfo.value = null
    employeeOptions.value = []
    showEmployeeOptions.value = false
    clinicLocation.value = 'ไทยดริว-เมืองวัง'
    temp.value = ''
    bp.value = ''
    pulse.value = ''
    rr.value = ''
    spo2.value = ''
    activeVitalHelper.value = ''
    symptoms.value = ''
    diagnosis.value = ''
    showDiagnosisOptions.value = false
    remark.value = ''
    isLeaveAllowed.value = false
    leaveStart.value = ''
    leaveEnd.value = ''
    totalLeaveDays.value = ''
    isDrugAllergy.value = false
    isHaveConditions.value = false
    drugAllergyText.value = ''
    congenitalDiseaseText.value = ''
    selectedItems.value = []
    photoDataUrl.value = ''
    medicineSearch.value = ''
    medicineResults.value = []
  } catch (err) {
    console.error('Save checkup error', err)
    message.value = 'Failed to save. Please try again.'
    showToast('error', 'บันทึกล้มเหลว')
  } finally {
    saving.value = false
  }
}

watch(isLeaveAllowed, (val) => {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const isoDate = `${yyyy}-${mm}-${dd}`
  if (val) {
    leaveStart.value = isoDate
    leaveEnd.value = isoDate
    totalLeaveDays.value = '1'
  } else {
    leaveStart.value = ''
    leaveEnd.value = ''
    totalLeaveDays.value = ''
  }
})

watch([leaveStart, leaveEnd], () => {
  const s = leaveStart.value
  const e = leaveEnd.value
  if (!s || !e) {
    totalLeaveDays.value = ''
    return
  }
  const sd = new Date(s)
  const ed = new Date(e)
  if (isNaN(sd.getTime()) || isNaN(ed.getTime()) || ed < sd) {
    totalLeaveDays.value = ''
    return
  }
  const ms = ed.getTime() - sd.getTime()
  const days = Math.floor(ms / 86400000) + 1
  totalLeaveDays.value = String(days)
})

onMounted(() => {
  fetchDiagnoses()
})
</script>

<template>
  <div class="space-y-4">
    <!-- <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
      Medical Checkup & Dispensing
    </h1> -->

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div
        class="xl:col-span-2 bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 space-y-4"
      >
        <h2 class="text-sm font-medium mb-1">Patient / Employee Information</h2>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div class="md:col-span-1">
            <label class="block text-xs font-medium mb-1">
              รหัสพนักงาน
            </label>
            <div class="relative">
              <input
                v-model="employeeCode"
                type="text"
                autocomplete="off"
                class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
                placeholder="กรอกรหัสพนักงาน"
                @focus="showEmployeeOptions = employeeOptions.length > 0"
                @keydown.esc="showEmployeeOptions = false"
              />

              <div
                v-if="showEmployeeOptions"
                class="absolute z-20 mt-1 w-full rounded-lg border border-clinic-border dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
              >
                <button
                  v-for="emp in employeeOptions"
                  :key="emp.employee_code"
                  type="button"
                  class="w-full text-left px-3 py-2 text-xs hover:bg-clinic-light dark:hover:bg-slate-800"
                  @click="selectEmployee(emp)"
                >
                  <span class="font-medium">{{ emp.employee_code }}</span>
                  <span class="text-slate-500">
                    ({{ emp.fullname || '-' }})
                  </span>
                </button>
              </div>
            </div>
            <p v-if="loadingEmployee" class="text-[11px] text-slate-400 mt-1">
              กำลังโหลดข้อมูลพนักงาน...
            </p>
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-medium mb-1">
              ชื่อ-นามสกุล
            </label>
            <input
              :value="employeeInfo?.fullname || ''"
              type="text"
              disabled
              placeholder="ชื่อ-นามสกุล"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-xs"
            />
          </div>
          <div class="md:col-span-1">
            <label class="block text-xs font-medium mb-1">
              สถานะการทำงาน
            </label>
            <input
              :value="employeeInfo?.status || ''"
              type="text"
              disabled
              placeholder="พนักงาน, ลาออก, ฯลฯ"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-xs"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-medium mb-1">สถานที่คลินิก</label>
            <!-- <input
              v-model="clinicLocation"
              type="text"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            /> -->
            <select v-model="clinicLocation" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue">
              <option value="ไทยดริว-สิริสิน">ไทยดริว-สิริสิน</option>
              <option value="ไทยดริว-เมืองวัง">ไทยดริว-เมืองวัง</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">แผนก</label>
            <input
              :value="employeeInfo?.department || ''"
              type="text"
              disabled
              placeholder="แผนก"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">โครงการ</label>
            <input
              :value="employeeInfo?.project || ''"
              type="text"
              disabled
              placeholder="โครงการ"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-xs"
            />
          </div>
        </div>

        <div v-if="employeeInfo?.drug_allergy || employeeInfo?.congenital_disease" class="rounded-lg border border-clinic-border dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
          <div v-if="employeeInfo?.drug_allergy" class="text-red-600 dark:text-red-400">
            แพ้ยา: {{ employeeInfo.drug_allergy }}
          </div>
          <div v-if="employeeInfo?.congenital_disease" class="text-slate-700 dark:text-slate-300">
            โรคประจำตัว: {{ employeeInfo.congenital_disease }}
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div class="relative">
            <label class="block text-xs font-medium mb-1">BP (mmHg)</label>
            <input
              v-model="bp"
              type="text"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              placeholder="120/80"
              @focus="openVitalHelper('bp')"
              @click="openVitalHelper('bp')"
              @blur="closeVitalHelper"
            />
            <div
              v-if="activeVitalHelper === 'bp'"
              class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl"
            >
              <div class="border-b border-clinic-border dark:border-slate-700 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                เลือกค่า {{ vitalHelperConfigs.bp.title }}
              </div>
              <div class="grid grid-cols-3 gap-1 p-2">
                <button
                  v-for="option in vitalHelperConfigs.bp.options"
                  :key="option"
                  type="button"
                  class="rounded-md px-2 py-1.5 text-xs transition-colors"
                  :class="option === bp ? 'bg-clinic-blue text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
                  @mousedown.prevent="applyVitalSuggestion('bp', option)"
                >
                  {{ option }}
                </button>
              </div>
            </div>
          </div>
          <div class="relative">
            <label class="block text-xs font-medium mb-1">Pulse (bpm)</label>
            <input
              v-model="pulse"
              type="number"
              min="30"
              max="250"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              placeholder="72"
              @focus="openVitalHelper('pulse')"
              @click="openVitalHelper('pulse')"
              @blur="closeVitalHelper"
            />
            <div
              v-if="activeVitalHelper === 'pulse'"
              class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl"
            >
              <div class="border-b border-clinic-border dark:border-slate-700 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                เลือกค่า {{ vitalHelperConfigs.pulse.title }}
              </div>
              <div class="grid grid-cols-3 gap-1 p-2">
                <button
                  v-for="option in vitalHelperConfigs.pulse.options"
                  :key="option"
                  type="button"
                  class="rounded-md px-2 py-1.5 text-xs transition-colors"
                  :class="option === pulse ? 'bg-clinic-blue text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
                  @mousedown.prevent="applyVitalSuggestion('pulse', option)"
                >
                  {{ option }}
                </button>
              </div>
            </div>
          </div>
          <div class="relative">
            <label class="block text-xs font-medium mb-1">RR (/min)</label>
            <input
              v-model="rr"
              type="number"
              min="5"
              max="60"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              placeholder="16"
              @focus="openVitalHelper('rr')"
              @click="openVitalHelper('rr')"
              @blur="closeVitalHelper"
            />
            <div
              v-if="activeVitalHelper === 'rr'"
              class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl"
            >
              <div class="border-b border-clinic-border dark:border-slate-700 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                เลือกค่า {{ vitalHelperConfigs.rr.title }}
              </div>
              <div class="grid grid-cols-3 gap-1 p-2">
                <button
                  v-for="option in vitalHelperConfigs.rr.options"
                  :key="option"
                  type="button"
                  class="rounded-md px-2 py-1.5 text-xs transition-colors"
                  :class="option === rr ? 'bg-clinic-blue text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
                  @mousedown.prevent="applyVitalSuggestion('rr', option)"
                >
                  {{ option }}
                </button>
              </div>
            </div>
          </div>
          <div class="relative">
            <label class="block text-xs font-medium mb-1">Temp (°C)</label>
            <input
              v-model="temp"
              type="number"
              step="0.1"
              min="30"
              max="45"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              placeholder="36.5"
              @focus="openVitalHelper('temp')"
              @click="openVitalHelper('temp')"
              @blur="closeVitalHelper"
            />
            <div
              v-if="activeVitalHelper === 'temp'"
              class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl"
            >
              <div class="border-b border-clinic-border dark:border-slate-700 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                เลือกค่า {{ vitalHelperConfigs.temp.title }}
              </div>
              <div class="grid grid-cols-3 gap-1 p-2">
                <button
                  v-for="option in vitalHelperConfigs.temp.options"
                  :key="option"
                  type="button"
                  class="rounded-md px-2 py-1.5 text-xs transition-colors"
                  :class="option === temp ? 'bg-clinic-blue text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
                  @mousedown.prevent="applyVitalSuggestion('temp', option)"
                >
                  {{ option }}
                </button>
              </div>
            </div>
          </div>
          <div class="relative">
            <label class="block text-xs font-medium mb-1">SpO2 (%)</label>
            <input
              v-model="spo2"
              type="number"
              min="50"
              max="100"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              placeholder="98"
              @focus="openVitalHelper('spo2')"
              @click="openVitalHelper('spo2')"
              @blur="closeVitalHelper"
            />
            <div
              v-if="activeVitalHelper === 'spo2'"
              class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl"
            >
              <div class="border-b border-clinic-border dark:border-slate-700 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                เลือกค่า {{ vitalHelperConfigs.spo2.title }}
              </div>
              <div class="grid grid-cols-3 gap-1 p-2">
                <button
                  v-for="option in vitalHelperConfigs.spo2.options"
                  :key="option"
                  type="button"
                  class="rounded-md px-2 py-1.5 text-xs transition-colors"
                  :class="option === spo2 ? 'bg-clinic-blue text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
                  @mousedown.prevent="applyVitalSuggestion('spo2', option)"
                >
                  {{ option }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium mb-1">Symptoms</label>
            <textarea
              v-model="symptoms"
              rows="3"
              placeholder="อาการ"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            ></textarea>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Diagnosis</label>
            <div class="relative">
              <textarea
                v-model="diagnosis"
                rows="3"
                placeholder="วินิจฉัย"
                class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
                @focus="openDiagnosisOptions"
                @click="openDiagnosisOptions"
                @blur="closeDiagnosisOptions"
              ></textarea>
              <div
                v-if="showDiagnosisOptions"
                :key="showDiagnosisOptions + '-' + filteredDiagnosisOptions.length"
                class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl"
              >
                <div class="border-b border-clinic-border dark:border-slate-700 px-3 py-2 flex items-center justify-between">
                  <span class="text-[11px] text-slate-500 dark:text-slate-400">
                    เลือกโรคที่ใช้บ่อย หรือพิมพ์เองได้
                  </span>
                  <button 
                    type="button" 
                    @mousedown.prevent="showDiagnosisManageModal = true; showDiagnosisOptions = false"
                    class="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors"
                  >
                    <i class="fa-solid fa-gear mr-0.5"></i> จัดการ
                  </button>
                </div>
                <div class="max-h-56 overflow-y-auto p-2 space-y-1">
                  <button
                    v-for="(option, index) in filteredDiagnosisOptions"
                    :key="'diagnosis-option-' + index + '-' + (typeof option === 'string' ? option : index)"
                    type="button"
                    class="w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors"
                    :class="typeof option === 'string' && option === diagnosis ? 'bg-clinic-blue text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
                    @mousedown.prevent="typeof option === 'string' && selectDiagnosisOption(option)"
                  >
                    {{ typeof option === 'string' ? option : '' }}
                  </button>
                  <div
                    v-if="!filteredDiagnosisOptions.length"
                    class="rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-2 text-[11px] text-slate-500 dark:text-slate-400"
                  >
                    ไม่พบในรายการ สามารถใช้ข้อความที่พิมพ์เป็นชื่อโรคได้เลย
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="space-y-3 md:col-span-2">
            <div class="flex items-center gap-2 text-xs">
              <input v-model="isLeaveAllowed" type="checkbox" class="rounded border-clinic-border text-clinic-blue focus:ring-clinic-blue" />
              <span>อนุญาตการลาพัก</span>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-[11px] font-medium mb-1">วันที่เริ่มลาพัก</label>
                <input v-model="leaveStart" type="date" class="w-full rounded border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs" />
              </div>
              <div>
                <label class="block text-[11px] font-medium mb-1">วันที่สิ้นสุดลาพัก</label>
                <input v-model="leaveEnd" type="date" class="w-full rounded border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs" />
              </div>
              <div>
                <label class="block text-[11px] font-medium mb-1">จำนวนวันลาพัก</label>
                <input v-model="totalLeaveDays" type="number" min="0" readonly class="w-full rounded border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs" />
              </div>
            </div>
             <div>
              <label class="block text-xs font-medium mb-1">หมายเหตุ (Remark)</label>
              <input
                v-model="remark"
                type="text"
                placeholder="เช่น มาตรวจอีกรอบ, มาตรวจคืน, ..."
                class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              />
            </div>
            <div class="flex items-center gap-4 text-xs">
              <label class="inline-flex items-center gap-2">
                <input v-model="isDrugAllergy" type="checkbox" class="rounded border-clinic-border text-clinic-blue focus:ring-clinic-blue" />
                <span>แพ้ยา</span>
              </label>
              <label class="inline-flex items-center gap-2">
                <input v-model="isHaveConditions" type="checkbox" class="rounded border-clinic-border text-clinic-blue focus:ring-clinic-blue" />
                <span>โรคประจำตัว</span>
              </label>
            </div>
            <div v-if="isDrugAllergy">
              <label class="block text-[11px] font-medium mb-1">รายละเอียดแพ้ยา</label>
              <textarea v-model="drugAllergyText" rows="2" class="w-full rounded border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs"></textarea>
            </div>
            <div v-if="isHaveConditions">
              <label class="block text-[11px] font-medium mb-1">รายละเอียดโรคประจำตัว</label>
              <textarea v-model="congenitalDiseaseText" rows="2" class="w-full rounded border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs"></textarea>
            </div>
          </div>
        </div>
      </div>

      <div
        class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 space-y-3"
      >
        <h2 class="text-sm font-medium">รูปภาพผู้ป่วย (รับยา)</h2>

        <div class="space-y-2">
          <!-- Drop Zone -->
          <div 
            v-if="!photoDataUrl"
            class="relative w-full aspect-video bg-slate-50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center cursor-pointer group overflow-hidden"
            :class="isDragging ? 'border-clinic-blue bg-blue-50/50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-600/50 dark:hover:border-slate-300 hover:bg-blue-50/30 dark:hover:bg-blue-900/10'"
            @click="triggerFileSelect"
            @dragover.prevent="handleDragOver"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop"
          >
            <div class="flex flex-col items-center gap-2 pointer-events-none">
              <div class="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-clinic-blue transition-transform group-hover:scale-110">
                <i class="fa-solid fa-cloud-arrow-up text-xl"></i>
              </div>
              <div class="text-center">
                <p class="text-[13px] font-medium text-slate-700 dark:text-slate-200">คลิก หรือ ลากรูปภาพมาวาง</p>
                <p class="text-[11px] text-slate-400 mt-0.5">รองรับไฟล์รูปภาพเท่านั้น</p>
              </div>
            </div>
          </div>

          <!-- Preview Area -->
          <div v-else class="relative w-full aspect-video rounded-xl overflow-hidden border border-clinic-border dark:border-slate-700 shadow-sm group">
            <img
              :src="photoDataUrl"
              alt="Patient Photo"
              class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                class="w-9 h-9 rounded-full bg-white text-slate-700 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors shadow-lg"
                title="ลบรูปภาพ"
                @click="clearPhoto"
              >
                <i class="fa-solid fa-trash-can"></i>
              </button>
              <button
                type="button"
                class="w-9 h-9 rounded-full bg-white text-slate-700 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-colors shadow-lg"
                title="เปลี่ยนรูปภาพ"
                @click="triggerFileSelect"
              >
                <i class="fa-solid fa-arrows-rotate"></i>
              </button>
            </div>
          </div>

          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onFileSelected"
          />
        </div>
        <div class="space-y-2">
          <p class="text-[14px] text-slate-500 dark:text-slate-200 ms-2">โปรดโหลดรูปภาพผู้ป่วย (รับยา) ที่ถูกต้อง</p>
          <p class="text-[12px] text-slate-500 dark:text-slate-200 ms-2">รองรับไฟล์รูปภาพเท่านั้น</p>
          <p class="text-[12px] border-3 border-gray-50 dark:border-slate-800 border-l-rose-600 dark:border-l-rose-500 font-bold text-yellow-600 dark:text-yellow-400 ms-2 p-1 rounded"> วิธีอัพโหลดรูปภาพ</p>
          <p class="text-[12px] text-slate-400 dark:text-slate-200 ms-2 italic"> <span class="font-bold">1.</span> ลากไฟล์จากเครื่องมาไว้ในช่องเลือกรูปภาพ</p>
          <p class="text-[12px] text-slate-400 dark:text-slate-200 ms-2 italic"> <span class="font-bold">2.</span> คลิกในช่องเลือกรูปภาพเพื่อเลือกไฟล์จากเครื่อง</p>
        </div>
      </div>
    </div>

    <div
      class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 space-y-3"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium">การจ่ายยา</h2>
      </div>

      <div class="flex flex-col md:flex-row gap-2 items-start md:items-center">
        <div class="flex-1 flex gap-2">
          <input
            v-model="medicineSearch"
            type="text"
            placeholder="ค้นหายาด้วยชื่อของยา"
            class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
          />
          <button
            type="button"
            class="inline-flex items-center justify-center gap-1 rounded-lg bg-clinic-blue text-white px-3 py-2 text-xs hover:bg-blue-700"
            @click="searchMedicines"
          >
            <i class="fa-solid fa-magnifying-glass"></i>
            <span>ค้นหา</span>
          </button>
        </div>
      </div>

      <div v-if="medicineResults.length" class="border border-clinic-border dark:border-slate-700 rounded-lg p-2 max-h-40 overflow-y-auto text-xs">
        <div
          v-for="med in medicineResults"
          :key="med.id"
          class="flex items-center justify-between py-1.5 px-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer rounded-md transition-colors group"
          @click="addMedicine(med)"
        >
          <div class="flex flex-col">
            <span class="font-medium text-slate-700 dark:text-slate-200 group-hover:text-clinic-blue transition-colors">{{ med.name }}</span>
            <span class="text-[11px] text-slate-500">
              Stock: {{ med.current_stock || 0 }} {{ med.unit }}
            </span>
          </div>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-1 rounded border border-clinic-border dark:border-slate-600 px-2 py-1 text-[11px] bg-white dark:bg-slate-900 group-hover:border-clinic-blue group-hover:text-clinic-blue transition-all"
          >
            <i class="fa-solid fa-plus"></i>
            <span>Add</span>
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full text-xs">
          <thead>
            <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
              <th class="py-2 pr-3">รายการยา</th>
              <th class="py-2 pr-3 w-24">จำนวน</th>
              <th class="py-2 pr-3 w-24">หน่วย</th>
              <th class="py-2 pr-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in selectedItems"
              :key="item.id"
              class="border-b border-clinic-border/60 dark:border-slate-800"
            >
              <td class="py-1.5 pr-3">
                {{ item.name }}
              </td>
              <td class="py-1.5 pr-3">
                <div class="flex flex-col gap-1">
                  <input
                    v-model.number="item.quantity"
                    type="number"
                    min="1"
                    :max="item.maxQuantity || undefined"
                    class="w-20 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1"
                    :class="item.quantity > (item.maxQuantity || 0) ? 'border-red-500 ring-red-500 bg-red-50' : 'border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-clinic-blue'"
                  />
                  <span v-if="item.quantity > (item.maxQuantity || 0)" class="text-[10px] text-red-500 font-medium">
                    เกินสต็อก (คงเหลือ {{ item.maxQuantity }})
                  </span>
                </div>
              </td>
              <td class="py-1.5 pr-3">
                {{ item.unit }}
              </td>
              <td class="py-1.5 pr-3">
                <button
                  type="button"
                  class="text-red-500 hover:text-red-600"
                  @click="removeItem(item.id)"
                >
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </td>
            </tr>
            <tr v-if="!selectedItems.length">
              <td colspan="4" class="py-3 text-center text-slate-400">
                ยังไม่เพิ่มยาอะไรเลย
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between">
        <p v-if="message" class="text-xs" :class="message.includes('success') ? 'text-emerald-600' : 'text-red-500'">
          {{ message }}
        </p>

        <div class="ml-auto mr-4 text-xs font-medium text-slate-600 dark:text-slate-300" v-if="roundCount > 0">
          มาครั้งที่ {{ roundCount }} ของเดือนนี้
        </div>

        <button
          type="button"
          :disabled="saving"
          class="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white px-4 py-2 text-xs font-medium hover:bg-emerald-700 disabled:opacity-70"
          @click="saveCheckup"
        >
          <i class="fa-solid fa-floppy-disk"></i>
          <span>{{ saving ? 'Saving...' : 'Save checkup & dispensing' }}</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Diagnosis Management Modal -->
  <div v-if="showDiagnosisManageModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
      <div class="p-4 border-b border-clinic-border dark:border-slate-700 flex items-center justify-between">
        <h3 class="text-lg font-bold text-slate-800 dark:text-white">จัดการชื่อโรค</h3>
        <button @click="showDiagnosisManageModal = false; closeDiagnosisForm()" class="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      
      <div class="p-4 border-b border-clinic-border dark:border-slate-700 space-y-3">
        <h4 class="text-sm font-medium text-slate-700 dark:text-slate-300">
          {{ editingDiagnosis ? 'แก้ไขโรค' : 'เพิ่มโรคใหม่' }}
        </h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium mb-1">ชื่อโรค</label>
            <input 
              v-model="newDiagnosisName" 
              type="text" 
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              placeholder="ชื่อโรค"
            />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">รายละเอียด</label>
            <input 
              v-model="newDiagnosisDetail" 
              type="text" 
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              placeholder="รายละเอียด (ถ้ามี)"
            />
          </div>
        </div>
        <div class="flex gap-2">
          <button 
            @click="saveDiagnosis"
            class="px-4 py-2 bg-clinic-blue text-white rounded-lg text-xs font-medium hover:bg-blue-700"
          >
            <i class="fa-solid fa-save mr-1"></i>
            {{ editingDiagnosis ? 'อัปเดต' : 'เพิ่ม' }}
          </button>
          <button 
            v-if="editingDiagnosis"
            @click="closeDiagnosisForm"
            class="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-300 dark:hover:bg-slate-600"
          >
            ยกเลิก
          </button>
        </div>
      </div>
      
      <div class="flex-1 overflow-y-auto p-4">
        <h4 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">รายการโรคทั้งหมด</h4>
        <div v-if="loadingDiagnoses" class="text-center py-8 text-slate-500">
          <i class="fa-solid fa-spinner fa-spin text-xl"></i>
          <p class="text-xs mt-2">กำลังโหลด...</p>
        </div>
        <div v-else-if="!diagnoses.length" class="text-center py-8 text-slate-500">
          <p class="text-xs">ยังไม่มีรายการโรค</p>
        </div>
        <div v-else class="space-y-2">
          <div 
            v-for="d in diagnoses" 
            :key="d.id"
            class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
          >
            <div class="flex flex-col">
              <span class="text-sm font-medium text-slate-800 dark:text-slate-200">{{ d.name }}</span>
              <span v-if="d.detail" class="text-[11px] text-slate-500">{{ d.detail }}</span>
            </div>
            <div class="flex items-center gap-2">
              <button 
                @click="editDiagnosis(d)"
                class="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                title="แก้ไข"
              >
                <i class="fa-solid fa-pen"></i>
              </button>
              <button 
                @click="deleteDiagnosis(d)"
                class="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                title="ลบ"
              >
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
