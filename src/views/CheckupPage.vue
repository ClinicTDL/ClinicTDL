<script setup>
import { onMounted, ref, watch } from 'vue'
import { supabase, supabaseStorage, STORAGE_BUCKET } from '../supabaseClient'

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

const videoRef = ref(null)
const canvasRef = ref(null)
const photoDataUrl = ref('')
const capturing = ref(false)
const cameraError = ref('')
const fileInputRef = ref(null)
const availableCameras = ref([])
const selectedCameraId = ref('')
const toasts = ref([])
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
        .select('id, employee_code, fullname, department, project, status')
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
  if (!videoRef.value || !canvasRef.value) return
  const video = videoRef.value
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
  const reader = new FileReader()
  reader.onload = () => {
    photoDataUrl.value = reader.result
  }
  reader.readAsDataURL(file)
}

const searchMedicines = async () => {
  searchingMedicines.value = true
  try {
    const query = supabase
      .from('medicine_list')
      .select('*')
      .ilike('name', `%${medicineSearch.value}%`)
      .limit(20)
    const { data, error } = await query
    if (error) throw error
    medicineResults.value = data || []
  } catch (err) {
    console.error('Search medicines error', err)
  } finally {
    searchingMedicines.value = false
  }
}

const addMedicine = (med) => {
  if (selectedItems.value.some((i) => i.id === med.id)) return
  selectedItems.value.push({
    id: med.id,
    name: med.name,
    unit: med.unit,
    quantity: 1,
    maxQuantity: med.current_stock || 0,
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
      const mimeMatch = String(photoDataUrl.value).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg'
      const blob = await (await fetch(photoDataUrl.value)).blob()
      const path = name
      const { data: upRes, error: upErr } = await supabaseStorage.storage
        .from(STORAGE_BUCKET)
        .upload(path, blob, { contentType: mimeType, upsert: true })
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
    const ok = confirm('ข้อมูลไม่ครบ ต้องการบันทึกหรือไม่')
    if (!ok) return
  }

  saving.value = true
  message.value = ''

  try {
    const photoFileName = await uploadPhotoToServer()

    const sessionRaw = localStorage.getItem('clinic_tdl_session')
    const session = sessionRaw ? JSON.parse(sessionRaw) : null

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

    const parseDec = (v) => {
      const n = parseFloat(String(v ?? '').toString().replace(',', '.'))
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
    }
    const clamp = (n, min, max) =>
      n == null ? null : Math.max(min, Math.min(max, n))

    const tempNum = clamp(parseDec(temp.value), -99.99, 99.99)
    const bpText = (bp.value ?? '').toString().trim() || null
    const pulseNum = parseDec(pulse.value)
    const rrNum = parseDec(rr.value)
    const spo2Num = clamp(parseDec(spo2.value), 0, 99.99)
    const totalLeaveDaysNum =
      totalLeaveDays.value !== '' && totalLeaveDays.value != null
        ? Number(totalLeaveDays.value)
        : null

    const { data: checkup, error: checkupError } = await supabase
      .from('checkups')
      .insert({
        employee_id: employeeIdToSave,
        clinic_location: clinicLocation.value || null,
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

const showToast = (type, text, timeout = 3000) => {
  const id = Date.now() + Math.random()
  toasts.value.push({ id, type, text })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, timeout)
}

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
    <div class="fixed top-4 right-4 z-50 space-y-2">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="min-w-[220px] rounded-lg px-3 py-2 text-xs shadow-lg"
        :class="t.type === 'success' ? 'bg-emerald-600 text-white' : t.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-800 text-white'"
      >
        {{ t.text }}
      </div>
    </div>
    <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
      Medical Checkup & Dispensing
    </h1>

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
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">โครงการ</label>
            <input
              :value="employeeInfo?.project || ''"
              type="text"
              disabled
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-xs"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label class="block text-xs font-medium mb-1">Temp</label>
            <input v-model="temp" type="number" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">BP</label>
            <input v-model="bp" type="text" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Pulse</label>
            <input v-model="pulse" type="number" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">RR</label>
            <input v-model="rr" type="number" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">SpO2</label>
            <input v-model="spo2" type="number" class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium mb-1">Symptoms</label>
            <textarea
              v-model="symptoms"
              rows="3"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            ></textarea>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Diagnosis</label>
            <textarea
              v-model="diagnosis"
              rows="3"
              class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            ></textarea>
          </div>
          <div class="space-y-3 md:col-span-2">
            <div class="flex items-center gap-2 text-xs">
              <input v-model="isLeaveAllowed" type="checkbox" class="rounded border-clinic-border text-clinic-blue focus:ring-clinic-blue" />
              <span>อนุญาตการลาพัก</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] font-medium mb-1">วันที่เริ่มลาพัก</label>
                <input v-model="leaveStart" type="date" class="w-full rounded border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs" />
              </div>
              <div>
                <label class="block text-[11px] font-medium mb-1">วันที่สิ้นสุดลาพัก</label>
                <input v-model="leaveEnd" type="date" class="w-full rounded border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs" />
              </div>
            </div>
            <div>
              <label class="block text-[11px] font-medium mb-1">จำนวนวันลาพัก</label>
              <input v-model="totalLeaveDays" type="number" min="0" readonly class="w-full rounded border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs" />
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
            class="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-clinic-blue text-white px-2 py-1.5 text-xs hover:bg-blue-700"
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
          class="flex items-center justify-between py-1 px-2 hover:bg-clinic-light dark:hover:bg-slate-800 rounded"
        >
          <div class="flex flex-col">
            <span class="font-medium">{{ med.name }}</span>
            <span class="text-[11px] text-slate-500">
              Stock: {{ med.current_stock || 0 }} {{ med.unit }}
            </span>
          </div>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-1 rounded border border-clinic-border dark:border-slate-600 px-2 py-1 text-[11px]"
            @click="addMedicine(med)"
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
                <input
                  v-model.number="item.quantity"
                  type="number"
                  min="1"
                  :max="item.maxQuantity || undefined"
                  class="w-20 rounded border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                />
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
