<script setup>
import { onMounted, ref, watch } from 'vue'
import { supabase, supabaseStorage, STORAGE_BUCKET } from '../supabaseClient'
import { showToast, showConfirm } from '../stores/ui'
const employeeCode = ref('')
const employeeInfo = ref(null)
const loadingEmployee = ref(false)
const employeeOptions = ref([])
const showEmployeeOptions = ref(false)
let employeeSearchTimer = null
const suppressEmployeeSearch = ref(false)

const clinicLocation = ref('ไทยดริว-สิริสิน')
const temp = ref('')
const bp = ref('')
const pulse = ref('')
const rr = ref('')
const spo2 = ref('')
const symptoms = ref('')
const diagnosis = ref('')
const isLeaveAllowed = ref(false)
const leaveStart = ref('')
const leaveEnd = ref('')
const totalLeaveDays = ref('')
const isDrugAllergy = ref(false)
const isHaveConditions = ref(false)
const drugAllergyText = ref('')
const congenitalDiseaseText = ref('')

const toTitleCaseEng = (s) =>
  (s || '').replace(/\b([A-Za-z])([A-Za-z]*)\b/g, (_, a, b) => a.toUpperCase() + b.toLowerCase())
const formatDiagnosisOnBlur = () => {
  diagnosis.value = toTitleCaseEng(diagnosis.value || '')
}

const videoRef = ref(null)
const canvasRef = ref(null)
const photoDataUrl = ref('')
const capturing = ref(false)
const cameraError = ref('')
const fileInputRef = ref(null)
const availableCameras = ref([])
const selectedCameraId = ref('')
const isSecureCameraAllowed = () => {
  const host = location.hostname
  return (
    window.isSecureContext &&
    (location.protocol === 'https:' ||
      host === 'localhost' ||
      host === '127.0.0.1')
  )
}

const medicineSearch = ref('')
const medicineResults = ref([])
const selectedItems = ref([])
const searchingMedicines = ref(false)

const saving = ref(false)
const message = ref('')

let mediaStream = null

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

const refreshCameras = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cams = devices.filter((d) => d.kind === 'videoinput')
    availableCameras.value = cams.map((d, i) => ({
      deviceId: d.deviceId || `${i}`,
      label: d.label || `Camera ${i + 1}`,
    }))
    if (!selectedCameraId.value && availableCameras.value.length) {
      selectedCameraId.value = availableCameras.value[0].deviceId
    }
  } catch (e) {}
}

const startCamera = async () => {
  capturing.value = true
  cameraError.value = ''
  try {
    if (!isSecureCameraAllowed()) {
      capturing.value = false
      cameraError.value =
        'มือถือจำเป็นต้องใช้งานผ่าน HTTPS หรือ localhost เพื่อเปิดกล้อง'
      return
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop())
      mediaStream = null
    }
    await refreshCameras()
    if (!availableCameras.value.length) {
      try {
        const preflight = await navigator.mediaDevices.getUserMedia({ video: true })
        preflight.getTracks().forEach((t) => t.stop())
        await refreshCameras()
      } catch (e) {
        if (e?.name === 'NotAllowedError') {
          throw e
        }
      }
    }
    if (!availableCameras.value.length) {
      throw Object.assign(new Error('ไม่พบอุปกรณ์กล้อง'), { name: 'NotFoundError' })
    }

    const validSelected = availableCameras.value.find((c) => c.deviceId === selectedCameraId.value)
    const candidates = []
    if (validSelected) {
      candidates.push({ video: { deviceId: { exact: selectedCameraId.value }, width: { ideal: 1280 }, height: { ideal: 720 } } })
    }
    candidates.push({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
    candidates.push({ video: { facingMode: 'environment' } })
    candidates.push({ video: true })

    let stream = null
    let lastErr = null
    for (const c of candidates) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c)
        break
      } catch (e) {
        lastErr = e
        if (e?.name === 'NotFoundError' && c?.video?.deviceId?.exact) {
          selectedCameraId.value = ''
        }
      }
    }
    if (!stream) throw lastErr || new Error('ไม่สามารถเปิดกล้องได้')

    mediaStream = stream
    if (videoRef.value) {
      videoRef.value.srcObject = mediaStream
      const playPromise = videoRef.value.play()
      if (playPromise && typeof playPromise.then === 'function') {
        try {
          await playPromise
        } catch {}
      }
    }
    await refreshCameras()
  } catch (err) {
    console.error('Camera error', err)
    capturing.value = false
    if (err?.name === 'NotAllowedError') {
      cameraError.value = 'เบราว์เซอร์ไม่อนุญาตให้ใช้กล้อง กรุณาอนุญาต'
    } else if (err?.name === 'NotFoundError') {
      cameraError.value = 'ไม่พบอุปกรณ์กล้อง'
    } else {
      cameraError.value = 'ไม่สามารถเปิดกล้องได้: ' + (err?.message || 'Unknown error')
    }
  }
}

const stopCamera = () => {
  capturing.value = false
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop())
    mediaStream = null
  }
}

const capturePhoto = () => {
  if (!capturing.value || !videoRef.value || !canvasRef.value || !mediaStream) return
  const video = videoRef.value
  if (!video.videoWidth || !video.videoHeight) return
  const canvas = canvasRef.value
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  photoDataUrl.value = canvas.toDataURL('image/jpeg')
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
  const toDataURL = (blob) =>
    new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.readAsDataURL(blob)
    })
  const baseDataUrl = await new Promise((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.readAsDataURL(file)
  })
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
  if (unit === 'หลอด') return 3
  if (unit === 'ถุง') return 1
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
    clinicLocation.value = 'ไทยดริว-สิริสิน'
    temp.value = ''
    bp.value = ''
    pulse.value = ''
    rr.value = ''
    spo2.value = ''
    symptoms.value = ''
    diagnosis.value = ''
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
    stopCamera()
  } catch (err) {
    console.error('Save checkup error', err)
    message.value = 'Failed to save. Please try again.'
    showToast('error', 'บันทึกล้มเหลว')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  refreshCameras()
})

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
          <div>
            <label class="block text-xs font-medium mb-1">BP (mmHg)</label>
            <input v-model="bp" type="text" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue" placeholder="120/80" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Pulse (bpm)</label>
            <input v-model="pulse" type="number" min="30" max="250" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue" placeholder="72" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">RR (/min)</label>
            <input v-model="rr" type="number" min="5" max="60" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue" placeholder="16" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Temp (°C)</label>
            <input v-model="temp" type="number" step="0.1" min="30" max="45" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue" placeholder="36.5" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">SpO2 (%)</label>
            <input v-model="spo2" type="number" min="50" max="100" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue" placeholder="98" />
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
            <textarea
              v-model="diagnosis"
              rows="3"
              placeholder="วินิจฉัย"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
              @blur="formatDiagnosisOnBlur"
            ></textarea>
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
          <div class="relative w-full aspect-video bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center">
            <video
              ref="videoRef"
              autoplay
              playsinline
              class="w-full h-full object-cover"
            ></video>
            <canvas ref="canvasRef" class="hidden"></canvas>
            <div
              v-if="!capturing"
              class="absolute inset-0 flex items-center justify-center text-xs text-slate-400"
            >
              {{ cameraError || 'ปิดกล้อง' }}
            </div>
          </div>

          <div class="flex gap-2 text-xs">
            <button
              type="button"
              class="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-clinic-border dark:border-slate-600 px-2 py-1.5 hover:bg-clinic-light dark:hover:bg-slate-800"
              @click="startCamera"
            >
              <i class="fa-solid fa-camera"></i>
              <span>เปิดกล้อง</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center justify-center gap-1 rounded-lg border border-clinic-border dark:border-slate-600 px-2 py-1.5 hover:bg-clinic-light dark:hover:bg-slate-800"
              @click="stopCamera"
            >
              <i class="fa-solid fa-stop"></i>
            </button>
            <button
              type="button"
              class="inline-flex items-center justify-center gap-1 rounded-lg border border-clinic-border dark:border-slate-600 px-2 py-1.5 hover:bg-clinic-light dark:hover:bg-slate-800"
              @click="triggerFileSelect"
            >
              <i class="fa-solid fa-upload"></i>
              <span>อัปโหลดรูป</span>
            </button>
          </div>

          <button
            type="button"
            :disabled="!capturing"
            class="w-full inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs"
            :class="capturing ? 'bg-clinic-blue text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'"
            @click="capturePhoto"
          >
            <i class="fa-solid fa-circle-dot"></i>
            <span>ถ่ายภาพ</span>
          </button>

          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onFileSelected"
          />

          <div v-if="photoDataUrl" class="mt-2">
            <div class="text-[11px] text-slate-500 mb-1">
              ภาพถ่ายผู้ป่วย
            </div>
            <div class="relative">
              <img
                :src="photoDataUrl"
                alt="Captured"
                class="w-full rounded-lg border border-clinic-border dark:border-slate-700"
              />
              <button
                type="button"
                class="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/70"
                title="Remove photo"
                @click="clearPhoto"
              >
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
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
</template>
