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
const frequentOnly = ref(false)
const frequentMinCount = ref(2)
const searchAll = ref('')

// Export as PNG (Profile Card)
const showExportModal = ref(false)
const exportLoading = ref(false)
const exportCanvasRef = ref(null)
const exportData = ref(null)

const formatDateYY = (d) => {
  if (!d) return '-'
  const dt = new Date(d)
  const day = String(dt.getDate()).padStart(2, '0')
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  const year = String(dt.getFullYear()).slice(-2)
  return `${day}/${month}/${year}`
}

const openExportModal = async (row) => {
  exportLoading.value = true
  showExportModal.value = true
  try {
    const { data, error } = await supabase
      .from('checkups')
      .select(`
        *,
        employees:employees(id, employee_code, fullname, position, department, company, project, drug_allergy, congenital_disease),
        creator:system_users!created_by(full_name, emp_code),
        dispensing_records(id, amount, medicine:medicine_list(name, unit))
      `)
      .eq('id', row.id)
      .single()
    if (error) throw error
    exportData.value = data
    await drawExportCanvas()
  } catch (e) {
    console.error('Export load error', e)
  } finally {
    exportLoading.value = false
  }
}

const ensureCanvasFont = async () => {
  try {
    // Prefer local SF-Thonburi; fall back silently if fails
    const url = new URL('../assets/fonts/SF-Thonburi.woff2', import.meta.url).href
    const ff = new FontFace('SF Thonburi', `url(${url}) format('woff2')`)
    await ff.load()
    document.fonts.add(ff)
  } catch {}
}

const drawExportCanvas = async () => {
  const canvas = exportCanvasRef.value
  if (!canvas || !exportData.value) return
  await ensureCanvasFont()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = 1280
  const height = 1000
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const isDark = document.documentElement.classList.contains('dark')
  const colorBg = isDark ? '#1e293b' : '#f1f5f9' // slate-800 : slate-100
  const colorText = isDark ? '#f1f5f9' : '#1e293b' // slate-100 : slate-800
  const labelColor = isDark ? '#94a3b8' : '#64748b' // slate-400 : slate-500
  const borderColor = isDark ? '#334155' : '#cbd5e1' // slate-700 : slate-300
  const subtle = isDark ? '#0f172a' : '#ffffff' // slate-900 : white
  const panel = isDark ? '#1e293b' : '#f8fafc' // slate-800 : slate-50
  const rowAlt = isDark ? '#334155' : '#e2e8f0' // slate-700 : slate-200

  // Background
  ctx.fillStyle = colorBg
  ctx.fillRect(0, 0, width, height)

  // Header right info
  ctx.fillStyle = colorText
  ctx.font = '600 16px "SF Thonburi","Noto Sans Thai", Arial'
  const loc = exportData.value?.clinic_location || '-'
  const dt = new Date(exportData.value?.created_at || Date.now()).toLocaleString('en-UK')
  ctx.textAlign = 'right'
  ctx.fillText(`ที่: ${loc} / ${dt}`, width - 40, 40)
  
  const dr = exportData.value?.creator?.full_name || '-'
  const drCode = exportData.value?.creator?.emp_code ? ` (${exportData.value.creator.emp_code})` : ''
  ctx.fillText(`โดยแพทย์: ${dr}${drCode}`, width - 40, 68)
  ctx.textAlign = 'left'

  // Left card (profile)
  const leftX = 40
  const leftY = 90
  const leftW = 320
  const leftH = height - leftY - 40
  // Card
  ctx.fillStyle = subtle
  roundRect(ctx, leftX, leftY, leftW, leftH, 20).fill()
  
  // Photo circle
  const imgSize = 160
  const imgX = leftX + (leftW - imgSize) / 2
  const imgY = leftY + 35
  const imgUrl = exportData.value?.image_url || ''
  await drawCircleImage(ctx, imgUrl, imgX, imgY, imgSize, imgSize, isDark)
  
  // Texts
  const emp = exportData.value?.employees || {}
  let ty = imgY + imgSize + 50
  ctx.fillStyle = colorText
  ctx.font = '700 18px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.textAlign = 'center'
  ctx.fillText('ข้อมูลคนไข้มารับการรักษา', leftX + leftW / 2, leftY + 28)

  ctx.font = '400 14px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillStyle = labelColor
  ctx.fillText('ชื่อ-สกุล', leftX + leftW / 2, ty); ty += 30
  ctx.font = '700 22px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillStyle = colorText
  ctx.fillText(emp.fullname || '-', leftX + leftW / 2, ty); ty += 45

  ctx.font = '400 14px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillStyle = labelColor
  ctx.fillText('รหัสพนักงาน', leftX + leftW / 2, ty); ty += 30
  ctx.font = '700 22px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillStyle = colorText
  ctx.fillText((emp.employee_code || '-'), leftX + leftW / 2, ty); ty += 55

  ctx.font = '400 14px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillStyle = labelColor
  ctx.fillText('ตำแหน่ง', leftX + leftW / 2, ty); ty += 30
  ctx.font = '500 16px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillStyle = colorText
  wrapCenterText(ctx, emp.position || '-', leftX, leftW, ty, 22); ty += 45

  ctx.font = '400 14px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillStyle = labelColor
  ctx.fillText('หน่วยงาน', leftX + leftW / 2, ty); ty += 30
  ctx.font = '500 16px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillStyle = colorText
  wrapCenterText(ctx, emp.department || '-', leftX, leftW, ty, 22); ty += 45

  ctx.font = '400 14px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillStyle = labelColor
  ctx.fillText('บริษัท / โครงการ', leftX + leftW / 2, ty); ty += 30
  ctx.font = '500 16px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillStyle = colorText
  wrapCenterText(ctx, (emp.company || '-') + (emp.project ? ` (${emp.project})` : ''), leftX, leftW, ty, 22)
  ctx.textAlign = 'left'

  // Divider between panels
  ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(leftX + leftW + 20, leftY + 30)
  ctx.lineTo(leftX + leftW + 20, leftY + leftH - 30)
  ctx.stroke()

  // Right card (exam + dispensing)
  const rightX = leftX + leftW + 60
  const rightY = leftY
  const rightW = width - rightX - 40
  const rightH = leftH
  ctx.fillStyle = subtle
  roundRect(ctx, rightX, rightY, rightW, rightH, 20).fill()

  const p = exportData.value
  let rx = rightX + 40
  let ry = rightY + 50
  ctx.fillStyle = colorText
  ctx.font = '700 22px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillText('ข้อมูลการตรวจ/จ่ายยา', rx, ry)
  ry += 70

  // Vital fields boxes
  const fields = [
    ['BP:', p?.bp || '-'],
    ['Pulse:', p?.pulse != null ? String(p.pulse) : '-'],
    ['RR:', p?.rr != null ? String(p.rr) : '-'],
    ['Temp:', p?.temp != null ? String(p.temp) : '-'],
  ]
  const boxW = Math.floor((rightW - 80) / 4) - 15
  const boxH = 50
  const gapY = 45
  for (let i = 0; i < 4; i++) {
    const bx = rx + i * (boxW + 18)
    drawField(ctx, fields[i][0], fields[i][1], bx, ry, boxW, boxH, colorText, borderColor, panel)
  }
  ry += boxH + gapY

  // Symptoms / Diagnosis
  const halfW = Math.floor((rightW - 80) / 2) - 15
  drawField(ctx, 'Symptoms:', p?.symptoms || '-', rx, ry, halfW, boxH, colorText, borderColor, panel)
  drawField(ctx, 'Diagnosis:', p?.diagnosis || '-', rx + halfW + 18, ry, halfW, boxH, colorText, borderColor, panel)
  ry += boxH + gapY

  // Allergy / Conditions
  const empInfo = p?.employees || {}
  const allergyText = empInfo.drug_allergy ? `แพ้ยา: ${empInfo.drug_allergy}` : ''
  const condText = empInfo.congenital_disease ? `โรคประจำตัว: ${empInfo.congenital_disease}` : ''
  const combined = [allergyText, condText].filter(Boolean).join(' / ') || '-'
  const allergyColor = (empInfo.drug_allergy || empInfo.congenital_disease) ? '#ef4444' : colorText
  drawField(ctx, 'แพ้ยา / โรคประจำตัว:', combined, rx, ry, rightW - 80, boxH, colorText, borderColor, panel, allergyColor)
  ry += boxH + gapY

  // Leave Info / Remark
  let leaveText = '-'
  if (p?.is_leave_allowed === false) {
    leaveText = 'ไม่อนุญาตให้พัก'
  } else if (p?.is_leave_allowed === true) {
    const start = formatDateYY(p?.leave_start)
    const end = formatDateYY(p?.leave_end)
    const days = p?.total_leave_days || 0
    leaveText = `${start} - ${end} (${days} วัน)`
  }
  const remarkText = p?.remark || '-'
  drawField(ctx, 'ข้อมูลการลาพัก:', leaveText, rx, ry, halfW, boxH, colorText, borderColor, panel)
  drawField(ctx, 'หมายเหตุ:', remarkText, rx + halfW + 18, ry, halfW, boxH, colorText, borderColor, panel)
  ry += boxH + gapY

  // Dispensing table
  ctx.font = '700 22px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.fillStyle = colorText
  ctx.fillText('การจ่ายยา', rx, ry)
  ry += 30
  
  const colNo = 60
  const colQty = 80
  const colUnit = 100
  const colName = rightW - 80 - (colNo + colQty + colUnit)
  
  // Header row
  drawTableHeader(ctx, rx, ry, rightW - 80, borderColor, isDark ? '#1e293b' : '#f1f5f9', colorText, [
    { text: 'No', w: colNo },
    { text: 'ชื่อยา', w: colName },
    { text: 'จำนวน', w: colQty },
    { text: 'หน่วย', w: colUnit }
  ])
  ry += 45

  const items = (p?.dispensing_records || []).map((d, i) => ({
    no: i + 1,
    name: d.medicine?.name || '-',
    qty: d.amount || 0,
    unit: d.medicine?.unit || '-'
  })).slice(0, 15)

  ctx.font = '500 16px "SF Thonburi","Noto Sans Thai", Arial'
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx]
    if (idx % 2 === 0) {
      ctx.fillStyle = rowAlt
      roundRect(ctx, rx, ry - 5, rightW - 80, 40, 8).fill()
    }
    ctx.fillStyle = colorText
    ctx.fillText(String(it.no), rx + 15, ry + 22)
    ctx.fillText(it.name, rx + colNo + 10, ry + 22)
    
    ctx.textAlign = 'right'
    ctx.fillText(String(it.qty), rx + colNo + colName + colQty - 20, ry + 22)
    ctx.textAlign = 'left'
    ctx.fillText(it.unit, rx + colNo + colName + colQty + 15, ry + 22)
    
    // row line
    ctx.strokeStyle = isDark ? '#334155' : '#f1f5f9'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(rx, ry + 35)
    ctx.lineTo(rx + rightW - 80, ry + 35)
    ctx.stroke()
    
    ry += 40
  }
  if (!items.length) {
    ctx.fillStyle = colorText
    ctx.font = '500 16px "SF Thonburi","Noto Sans Thai", Arial'
    ctx.fillText('ไม่มีการจ่ายยา', rx + 15, ry + 25)
  }
}

const downloadExportPng = () => {
  const canvas = exportCanvasRef.value
  if (!canvas || !exportData.value) return
  const code = exportData.value?.employees?.employee_code || 'unknown'
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const name = `${code}_${y}${m}${d}.png`
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = name
  link.click()
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

const exportExcel = async () => {
  if (!records.value.length) return
  
  try {
    const XLSX = await ensureXlsx()
    
    // --- Sheet 1: Summary ---
    const deptMap = {}
    records.value.forEach(r => {
      const d = r.department || 'ไม่ระบุ'
      deptMap[d] = (deptMap[d] || 0) + 1
    })
    
    const summaryData = [
      ['รายงานสรุปประวัติการรักษา'],
      ['ช่วงวันที่', `${dateStart.value || 'ทั้งหมด'} ถึง ${dateEnd.value || 'ทั้งหมด'}`],
      ['จำนวนผู้ป่วยทั้งหมด', records.value.length, 'ราย'],
      [],
      ['สรุปตามแผนก', 'จำนวน (ราย)']
    ]
    
    Object.entries(deptMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([dept, count]) => {
        summaryData.push([dept, count])
      })
      
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    
    // --- Sheet 2: Details ---
    const detailHeaders = [
      'Date',
      'Time',
      'รหัสพนักงาน',
      'ชื่อ-นามสกุล',
      'ตำแหน่ง',
      'แผนก',
      'อาการ',
      'แพทย์วินิจฉัย',
      'วันเริ่มต้นการพัก',
      'วันสิ้นสุดการพัก',
      'จำนวนวันพัก',
      'จำนวนยาที่เบิก',
      'ตรวจโดย'
    ]
    
    const detailRows = records.value.map(r => {
      const dt = new Date(r.created_at)
      return [
        dt.toLocaleDateString('en-UK'),
        dt.toLocaleTimeString('en-UK', { hour: '2-digit', minute: '2-digit' }),
        r.employee_code,
        r.fullname,
        r.position,
        r.department,
        r.symptoms,
        r.diagnosis,
        r.leave_start ? new Date(r.leave_start).toLocaleDateString('en-UK') : '-',
        r.leave_end ? new Date(r.leave_end).toLocaleDateString('en-UK') : '-',
        r.total_leave_days > 0 ? r.total_leave_days : '-',
        r.amount,
        r.examiner
      ]
    })
    
    const wsDetails = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows])
    
    // Create Workbook
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
    XLSX.utils.book_append_sheet(wb, wsDetails, 'Treatment Details')
    
    // Export
    const now = new Date()
    const fileName = `Treatment_History_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(wb, fileName)
    
  } catch (err) {
    console.error('Export Excel error', err)
    alert('เกิดข้อผิดพลาดในการส่งออก Excel')
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  return ctx
}

async function drawCircleImage(ctx, url, x, y, w, h, isDark) {
  const img = await loadImg(url)
  const r = Math.min(w, h) / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (img) ctx.drawImage(img, x, y, w, h)
  else {
    ctx.fillStyle = isDark ? '#1e293b' : '#f1f5f9'
    ctx.fillRect(x, y, w, h)
    
    // Draw simple person icon placeholder
    ctx.strokeStyle = isDark ? '#475569' : '#cbd5e1'
    ctx.lineWidth = 3
    ctx.beginPath()
    // Head
    ctx.arc(x + r, y + r - 15, 20, 0, Math.PI * 2)
    // Shoulders
    ctx.moveTo(x + r - 35, y + r + 35)
    ctx.quadraticCurveTo(x + r, y + r + 10, x + r + 35, y + r + 35)
    ctx.stroke()

    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b'
    ctx.font = '700 16px "SF Thonburi","Noto Sans Thai", Arial'
    ctx.textAlign = 'center'
    ctx.fillText('ไม่มีรูป', x + r, y + r + 55)
  }
  ctx.restore()
}

function loadImg(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => resolve(i)
    i.onerror = () => resolve(null)
    i.src = url
  })
}

function drawField(ctx, label, value, x, y, w, h, colorText, borderColor, fill, valueColor) {
  ctx.fillStyle = colorText
  ctx.font = '700 14px "SF Thonburi","Noto Sans Thai", Arial'
  // Draw label even closer to the box
  ctx.fillText(label, x + 5, y - 8)
  
  ctx.fillStyle = fill
  roundRect(ctx, x, y, w, h, 10).fill()
  ctx.strokeStyle = borderColor
  ctx.lineWidth = 1
  ctx.stroke()
  
  ctx.fillStyle = valueColor || colorText
  ctx.font = (valueColor && valueColor !== colorText) ? '700 16px "SF Thonburi","Noto Sans Thai", Arial' : '500 16px "SF Thonburi","Noto Sans Thai", Arial'
  ctx.textBaseline = 'middle'
  const txt = (value ?? '').toString()
  
  // Handle wrapping (better for Thai)
  let lines = []
  let currentLine = ''
  const maxWidth = w - 30
  
  for (let i = 0; i < txt.length; i++) {
    let char = txt[i]
    let testLine = currentLine + char
    let metrics = ctx.measureText(testLine)
    if (metrics.width > maxWidth) {
      lines.push(currentLine)
      currentLine = char
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) lines.push(currentLine)
  
  // Limit to 2 lines to maintain professional look and avoid overlap
  if (lines.length > 2) {
    lines = [lines[0], lines[1].substring(0, lines[1].length - 3) + '...']
  }
  
  const lineH = 20
  const startY = y + (h / 2) - ((lines.length - 1) * lineH / 2)
  
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i].trim(), x + 15, startY + (i * lineH))
  }
  
  // Reset baseline
  ctx.textBaseline = 'alphabetic'
}

function wrapCenterText(ctx, text, x, w, y, lineH) {
  const words = String(text).split(/\s+/)
  let line = ''
  const lines = []
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > w - 32) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  const cx = x + w / 2
  for (const l of lines) {
    ctx.fillText(l, cx, y)
    y += lineH
  }
}

function drawTableHeader(ctx, x, y, w, borderColor, bg, colorText, cols) {
  ctx.fillStyle = bg
  roundRect(ctx, x, y, w, 30, 10).fill()
  ctx.strokeStyle = borderColor
  ctx.stroke()
  ctx.fillStyle = colorText
  ctx.font = '700 14px "SF Thonburi","Noto Sans Thai", Arial'
  let cx = x
  for (const c of cols) {
    ctx.fillText(c.text, cx + 10, y + 20)
    cx += c.w
  }
}

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
        leave_start,
        leave_end,
        total_leave_days,
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
    if (department.value || searchAll.value) {
      const term = (searchAll.value || '').toString().trim()
      let empQuery = supabase.from('employees').select('id').limit(5000)
      if (department.value) empQuery = empQuery.eq('department', department.value)
      if (term) empQuery = empQuery.or(`employee_code.ilike.%${term}%,fullname.ilike.%${term}%`)
      const { data: empRows } = await empQuery
      const ids = (empRows || []).map((e) => e.id)
      if (department.value && !ids.length) {
        records.value = []
        totalCount.value = 0
        return
      }
      if (department.value && ids.length) {
        query = query.in('employee_id', ids)
      }
      if (term) {
        const orParts = [`symptoms.ilike.%${term}%`]
        if (ids.length) orParts.push(`employee_id.in.(${ids.join(',')})`)
        query = query.or(orParts.join(','))
      }
    }

    const { data, error } = await query
    if (error) throw error
    let rows = data || []
    if (frequentOnly.value) {
      const counts = new Map()
      for (const r of rows) {
        const dt = new Date(r.created_at)
        const key = `${r.employee_id}-${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
        counts.set(key, (counts.get(key) || 0) + 1)
      }
      rows = rows.filter((r) => {
        const dt = new Date(r.created_at)
        const key = `${r.employee_id}-${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
        return (counts.get(key) || 0) >= Number(frequentMinCount.value || 2)
      })
    }
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
        leave_start: r?.leave_start || null,
        leave_end: r?.leave_end || null,
        total_leave_days: r?.total_leave_days || 0,
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

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      <div class="flex flex-col xl:col-span-2">
        <label class="text-xs text-slate-600 dark:text-slate-300 mb-1">ค้นหา (ชื่อ/รหัส/อาการ)</label>
        <input v-model="searchAll" type="text" placeholder="เช่น อธีน่า หรือ L2509027 หรือ ปวดหัว ..." class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue" />
      </div>
      <div class="flex flex-col xl:col-span-2">
        <label class="text-xs text-slate-600 dark:text-slate-300 mb-1">วินิจฉัย</label>
        <input v-model="diagnosis" type="text" placeholder="เช่น Headache, Common Cold ..." class="flex-1 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue" />
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-2">
      <div class="flex flex-col">
        <label class="text-xs text-slate-600 dark:text-slate-300 mb-1">ช่วงวันที่</label>
        <div class="grid grid-cols-2 gap-2">
          <input v-model="dateStart" type="date" class="rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue" />
          <input v-model="dateEnd" type="date" class="rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue" />
        </div>
      </div>
      <div class="flex flex-col">
        <label class="text-xs text-slate-600 dark:text-slate-300 mb-1">แผนก</label>
        <select v-model="department" class="rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue">
          <option value="">ทั้งหมด</option>
          <option v-for="d in departments" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="flex flex-col">
          <label class="text-xs text-slate-600 dark:text-slate-300 mb-1">ผู้ตรวจ</label>
          <select v-model="examinerId" class="rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue">
            <option value="">ทั้งหมด</option>
            <option v-for="u in examiners" :key="u.id" :value="u.id">{{ u.name }}</option>
          </select>
        </div>
        <div class="flex flex-col">
          <label class="text-xs text-slate-600 dark:text-slate-300 mb-1">มาบ่อย</label>
          <div class="flex items-center gap-2">
            <input v-model.number="frequentMinCount" type="number" min="2" class="w-20 rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-clinic-blue" />
            <label class="inline-flex items-center gap-2">
              <input v-model="frequentOnly" type="checkbox" class="rounded border-clinic-border text-clinic-blue focus:ring-clinic-blue" />
              <span class="text-xs">ใช้งาน</span>
            </label>
          </div>
        </div>
      </div>
      <div class="md:col-span-2 xl:col-span-3 flex justify-end gap-2">
        <button type="button" class="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs hover:bg-emerald-700" @click="exportExcel">
          <i class="fa-solid fa-file-excel"></i>
          <span>ส่งออก Excel</span>
        </button>
        <button type="button" class="inline-flex items-center justify-center gap-1 rounded-lg bg-clinic-blue text-white px-3 py-2 text-xs hover:bg-blue-700" @click="loadHistory">
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
            <th class="py-2 pr-3">วันเริ่มต้น-สิ้นสุดการพัก</th>
            <th class="py-2 pr-3 text-right">จำนวนวันพัก</th>
            <th class="py-2 pr-3 text-right">จำนวนยาที่เบิก</th>
            <th class="py-2 pr-3">รูปภาพ</th>
            <th class="py-2 pr-3">ตรวจโดย</th>
            <th class="py-2 pr-3 text-right">ส่งออก</th>
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
            <td class="py-1.5 pr-3">
              <span v-if="r.leave_start">
                {{ formatDateYY(r.leave_start) }} - {{ formatDateYY(r.leave_end) }}
              </span>
              <span v-else>-</span>
            </td>
            <td class="py-1.5 pr-3 text-right">
              {{ r.total_leave_days > 0 ? r.total_leave_days : '-' }}
            </td>
            <td class="py-1.5 pr-3 text-right">{{ r.amount }}</td>
            <td class="py-1.5 pr-3">
              <a
                v-if="viewImage(r.image_url)"
                :href="viewImage(r.image_url)"
                target="_blank"
                rel="noopener"
                class="inline-flex flex-col items-center justify-center w-16 h-16 rounded border border-clinic-border dark:border-slate-700 text-slate-400 hover:text-slate-600"
                title="คลิกเพื่อดูรูป"
              >
                <i class="fa-regular fa-image text-xl"></i>
                <span class="text-[10px] mt-0.5">ดูรูปภาพ</span>
              </a>
              <div
                v-else
                class="inline-flex flex-col items-center justify-center w-16 h-16 rounded border border-dashed border-clinic-border dark:border-slate-700 text-slate-300 bg-slate-50 dark:bg-slate-800/50 cursor-default"
                title="ไม่มีรูป"
              >
                <i class="fa-solid fa-image-slash text-xl"></i>
                <span class="text-[10px] mt-0.5">ไม่มีรูป</span>
              </div>
            </td>
            <td class="py-1.5 pr-3">{{ r.examiner }}</td>
            <td class="py-1.5 pr-3 text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 px-2 py-1 rounded border border-clinic-border dark:border-slate-700 hover:bg-clinic-light dark:hover:bg-slate-800"
                @click="openExportModal(r)"
                title="ส่งออกเป็นภาพ PNG"
              >
                <i class="fa-solid fa-image"></i>
                PNG
              </button>
            </td>
          </tr>
          <tr v-if="!records.length">
            <td colspan="10" class="py-4 text-center text-slate-400">
              ไม่พบข้อมูล
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Export Modal -->
    <div v-if="showExportModal" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" @click.self="showExportModal=false">
      <div class="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div class="p-4 border-b border-clinic-border dark:border-slate-700 flex items-center justify-between">
          <div class="font-bold text-lg">ส่งออกข้อมูลผู้ป่วย (PNG)</div>
          <button @click="showExportModal=false" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-times"></i></button>
        </div>
        <div class="p-4 flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
          <div class="text-xs text-slate-500 mb-2">แสดงตัวอย่างก่อนดาวน์โหลด</div>
          <div class="flex items-center justify-center bg-clinic-light dark:bg-slate-800 rounded-xl p-3">
            <canvas ref="exportCanvasRef" class="max-w-full h-auto"></canvas>
          </div>
          <div v-if="exportLoading" class="text-xs text-slate-500 mt-2">กำลังเตรียมข้อมูล...</div>
        </div>
        <div class="p-4 border-t border-clinic-border dark:border-slate-700 flex justify-end gap-2">
          <button type="button" class="px-3 py-2 rounded-lg border border-clinic-border dark:border-slate-700" @click="showExportModal=false">ปิด</button>
          <button type="button" :disabled="exportLoading" class="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50" @click="downloadExportPng">
            <i class="fa-solid fa-download mr-1"></i> ดาวน์โหลด
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
