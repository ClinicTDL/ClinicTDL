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

  try {
    const faUrl = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2'
    const fa = new FontFace('FontAwesome', `url(${faUrl}) format('woff2')`)
    await fa.load()
    document.fonts.add(fa)
  } catch {}

  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  // ── Canvas dimensions: กว้างพอดี ลดความสูง ──
  const W = 1280
  const H = 780
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const isDark = document.documentElement.classList.contains('dark')

  const c = isDark ? {
    bg:          '#0a0f1e',
    surface:     '#111827',
    surfaceAlt:  '#1a2235',
    border:      '#1e3a5f',
    accent:      '#3b82f6',
    accentSoft:  '#172554',
    text:        '#f0f6ff',
    textMuted:   '#7d8fa8',
    textDim:     '#2d3f55',
    successBg:   'rgba(16,185,129,0.12)',
    successText: '#34d399',
    dangerBg:    'rgba(239,68,68,0.12)',
    dangerText:  '#f87171',
    rowOdd:      'rgba(59,130,246,0.05)',
    pill:        '#172554',
    pillText:    '#93c5fd',
  } : {
    bg:          '#edf1f7',
    surface:     '#ffffff',
    surfaceAlt:  '#f4f7fc',
    border:      '#ccd8ec',
    accent:      '#2563eb',
    accentSoft:  '#dbeafe',
    text:        '#0f172a',
    textMuted:   '#64748b',
    textDim:     '#b0bdd0',
    successBg:   '#ecfdf5',
    successText: '#059669',
    dangerBg:    '#fef2f2',
    dangerText:  '#dc2626',
    rowOdd:      '#f0f7ff',
    pill:        '#dbeafe',
    pillText:    '#1d4ed8',
  }

  // ════════════════════════════════
  // BACKGROUND
  // ════════════════════════════════
  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, W, H)

  // Dot grid
  ctx.fillStyle = isDark ? 'rgba(59,130,246,0.06)' : 'rgba(37,99,235,0.045)'
  for (let x = 24; x < W; x += 36) {
    for (let y = 24; y < H; y += 36) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill()
    }
  }

  // Corner glow blobs
  const blob1 = ctx.createRadialGradient(0, 0, 0, 0, 0, 260)
  blob1.addColorStop(0, isDark ? 'rgba(59,130,246,0.15)' : 'rgba(37,99,235,0.09)')
  blob1.addColorStop(1, 'transparent')
  ctx.fillStyle = blob1; ctx.fillRect(0, 0, 260, 260)

  const blob2 = ctx.createRadialGradient(W, H, 0, W, H, 240)
  blob2.addColorStop(0, isDark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.07)')
  blob2.addColorStop(1, 'transparent')
  ctx.fillStyle = blob2; ctx.fillRect(W - 240, H - 240, 240, 240)

  // ════════════════════════════════
  // HEADER BAR
  // ════════════════════════════════
  const HEAD_H = 68
  const hGrad = ctx.createLinearGradient(0, 0, W, 0)
  hGrad.addColorStop(0,   '#1e3a8a')
  hGrad.addColorStop(0.4, '#2563eb')
  hGrad.addColorStop(0.75,'#4f46e5')
  hGrad.addColorStop(1,   '#7c3aed')
  ctx.fillStyle = hGrad
  ctx.fillRect(0, 0, W, HEAD_H)
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(0, 0, W, 1)

  // Logo circle
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.beginPath(); ctx.arc(38, HEAD_H / 2, 23, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  _faIcon(ctx, '\uf0f8', 38, HEAD_H / 2 + 7, 19)

  // Title
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 22px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.textAlign = 'left'
  ctx.fillText('Medical Record', 72, HEAD_H / 2 - 4)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '400 13px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.fillText('ระบบบันทึกการรักษาของ TDL CLinic', 72, HEAD_H / 2 + 15)

  // Right meta — ขนาดใหญ่ขึ้น อ่านง่ายขึ้น
  const p   = exportData.value
  const emp = p?.employees || {}
  const loc = p?.clinic_location || '-'
  const dtStr = new Date(p?.created_at || Date.now()).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })
  const dr     = p?.creator?.full_name || '-'
  const drCode = p?.creator?.emp_code ? ` (${p.creator.emp_code})` : ''

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.font = '400 13px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.fillText(`สถานที่: ${loc}`, W - 22, HEAD_H / 2 - 12)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = '500 15px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.fillText(dtStr, W - 22, HEAD_H / 2 + 8)
  ctx.fillStyle = '#bfdbfe'
  ctx.font = '600 14px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.fillText(`ผู้ตรวจ: ${dr}${drCode}`, W - 22, HEAD_H / 2 + 28)
  ctx.textAlign = 'left'

  // ════════════════════════════════
  // LAYOUT
  // ════════════════════════════════
  const PAD    = 14
  const bodyY  = HEAD_H + PAD
  const bodyH  = H - HEAD_H - PAD * 2
  const LEFT_W = 252
  const leftX  = PAD
  const rightX = leftX + LEFT_W + PAD
  const RIGHT_W = W - rightX - PAD

  // ════════════════════════════════
  // LEFT — PROFILE CARD
  // ════════════════════════════════
  _card(ctx, leftX, bodyY, LEFT_W, bodyH, c.surface, c.border, 16, isDark)

  // Top gradient band
  const pGrad = ctx.createLinearGradient(leftX, bodyY, leftX + LEFT_W, bodyY + 130)
  pGrad.addColorStop(0, '#1e3a8a')
  pGrad.addColorStop(1, '#4f46e5')
  ctx.fillStyle = pGrad
  _roundRect(ctx, leftX, bodyY, LEFT_W, 130, 16, true); ctx.fill()

  // Decorative circles
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.beginPath(); ctx.arc(leftX + LEFT_W + 10, bodyY + 18, 60, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(leftX - 10, bodyY + 100, 45, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = '500 12px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.textAlign = 'center'
  ctx.fillText('ข้อมูลผู้ป่วย', leftX + LEFT_W / 2, bodyY + 22)

  // Avatar — ขนาดใหญ่ขึ้น
  const AV_R  = 54
  const AV_CX = leftX + LEFT_W / 2
  const AV_CY = bodyY + 130
  await _drawAvatar(ctx, p?.image_url || '', AV_CX, AV_CY, AV_R, c, isDark)

  // Profile fields
  const profFields = [
    { label: 'ชื่อ-สกุล',        value: emp.fullname || '-',     icon: '\uf007', bold: true  },
    { label: 'รหัสพนักงาน',      value: emp.employee_code || '-', icon: '\uf2bb', bold: true  },
    { label: 'ตำแหน่ง',          value: emp.position || '-',      icon: '\uf0b1', bold: false },
    { label: 'หน่วยงาน',         value: emp.department || '-',    icon: '\uf1ad', bold: false },
    { label: 'บริษัท / โครงการ', value: (emp.company || '-') + (emp.project ? ` (${emp.project})` : ''), icon: '\uf279', bold: false },
  ]

  let py = AV_CY + AV_R + 20
  for (const f of profFields) {
    // Divider
    if (py > AV_CY + AV_R + 20) {
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(37,99,235,0.09)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(leftX + 16, py - 5)
      ctx.lineTo(leftX + LEFT_W - 16, py - 5)
      ctx.stroke()
    }

    // Icon circle
    ctx.fillStyle = isDark ? c.accentSoft : '#eff6ff'
    ctx.beginPath(); ctx.arc(leftX + 28, py + 9, 13, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = c.accent
    _faIcon(ctx, f.icon, leftX + 28, py + 14, 12)

    // Label
    ctx.fillStyle = c.textMuted
    ctx.font = '400 11px "SF Thonburi","Noto Sans Thai",Arial'
    ctx.textAlign = 'left'
    ctx.fillText(f.label, leftX + 47, py + 5)

    // Value — ขนาดฟอนต์ unified สม่ำเสมอ
    ctx.fillStyle = c.text
    ctx.font = `${f.bold ? '700' : '500'} 13px "SF Thonburi","Noto Sans Thai",Arial`
    let val = String(f.value)
    const maxW = LEFT_W - 60
    while (ctx.measureText(val).width > maxW && val.length > 4) val = val.slice(0, -4) + '…'
    ctx.fillText(val, leftX + 47, py + 21)
    py += 38
  }
  ctx.textAlign = 'left'

  // ════════════════════════════════
  // RIGHT COLUMN
  // ════════════════════════════════
  let ry  = bodyY
  const GAP = 10

  // ── VITALS ──────────────────────
  const VH = 96
  _card(ctx, rightX, ry, RIGHT_W, VH, c.surface, c.border, 14, isDark)

  // Section title
  ctx.fillStyle = c.accent
  _faIcon(ctx, '\uf21e', rightX + 18, ry + 22, 14)
  ctx.fillStyle = c.text
  ctx.font = '700 15px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.fillText('สัญญาณชีพ (Vital Signs)', rightX + 38, ry + 22)

  const vitals = [
    { icon: '\uf08d', label: 'Blood Pressure', value: p?.bp || '-',    unit: 'mmHg', color: '#ef4444' },
    { icon: '\uf21e', label: 'Pulse Rate',     value: p?.pulse != null ? String(p.pulse) : '-', unit: 'bpm',  color: '#f97316' },
    { icon: '\uf72e', label: 'Resp. Rate',     value: p?.rr   != null ? String(p.rr)    : '-', unit: '/min', color: '#06b6d4' },
    { icon: '\uf2c8', label: 'Temperature',    value: p?.temp != null ? String(p.temp)  : '-', unit: '°C',   color: '#8b5cf6' },
  ]

  const VB_W = Math.floor((RIGHT_W - 32) / 4) - 4
  const VB_H = 56
  const VB_Y = ry + 30  // เริ่มต้นวาด vital box ภายในการ์ด

  for (let i = 0; i < 4; i++) {
    const bx = rightX + 14 + i * (VB_W + 5)

    // Card bg ก่อน
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(37,99,235,0.04)'
    _roundRect(ctx, bx, VB_Y, VB_W, VB_H, 10); ctx.fill()
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : c.border
    ctx.lineWidth = 1; ctx.stroke()

    // Accent bar — วาดด้วย clip เพื่อให้อยู่ภายใน card เท่านั้น
    ctx.save()
    _roundRect(ctx, bx, VB_Y, VB_W, VB_H, 10)
    ctx.clip()
    ctx.fillStyle = vitals[i].color
    ctx.fillRect(bx, VB_Y, 4, VB_H)
    ctx.restore()

    // Icon
    ctx.fillStyle = vitals[i].color
    _faIcon(ctx, vitals[i].icon, bx + 18, VB_Y + 18, 12)

    // Label
    ctx.fillStyle = c.textMuted
    ctx.font = '400 11px "SF Thonburi","Noto Sans Thai",Arial'
    ctx.fillText(vitals[i].label, bx + 30, VB_Y + 17)

    // Value — ขนาดสมดุล
    ctx.fillStyle = c.text
    ctx.font = '700 22px "SF Thonburi","Noto Sans Thai",Arial'
    ctx.fillText(vitals[i].value, bx + 12, VB_Y + 46)

    // Unit
    ctx.fillStyle = vitals[i].color
    ctx.font = '500 11px "SF Thonburi","Noto Sans Thai",Arial'
    ctx.textAlign = 'right'
    ctx.fillText(vitals[i].unit, bx + VB_W - 8, VB_Y + 48)
    ctx.textAlign = 'left'
  }
  ry += VH + GAP

  // ── SYMPTOMS + DIAGNOSIS ────────
  const CLIN_H = 70
  const halfW  = Math.floor((RIGHT_W - GAP) / 2)
  _infoCard2(ctx, rightX, ry, halfW, CLIN_H, '\uf0f1', 'อาการ (Symptoms)', p?.symptoms || '-', '#06b6d4', c, isDark)
  _infoCard2(ctx, rightX + halfW + GAP, ry, halfW, CLIN_H, '\uf46b', 'การวินิจฉัย (Diagnosis)', p?.diagnosis || '-', c.accent, c, isDark)
  ry += CLIN_H + GAP

  // ── ALLERGY BANNER ──────────────
  const hasAlert = !!(emp.drug_allergy || emp.congenital_disease)
  const AL_H = 40
  ctx.fillStyle = hasAlert ? c.dangerBg : c.successBg
  _roundRect(ctx, rightX, ry, RIGHT_W, AL_H, 10); ctx.fill()
  ctx.strokeStyle = hasAlert
    ? (isDark ? 'rgba(239,68,68,0.35)' : 'rgba(220,38,38,0.25)')
    : (isDark ? 'rgba(16,185,129,0.3)' : 'rgba(5,150,105,0.18)')
  ctx.lineWidth = 1; ctx.stroke()

  ctx.fillStyle = hasAlert ? c.dangerText : c.successText
  _faIcon(ctx, hasAlert ? '\uf071' : '\uf058', rightX + 18, ry + 26, 14)
  ctx.font = `${hasAlert ? '700' : '500'} 13px "SF Thonburi","Noto Sans Thai",Arial`
  const alTxt = hasAlert
    ? [emp.drug_allergy ? `แพ้ยา: ${emp.drug_allergy}` : '', emp.congenital_disease ? `โรคประจำตัว: ${emp.congenital_disease}` : ''].filter(Boolean).join('   •   ')
    : 'ไม่มีประวัติแพ้ยาหรือโรคประจำตัว'
  ctx.fillText(alTxt, rightX + 38, ry + 26)
  ry += AL_H + GAP

  // ── LEAVE + REMARK ──────────────
  const LEAVE_H = 60
  let leaveText = '-', leaveBadge = 'ไม่มีการลา'
  let leaveBg = isDark ? 'rgba(100,116,139,0.12)' : '#f1f5f9'
  let leaveFg = c.textMuted
  if (p?.is_leave_allowed === false) {
    leaveText = 'ไม่อนุญาตให้พัก'; leaveBadge = 'ไม่อนุญาต'
    leaveBg = c.dangerBg; leaveFg = c.dangerText
  } else if (p?.is_leave_allowed === true) {
    leaveText = `${formatDateYY(p?.leave_start)}  →  ${formatDateYY(p?.leave_end)}`
    leaveBadge = `${p?.total_leave_days || 0} วัน`
    leaveBg = c.successBg; leaveFg = c.successText
  }

  _infoCard2(ctx, rightX, ry, halfW, LEAVE_H, '\uf073', 'การลาพัก', leaveText, '#10b981', c, isDark)

  // Badge
  const BADGE_W = 84
  ctx.fillStyle = leaveBg
  _roundRect(ctx, rightX + halfW - BADGE_W - 10, ry + 16, BADGE_W, 26, 13); ctx.fill()
  ctx.fillStyle = leaveFg
  ctx.font = '700 13px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.textAlign = 'center'
  ctx.fillText(leaveBadge, rightX + halfW - BADGE_W / 2 - 10, ry + 33)
  ctx.textAlign = 'left'

  _infoCard2(ctx, rightX + halfW + GAP, ry, halfW, LEAVE_H, '\uf27b', 'หมายเหตุ', p?.remark || '-', c.textMuted, c, isDark)
  ry += LEAVE_H + GAP

  // ════════════════════════════════
  // DISPENSING TABLE
  // ════════════════════════════════
  const tblH = H - ry - PAD
  _card(ctx, rightX, ry, RIGHT_W, tblH, c.surface, c.border, 14, isDark)

  // Header gradient
  const thGrad = ctx.createLinearGradient(rightX, ry, rightX + RIGHT_W, ry)
  thGrad.addColorStop(0, '#1e3a8a'); thGrad.addColorStop(1, '#4338ca')
  ctx.fillStyle = thGrad
  _roundRect(ctx, rightX, ry, RIGHT_W, 44, 14, true); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  _roundRect(ctx, rightX, ry, RIGHT_W, 22, 14, true); ctx.fill()

  ctx.fillStyle = '#ffffff'
  _faIcon(ctx, '\uf484', rightX + 20, ry + 29, 15)
  ctx.font = '700 15px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.fillText('การจ่ายยา  (Dispensing Records)', rightX + 42, ry + 29)

  const items = (p?.dispensing_records || []).map((d, i) => ({
    no: i + 1,
    name: d.medicine?.name || '-',
    qty:  d.amount || 0,
    unit: d.medicine?.unit || '-'
  })).slice(0, 9)

  const COL_NO   = 48
  const COL_QTY  = 84
  const COL_UNIT = 90
  const COL_NAME = RIGHT_W - COL_NO - COL_QTY - COL_UNIT - 44

  // Column header
  let ty = ry + 44
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(37,99,235,0.04)'
  ctx.fillRect(rightX, ty, RIGHT_W, 28)
  ctx.fillStyle = c.textMuted
  ctx.font = '600 12px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.fillText('#',                  rightX + 16,                               ty + 19)
  ctx.fillText('ชื่อยา / Medicine',  rightX + COL_NO + 12,                     ty + 19)
  ctx.textAlign = 'right'
  ctx.fillText('จำนวน',              rightX + COL_NO + COL_NAME + COL_QTY - 8, ty + 19)
  ctx.textAlign = 'left'
  ctx.fillText('หน่วย',              rightX + COL_NO + COL_NAME + COL_QTY + 10, ty + 19)
  ty += 28

  ctx.strokeStyle = c.border; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(rightX, ty); ctx.lineTo(rightX + RIGHT_W, ty); ctx.stroke()

  const ROW_H = items.length > 0
    ? Math.min(40, Math.max(32, Math.floor((tblH - 80) / items.length)))
    : 40

  for (let i = 0; i < items.length; i++) {
    const it  = items[i]
    const ry2 = ty + i * ROW_H

    if (i % 2 === 0) {
      ctx.fillStyle = c.rowOdd
      ctx.fillRect(rightX, ry2, RIGHT_W, ROW_H)
    }

    // No badge
    ctx.fillStyle = c.pill
    _roundRect(ctx, rightX + 10, ry2 + (ROW_H - 22) / 2, 30, 22, 6); ctx.fill()
    ctx.fillStyle = c.pillText
    ctx.font = '700 12px "SF Thonburi","Noto Sans Thai",Arial'
    ctx.textAlign = 'center'
    ctx.fillText(String(it.no), rightX + 25, ry2 + ROW_H / 2 + 5)
    ctx.textAlign = 'left'

    // Name
    ctx.fillStyle = c.text
    ctx.font = '500 13px "SF Thonburi","Noto Sans Thai",Arial'
    let nm = String(it.name)
    while (ctx.measureText(nm).width > COL_NAME - 10 && nm.length > 4) nm = nm.slice(0, -4) + '…'
    ctx.fillText(nm, rightX + COL_NO + 10, ry2 + ROW_H / 2 + 5)

    // Qty pill
    const QTY_W = 44
    ctx.fillStyle = isDark ? 'rgba(59,130,246,0.2)' : '#dbeafe'
    _roundRect(ctx, rightX + COL_NO + COL_NAME + COL_QTY - QTY_W - 8, ry2 + (ROW_H - 22) / 2, QTY_W, 22, 11); ctx.fill()
    ctx.fillStyle = c.accent
    ctx.font = '700 13px "SF Thonburi","Noto Sans Thai",Arial'
    ctx.textAlign = 'center'
    ctx.fillText(String(it.qty), rightX + COL_NO + COL_NAME + COL_QTY - QTY_W / 2 - 8, ry2 + ROW_H / 2 + 5)
    ctx.textAlign = 'left'

    // Unit
    ctx.fillStyle = c.textMuted
    ctx.font = '400 13px "SF Thonburi","Noto Sans Thai",Arial'
    ctx.fillText(it.unit, rightX + COL_NO + COL_NAME + COL_QTY + 10, ry2 + ROW_H / 2 + 5)

    // Row line
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(37,99,235,0.055)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(rightX + 8, ry2 + ROW_H)
    ctx.lineTo(rightX + RIGHT_W - 8, ry2 + ROW_H)
    ctx.stroke()
  }

  if (!items.length) {
    ctx.fillStyle = c.textDim
    ctx.font = '400 14px "SF Thonburi","Noto Sans Thai",Arial'
    ctx.textAlign = 'center'
    ctx.fillText('ไม่มีการจ่ายยา', rightX + RIGHT_W / 2, ty + 40)
    ctx.textAlign = 'left'
  }

  // Summary
  const totalMed = items.reduce((s, it) => s + it.qty, 0)
  const sumY = ry + tblH - 36
  const SUM_W = 230
  ctx.fillStyle = isDark ? 'rgba(59,130,246,0.12)' : '#eff6ff'
  _roundRect(ctx, rightX + RIGHT_W - SUM_W - 12, sumY, SUM_W, 28, 8); ctx.fill()
  ctx.strokeStyle = isDark ? 'rgba(59,130,246,0.3)' : '#bfdbfe'
  ctx.lineWidth = 1; ctx.stroke()
  ctx.fillStyle = c.accent
  _faIcon(ctx, '\uf0fe', rightX + RIGHT_W - SUM_W, sumY + 19, 12)
  ctx.fillStyle = c.text
  ctx.font = '600 13px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.textAlign = 'right'
  ctx.fillText(`รวม  ${items.length} รายการ  •  ${totalMed} หน่วย`, rightX + RIGHT_W - 14, sumY + 19)
  ctx.textAlign = 'left'

  // Footer
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(37,99,235,0.22)'
  ctx.font = '400 11px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.textAlign = 'center'
  ctx.fillText('เอกสารนี้สร้างโดยระบบอัตโนมัติ  •  Medical Record System', W / 2, H - 5)
  ctx.textAlign = 'left'
}

// ══════════════════════════════════════════════════════════
// HELPER FUNCTIONS (แทนที่ทุก helper เก่า)
// ══════════════════════════════════════════════════════════

function _faIcon(ctx, unicode, x, y, size) {
  // Render FontAwesome icon using Unicode glyph
  // Requires FontAwesome font loaded in document.fonts
  ctx.save()
  ctx.font = `900 ${size}px FontAwesome`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(unicode, x, y)
  ctx.restore()
}

function _roundRect(ctx, x, y, w, h, r, topOnly = false) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  if (topOnly) {
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x, y + h)
  } else {
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
  }
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  return ctx
}

function _card(ctx, x, y, w, h, bg, border, r, isDark) {
  ctx.shadowColor = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(37,99,235,0.10)'
  ctx.shadowBlur = 20
  ctx.shadowOffsetY = 4
  ctx.fillStyle = bg
  _roundRect(ctx, x, y, w, h, r); ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
  ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke()
}

function _infoCard2(ctx, x, y, w, h, faUnicode, label, value, iconColor, c, isDark) {
  ctx.fillStyle = c.surfaceAlt
  _roundRect(ctx, x, y, w, h, 10); ctx.fill()
  ctx.strokeStyle = c.border; ctx.lineWidth = 1; ctx.stroke()

  // Icon + label
  ctx.fillStyle = iconColor
  _faIcon(ctx, faUnicode, x + 18, y + 18, 12)
  ctx.fillStyle = c.textMuted
  ctx.font = '500 11px "SF Thonburi","Noto Sans Thai",Arial'
  ctx.fillText(label, x + 32, y + 18)

  // Value
  ctx.fillStyle = c.text
  ctx.font = '600 13px "SF Thonburi","Noto Sans Thai",Arial'
  let val = String(value)
  const maxW = w - 28
  while (ctx.measureText(val).width > maxW && val.length > 4) val = val.slice(0, -4) + '…'
  ctx.fillText(val, x + 14, y + h - 14)
}

async function _drawAvatar(ctx, url, cx, cy, r, c, isDark) {
  // Gradient ring
  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
  grad.addColorStop(0, '#3b82f6')
  grad.addColorStop(1, '#7c3aed')
  ctx.fillStyle = grad
  ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.fill()
  // White gap
  ctx.fillStyle = c.surface
  ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill()
  // Clip photo
  const img = await loadImgs(url)
  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2)
  } else {
    ctx.fillStyle = isDark ? '#1a2235' : '#dbeafe'
    ctx.fill()
    ctx.fillStyle = isDark ? '#3b82f6' : '#2563eb'
    _faIcon(ctx, '\uf007', cx, cy + 8, r * 0.8)
  }
  ctx.restore()
}

// loadImg ยังคงใช้ฟังก์ชันเดิม (ไม่เปลี่ยน)
function loadImgs(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => resolve(i)
    i.onerror = () => resolve(null)
    i.src = url
  })
}

// Helper เก่า (roundRect, drawCircleImage, drawField, wrapCenterText, drawTableHeader)
// ลบทิ้งได้เลย ไม่ได้ใช้แล้ว

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
    let selectStr = `
      id,
      employee_id,
      created_at,
      symptoms,
      diagnosis,
      image_url,
      leave_start,
      leave_end,
      total_leave_days,
      employees${department.value || searchAll.value ? '!inner' : ''}(employee_code, fullname, position, department),
      creator:system_users!created_by(full_name),
      dispensing_records(amount)
    `
    let query = supabase
      .from('checkups')
      .select(selectStr)
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

    if (department.value) {
      query = query.eq('employees.department', department.value)
    }

    if (searchAll.value) {
      const term = searchAll.value.toString().trim()
      // ค้นหาพนักงานที่ตรงกับชื่อหรือรหัสก่อน เพื่อเอา IDs มาใช้กรองข้ามตาราง (OR)
      const { data: empMatches } = await supabase
        .from('employees')
        .select('id')
        .or(`employee_code.ilike.%${term}%,fullname.ilike.%${term}%`)
        .limit(100)
      
      const matchIds = (empMatches || []).map(e => e.id)
      let orConditions = `symptoms.ilike.%${term}%,diagnosis.ilike.%${term}%`
      
      if (matchIds.length > 0) {
        orConditions += `,employee_id.in.(${matchIds.join(',')})`
      }
      query = query.or(orConditions)
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

const getThumb = (u) => {
  if (!u) return ''
  const m = u.match(/\/d\/([A-Za-z0-9_-]+)/) || u.match(/[?&]id=([A-Za-z0-9_-]+)/)
  if (m) return `https://drive.google.com/uc?export=view&id=${m[1]}`
  if (/^[A-Za-z0-9_-]{20,}$/.test(u) && !u.startsWith('http')) {
    return `https://drive.google.com/uc?export=view&id=${u}`
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
            <th class="py-2 pr-3 text-center">วันที่</th>
            <!-- <th class="py-2 pr-3">รหัสพนักงาน</th> -->
            <th class="py-2 pr-3 text-center">ชื่อ-นามสกุล</th>
            <th class="py-2 pr-3 text-center">ตำแหน่ง</th>
            <th class="py-2 pr-3 text-center">อาการ และ แพทย์วินิจฉัย</th>
            <!-- <th class="py-2 pr-3">แพทย์วินิจฉัย</th> -->
            <th class="py-2 pr-3 text-center">วันเริ่มต้น-สิ้นสุดการพัก</th>
            <!-- <th class="py-2 pr-3 text-right">จำนวนวันพัก</th> -->
            <th class="py-2 pr-3 text-center">จำนวนยาที่เบิก</th>
            <th class="py-2 pr-3 text-center">รูปภาพ</th>
            <th class="py-2 pr-3 text-center">ตรวจโดย</th>
            <th class="py-2 pr-3 text-center">ส่งออก</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="10" class="py-8 text-center">
              <div class="flex flex-col items-center gap-2">
                <i class="fa-solid fa-circle-notch fa-spin text-2xl text-clinic-blue"></i>
                <span class="text-slate-500 animate-pulse">กำลังโหลดข้อมูล...</span>
              </div>
            </td>
          </tr>
          <tr
            v-else
            v-for="r in records"
            :key="r.id"
            class="border-b border-clinic-border/60 dark:border-slate-800 text-center dark:text-white"
          >
            <td class="py-1.5 pr-3 whitespace-nowrap">
              {{ new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'short'}) }} <br> <span class="bg-fuchsia-100 dark:bg-fuchsia-800/40 text-center text-[10px] border border-fuchsia-200 dark:border-fuchsia-800/40 px-1.5 rounded-full italic text-fuchsia-600 dark:text-fuchsia-400"> {{ new Date(r.created_at).toLocaleString('en-GB', {timeStyle: 'short' })}}</span>
            </td>
            <!-- <td class="py-1.5 pr-3">{{ r.employee_code }}</td> -->
            <td class="py-1.5 pr-3">{{ r.fullname }} <br> <span class="bg-emerald-100 dark:bg-emerald-800/40 text-center text-[10px] italic text-emerald-600 dark:text-emerald-400 px-1.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">{{ r.employee_code }}</span></td>
            <!-- <td class="py-1.5 pr-3">{{ r.position }}</td> -->
            <td class="py-1.5 pr-3">{{ r.position }} <br> <span class="bg-teal-100 dark:bg-teal-800/40 text-center text-[10px] italic text-teal-600 dark:text-teal-400 px-1.5 rounded-full border border-teal-200 dark:border-teal-800/40">{{ r.department }}</span></td>
            <!-- <td class="py-1.5 pr-3">{{ r.department }}</td> -->
            <!-- <td class="py-1.5 pr-3">{{ r.symptoms }}</td> -->
            <td class="py-1.5 pr-3">{{ r.symptoms }} <br> <span class="bg-blue-100 dark:bg-blue-800/40 text-sky-600 dark:text-sky-400 text-[11px] px-1.5 rounded-full border border-blue-200 dark:border-blue-800/40">{{ r.diagnosis }}</span></td>
            <td class="py-1.5 pr-3">
              <span v-if="r.leave_start">
                {{ formatDateYY(r.leave_start) }} - {{ formatDateYY(r.leave_end) }} <br> <span class="bg-rose-100 dark:bg-rose-800/40 text-center text-[10px] italic text-rose-600 dark:text-rose-400 px-1.5 rounded-full border border-rose-200 dark:border-rose-800/40 py-0.5">{{ r.total_leave_days > 0 ? r.total_leave_days : '-' }} วัน </span>
              </span>
              <span v-else>-</span>
            </td>
            <!-- <td class="py-1.5 pr-3 text-right">
              {{ r.total_leave_days > 0 ? r.total_leave_days : '-' }}
            </td> -->
            <td class="py-1.5 pr-3 text-right"> <span class="bg-amber-100 dark:bg-amber-800/40 text-amber-600 dark:text-amber-400 text-[11px] px-1.5 rounded-full border border-amber-200 dark:border-amber-800/40">{{ r.amount }} หน่วย</span></td>
            <td class="py-1.5 pr-3">
              <a
                v-if="viewImage(r.image_url)"
                :href="viewImage(r.image_url)"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center justify-center w-16 h-16 rounded border border-clinic-border dark:border-slate-700 overflow-hidden hover:opacity-80 transition-opacity"
                title="คลิกเพื่อดูรูป"
              >
                <img 
                  :src="getThumb(r.image_url)" 
                  alt="Treatment Image" 
                  class="w-full h-full object-cover"
                />
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
          <tr v-if="!loading && !records.length">
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
