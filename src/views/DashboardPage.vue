<script setup>
import { onMounted, ref, watch } from 'vue'
import { supabase } from '../supabaseClient'
import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

// Custom Plugin to draw numbers on chart
const drawValuesPlugin = {
  id: 'drawValues',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    ctx.save()
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i)
      if (!meta.hidden) {
        meta.data.forEach((element, index) => {
          const data = dataset.data[index]
          if (data !== null && data !== undefined && data !== 0) {
            const x = element.x
            const y = element.y
            ctx.fillStyle = dataset.borderColor || dataset.backgroundColor || '#64748b'
            ctx.font = 'bold 10px "SF Thonburi", sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'bottom'
            ctx.fillText(data, x, y - 5)
          }
        })
      }
    })
    ctx.restore()
  }
}

const loading = ref(true)
const summary = ref({
  patientsThisMonth: { value: 0, change: 0 },
  totalStock: { value: 0, change: 0 },
  topDepartment: { name: '-', value: 0, change: 0, percentOfTotal: 0 },
  topDiagnosis: { name: '-', value: 0, change: 0, percentOfTotal: 0 },
  dispensedThisMonth: { value: 0, change: 0 },
})

const kpiLabels = ref([])
const kpiPatients = ref([])
const kpiUsage = ref([])
const prevImported = ref(0)
const prevDispensed = ref(0)
const lineCanvasImage = ref('')
const barCanvasImage = ref('')
const kpiUseFilter = ref(false)
const dayKeyLocal = (d) => {
  const dt = new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const da = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

const lastPatients = ref([])
const topDiagnoses = ref([]) // will hold { diagnosis, count, change }
const medicineStats = ref([]) // { name, diagnosis, dispensedCount, change }
const departmentStats = ref([]) // { department, patientCount, medicineCount, change }
const leaveStats = ref([]) // { department, leaveCount, change }

const deptPageIndex = ref(0)
const leavePageIndex = ref(0)

// Date Filter State
const dateRange = ref('this-month') // this-month, last-month, this-week, last-week, custom
const customStartDate = ref('')
const customEndDate = ref('')

const chartData = ref({
  labels: [],
  datasets: [],
})

const barChartData = ref({
  labels: [],
  datasets: [],
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        font: { family: 'SF Thonburi' },
        color: '#64748b',
      },
    },
    tooltip: {
      titleFont: { family: 'SF Thonburi' },
      bodyFont: { family: 'SF Thonburi' },
    }
  },
  scales: {
    x: {
      ticks: { color: '#64748b', font: { family: 'SF Thonburi' } },
      grid: { display: false, drawBorder: false },
    },
    y: {
      ticks: { color: '#64748b', font: { family: 'SF Thonburi' } },
      grid: { display: false, drawBorder: false },
    },
  },
}

const thaiMonthsShort = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

const thaiMonthsLong = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]

// Watchers to update chart data objects
watch(
  [kpiLabels, kpiPatients, kpiUsage],
  () => {
    chartData.value = {
      labels: kpiLabels.value,
      datasets: [
        {
          label: 'ผู้ป่วย (คน)',
          data: kpiPatients.value,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(248,113,113,0.15)',
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
        {
          label: 'การใช้ยา (หน่วย)',
          data: kpiUsage.value,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.15)',
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
      ],
    }
  },
  { immediate: true },
)

watch(departmentStats, () => {
  const sorted = [...departmentStats.value].sort((a, b) => b.patientCount - a.patientCount).slice(0, 8)
  barChartData.value = {
    labels: sorted.map(d => d.department),
    datasets: [
      {
        label: 'จำนวนผู้ป่วย',
        data: sorted.map(d => d.patientCount),
        backgroundColor: '#ef4444',
        borderRadius: 4,
      },
      {
        label: 'การใช้ยา',
        data: sorted.map(d => d.medicineCount),
        backgroundColor: '#3b82f6',
        borderRadius: 4,
      }
    ]
  }
})

const computeChangePercent = (current, previous) => {
  if (!previous) return 0
  return ((current - previous) / previous) * 100
}

const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10)
const topCounts = (rows, field, limit = 5) => {
  const map = new Map()
  for (const r of rows) {
    const key = (r?.[field] || '').toString().trim() || '-'
    map.set(key, (map.get(key) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
  // return list
}

const loadDashboardData = async () => {
  loading.value = true
  try {
    const now = new Date()
    let startDate, endDate
    let prevStartDate, prevEndDate

    // Calculate dates based on range
    if (dateRange.value === 'this-month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
    } else if (dateRange.value === 'last-month') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      prevEndDate = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59)
    } else if (dateRange.value === 'this-week') {
      const day = now.getDay() || 7
      startDate = new Date(now)
      startDate.setHours(0, 0, 0, 0)
      startDate.setDate(now.getDate() - day + 1)
      endDate = new Date(now)
      endDate.setHours(23, 59, 59, 999)
      prevStartDate = new Date(startDate)
      prevStartDate.setDate(startDate.getDate() - 7)
      prevEndDate = new Date(endDate)
      prevEndDate.setDate(endDate.getDate() - 7)
    } else if (dateRange.value === 'last-week') {
      const day = now.getDay() || 7
      const thisWeekStart = new Date(now)
      thisWeekStart.setHours(0, 0, 0, 0)
      thisWeekStart.setDate(now.getDate() - day + 1)
      startDate = new Date(thisWeekStart)
      startDate.setDate(thisWeekStart.getDate() - 7)
      endDate = new Date(thisWeekStart)
      endDate.setDate(thisWeekStart.getDate() - 1)
      endDate.setHours(23, 59, 59, 999)
      prevStartDate = new Date(startDate)
      prevStartDate.setDate(startDate.getDate() - 7)
      prevEndDate = new Date(endDate)
      prevEndDate.setDate(endDate.getDate() - 7)
    } else if (dateRange.value === 'custom') {
      startDate = customStartDate.value ? new Date(customStartDate.value) : new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = customEndDate.value ? new Date(customEndDate.value) : new Date(now)
      endDate.setHours(23, 59, 59, 999)
      // For custom, compare with previous equal duration
      const diff = endDate.getTime() - startDate.getTime()
      prevStartDate = new Date(startDate.getTime() - diff)
      prevEndDate = new Date(startDate.getTime() - 1)
    }

    const last15Start = new Date(now)
    last15Start.setDate(now.getDate() - 14)
    const kpiStart = kpiUseFilter.value ? startDate : last15Start
    const kpiEnd = kpiUseFilter.value ? endDate : now
    const kpiSpanDays = Math.floor((kpiEnd.getTime() - kpiStart.getTime()) / 86400000) + 1

    // Parallel Fetching
    const [
      patientsRangeRes,
      patientsPrevRes,
      totalStockRes,
      importedRangeRes,
      dispensedRangeRes,
      dispensedPrevRes,
      lastPatientsRes,
      kpiPatientsRes,
      usage15DaysRes,
      allCheckupsRangeRes,
      allCheckupsPrevRes,
      allDispensingRangeRes,
      allDispensingPrevRes
    ] = await Promise.all([
      supabase.from('checkups').select('id, created_at, diagnosis, symptoms, is_leave_allowed, employees(department)').gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
      supabase.from('checkups').select('id, created_at, diagnosis, symptoms, is_leave_allowed, employees(department)').gte('created_at', prevStartDate.toISOString()).lte('created_at', prevEndDate.toISOString()),
      supabase.from('medicine_list').select('id, current_stock'),
      supabase.from('stock_transactions').select('id, quantity, created_at').eq('transaction_type', 'RECEIVE').gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
      supabase.from('dispensing_records').select('id, amount, created_at').gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
      supabase.from('dispensing_records').select('id, amount, created_at').gte('created_at', prevStartDate.toISOString()).lte('created_at', prevEndDate.toISOString()),
      supabase.from('checkups').select('id, created_at, diagnosis, employees(employee_code, fullname, department), dispensing_records(amount)').order('created_at', { ascending: false }).limit(5),
      supabase.from('checkups').select('id, created_at').gte('created_at', kpiStart.toISOString()).lte('created_at', kpiEnd.toISOString()),
      supabase.from('dispensing_records').select('id, created_at, amount').gte('created_at', kpiStart.toISOString()).lte('created_at', kpiEnd.toISOString()),
      supabase.from('checkups').select('id, employees(department)').gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
      supabase.from('checkups').select('id, employees(department)').gte('created_at', prevStartDate.toISOString()).lte('created_at', prevEndDate.toISOString()),
      supabase.from('dispensing_records').select('id, amount, medicine:medicine_list(name), checkup:checkups(diagnosis, symptoms, employees(department))').gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
      supabase.from('dispensing_records').select('id, amount, medicine:medicine_list(name), checkup:checkups(diagnosis, symptoms, employees(department))').gte('created_at', prevStartDate.toISOString()).lte('created_at', prevEndDate.toISOString())
    ])

    // Process Summary
    const patientsRange = patientsRangeRes.data || []
    const patientsPrev = patientsPrevRes.data || []
    const totalStockRows = totalStockRes.data || []
    const dispensedRangeValue = (dispensedRangeRes.data || []).reduce((sum, r) => sum + (r.amount || 0), 0)
    const dispensedPrevValue = (dispensedPrevRes.data || []).reduce((sum, r) => sum + (r.amount || 0), 0)

    // 1. Top Department Stats
    const getDeptStats = (rows) => {
      const map = {}
      rows.forEach(r => {
        const d = r?.employees?.department || 'ไม่ระบุ'
        map[d] = (map[d] || 0) + 1
      })
      return map
    }
    const deptMapRange = getDeptStats(patientsRange)
    const deptMapPrev = getDeptStats(patientsPrev)
    const sortedDepts = Object.entries(deptMapRange).sort((a,b) => b[1] - a[1])
    const topDeptName = sortedDepts[0]?.[0] || '-'
    const topDeptVal = sortedDepts[0]?.[1] || 0
    const topDeptPrevVal = deptMapPrev[topDeptName] || 0
    const topDeptPercent = patientsRange.length ? (topDeptVal / patientsRange.length) * 100 : 0

    // 2. Top Diagnosis Stats
    const getDiagStats = (rows) => {
      const map = {}
      rows.forEach(r => {
        const d = (r?.diagnosis || '').trim() || '-'
        if (d !== '-') map[d] = (map[d] || 0) + 1
      })
      return map
    }
    const diagMapRange = getDiagStats(patientsRange)
    const diagMapPrev = getDiagStats(patientsPrev)
    const sortedDiags = Object.entries(diagMapRange).sort((a,b) => b[1] - a[1])
    const topDiagName = sortedDiags[0]?.[0] || '-'
    const topDiagVal = sortedDiags[0]?.[1] || 0
    const topDiagPrevVal = diagMapPrev[topDiagName] || 0
    const topDiagPercent = patientsRange.length ? (topDiagVal / patientsRange.length) * 100 : 0

    summary.value = {
      patientsThisMonth: { value: patientsRange.length, change: computeChangePercent(patientsRange.length, patientsPrev.length) },
      totalStock: { value: totalStockRows.reduce((sum, r) => sum + (r.current_stock || 0), 0), change: 0 },
      topDepartment: { name: topDeptName, value: topDeptVal, change: computeChangePercent(topDeptVal, topDeptPrevVal), percentOfTotal: topDeptPercent },
      topDiagnosis: { name: topDiagName, value: topDiagVal, change: computeChangePercent(topDiagVal, topDiagPrevVal), percentOfTotal: topDiagPercent },
      dispensedThisMonth: { value: dispensedRangeValue, change: computeChangePercent(dispensedRangeValue, dispensedPrevValue) },
    }
    prevDispensed.value = dispensedPrevValue

    // Process Last Patients
    lastPatients.value = (lastPatientsRes.data || []).map((r) => ({
      ...r,
      fullname: r?.employees?.fullname || '-',
      employee_code: r?.employees?.employee_code || '-',
      department: r?.employees?.department || '-',
      amount: (r?.dispensing_records || []).reduce((sum, d) => sum + (d.amount || 0), 0),
    }))

    // KPI Chart Logic
    const patientByDay = {}
    const usageByDay = {}
    ;(kpiPatientsRes.data || []).forEach(row => {
      const key = dayKeyLocal(row.created_at)
      patientByDay[key] = (patientByDay[key] || 0) + 1
    })
    ;(usage15DaysRes.data || []).forEach(row => {
      const key = dayKeyLocal(row.created_at)
      usageByDay[key] = (usageByDay[key] || 0) + (row.amount || 0)
    })

    const useMonthly = kpiSpanDays > 60
    if (!useMonthly) {
      const days = []
      const displayLabels = []
      const dIter = new Date(kpiStart); dIter.setHours(0,0,0,0)
      const endIter = new Date(kpiEnd); endIter.setHours(0,0,0,0)
      for (let d = dIter; d <= endIter; d = new Date(d.getTime() + 86400000)) {
        const key = dayKeyLocal(d)
        days.push(key)
        displayLabels.push(`${String(d.getDate()).padStart(2, '0')} ${thaiMonthsShort[d.getMonth()]}`)
      }
      kpiLabels.value = displayLabels
      kpiPatients.value = days.map(d => patientByDay[d] || 0)
      kpiUsage.value = days.map(d => usageByDay[d] || 0)
    } else {
      const monthKey = (key) => {
        const parts = String(key).split('-')
        return `${parts[0]}-${String(parts[1]).padStart(2,'0')}`
      }
      const patientByMonth = {}; const usageByMonth = {}
      Object.entries(patientByDay).forEach(([d, cnt]) => { const mk = monthKey(d); patientByMonth[mk] = (patientByMonth[mk] || 0) + cnt })
      Object.entries(usageByDay).forEach(([d, amt]) => { const mk = monthKey(d); usageByMonth[mk] = (usageByMonth[mk] || 0) + amt })
      const labels = []; const monthsKeys = []
      const mStart = new Date(kpiStart.getFullYear(), kpiStart.getMonth(), 1)
      const mEnd = new Date(kpiEnd.getFullYear(), kpiEnd.getMonth(), 1)
      for (let m = new Date(mStart); m <= mEnd; m.setMonth(m.getMonth()+1)) {
        const mk = `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}`
        monthsKeys.push(mk)
        labels.push(`${thaiMonthsShort[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`)
      }
      kpiLabels.value = labels
      kpiPatients.value = monthsKeys.map(k => patientByMonth[k] || 0)
      kpiUsage.value = monthsKeys.map(k => usageByMonth[k] || 0)
    }

    // Top Diagnosis List with KPI
    const getDiagnosisListStats = (rows) => {
      const map = {}
      rows.forEach(r => {
        const d = (r?.diagnosis || '').trim() || '-'
        if (d !== '-') map[d] = (map[d] || 0) + 1
      })
      return map
    }
    const diagListMapRange = getDiagnosisListStats(patientsRange)
    const diagListMapPrev = getDiagnosisListStats(patientsPrev)
    topDiagnoses.value = Object.entries(diagListMapRange)
      .map(([d, count]) => ({
        diagnosis: d,
        count,
        change: computeChangePercent(count, diagListMapPrev[d] || 0)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Medicine Stats with KPI
    const getMedStats = (rows) => {
      const map = {}
      rows.forEach(r => {
        const name = r?.medicine?.name || 'Unknown'
        const diag = r?.checkup?.diagnosis || '-'
        if (!map[name]) map[name] = { dispensedCount: 0, diags: {} }
        map[name].dispensedCount += (r.amount || 0)
        if (diag !== '-') map[name].diags[diag] = (map[name].diags[diag] || 0) + 1
      })
      return map
    }
    const medMapRange = getMedStats(allDispensingRangeRes.data || [])
    const medMapPrev = getMedStats(allDispensingPrevRes.data || [])
    medicineStats.value = Object.entries(medMapRange)
      .map(([name, m]) => {
        const topDiag = Object.entries(m.diags).sort((a,b) => b[1]-a[1])[0]?.[0] || '-'
        return {
          name,
          dispensedCount: m.dispensedCount,
          diagnosis: topDiag,
          change: computeChangePercent(m.dispensedCount, medMapPrev[name]?.dispensedCount || 0)
        }
      })
      .sort((a, b) => b.dispensedCount - a.dispensedCount)

    // Department Stats with KPI
    const getFullDeptStats = (checkups, dispensing) => {
      const map = {}
      checkups.forEach(r => {
        const d = r?.employees?.department || 'Unknown'
        if (!map[d]) map[d] = { patientCount: 0, medicineCount: 0 }
        map[d].patientCount++
      })
      dispensing.forEach(r => {
        const d = r?.checkup?.employees?.department || 'Unknown'
        if (!map[d]) map[d] = { patientCount: 0, medicineCount: 0 }
        map[d].medicineCount += (r.amount || 0)
      })
      return map
    }
    const fullDeptMapRange = getFullDeptStats(allCheckupsRangeRes.data || [], allDispensingRangeRes.data || [])
    const fullDeptMapPrev = getFullDeptStats(allCheckupsPrevRes.data || [], allDispensingPrevRes.data || [])
    departmentStats.value = Object.entries(fullDeptMapRange)
      .map(([dept, data]) => ({
        department: dept,
        patientCount: data.patientCount,
        medicineCount: data.medicineCount,
        change: computeChangePercent(data.patientCount, fullDeptMapPrev[dept]?.patientCount || 0)
      }))
      .sort((a, b) => b.patientCount - a.patientCount)

    // Finalize Leave Stats with KPI
    const getLeaveStats = (rows) => {
      const map = {}
      rows.forEach(r => {
        if (r.is_leave_allowed) {
          const d = r?.employees?.department || 'Unknown'
          map[d] = (map[d] || 0) + 1
        }
      })
      return map
    }
    const leaveMapRange = getLeaveStats(patientsRange)
    const leaveMapPrev = getLeaveStats(patientsPrev)
    leaveStats.value = Object.entries(leaveMapRange)
      .map(([dept, count]) => ({
        department: dept,
        leaveCount: count,
        change: computeChangePercent(count, leaveMapPrev[dept] || 0)
      }))
      .sort((a, b) => b.leaveCount - a.leaveCount)

  } catch (err) {
    console.error('Dashboard load error', err)
  } finally {
    loading.value = false
  }
}

// Watch for date range changes
watch([dateRange, customStartDate, customEndDate], () => {
  kpiUseFilter.value = true
  loadDashboardData()
})

onMounted(loadDashboardData)

// Helper to capture chart
const captureChart = async (chartRefId, dataRef, type, options) => {
  try {
    const cvs = document.createElement('canvas')
    cvs.width = 800
    cvs.height = 400
    const ctx = cvs.getContext('2d')
    const chart = new ChartJS(ctx, {
      type: type,
      data: JSON.parse(JSON.stringify(dataRef.value)),
      options: { 
        ...options, 
        responsive: false, 
        maintainAspectRatio: false, 
        animation: false,
        devicePixelRatio: 2, // Better quality
        plugins: {
          ...options.plugins,
          drawValues: {} // Enable our plugin
        }
      },
      plugins: [drawValuesPlugin]
    })
    const url = chart.toBase64Image()
    chart.destroy()
    return url
  } catch (e) {
    console.error(e)
    return ''
  }
}

const exportDashboardPdf = async () => {
  try {
    // Generate Charts
    lineCanvasImage.value = await captureChart('line', chartData, 'line', chartOptions)
    barCanvasImage.value = await captureChart('bar', barChartData, 'bar', chartOptions)

    const now = new Date()
    const fmt = (d) => {
      const date = new Date(d)
      const day = date.getDate()
      const monthName = thaiMonthsLong[date.getMonth()] || ''
      const year = date.getFullYear()
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${day} ${monthName} ${year} ${hours}:${minutes}`
    }
    const diffText = (val, prev) => {
      const diff = val - prev
      const pct = prev ? ((diff / prev) * 100).toFixed(1) : '0.0'
      const dir = diff >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'
      return `${dir} ${Math.abs(diff)} (${pct}%)`
    }

    const w = window.open('', '_blank')
    const html = `
<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <title>รายงานแดชบอร์ดคลินิก TDL</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap');
      @page { size: A4; margin: 12mm; }
      body { font-family: 'Sarabun', 'SF Thonburi', sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; }
      h1 { font-size: 22px; margin: 0 0 4px; color: #1e3a8a; }
      h2 { font-size: 16px; margin: 16px 0 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
      .muted { color: #64748b; font-size: 12px; }
      .section { margin-bottom: 16px; page-break-inside: avoid; }
      .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
      .card { border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; background: #f8fafc; }
      .card-title { font-size: 12px; color: #64748b; margin-bottom: 4px; }
      .card-val { font-size: 24px; font-weight: bold; color: #0f172a; }
      .card-diff { font-size: 11px; }
      .text-green { color: #10b981; }
      .text-red { color: #ef4444; }
      
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
      th { background: #f1f5f9; font-weight: 600; }
      .text-right { text-align: right; }
      
      .chart-container { width: 100%; text-align: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-top: 8px; }
      img { max-width: 100%; height: auto; max-height: 300px; }
    </style>
  </head>
  <body>
    <div style="display:flex; justify-content:space-between; align-items:flex-end;">
      <div>
        <h1>รายงานแดชบอร์ดคลินิก TDL</h1>
        <div class="muted">พิมพ์เมื่อ: ${fmt(now)}</div>
      </div>
      <div style="text-align:right; font-size:12px;">
        <div>เดือนปัจจุบัน: ${thaiMonthsLong[now.getMonth()] || ''} ${now.getFullYear()}</div>
      </div>
    </div>

    <div class="section">
      <h2>ภาพรวม (KPI Overview)</h2>
      <div class="grid-4">
        <div class="card">
          <div class="card-title">ผู้ป่วยเดือนนี้</div>
          <div class="card-val">${summary.value.patientsThisMonth.value}</div>
          <div class="card-diff ${summary.value.patientsThisMonth.change >= 0 ? 'text-red' : 'text-green'}">
            ${diffText(summary.value.patientsThisMonth.value, summary.value.patientsThisMonth.value / (1 + summary.value.patientsThisMonth.change/100))} เทียบเดือนก่อน
          </div>
        </div>
        <div class="card">
          <div class="card-title">สต็อกยารวม</div>
          <div class="card-val">${summary.value.totalStock.value}</div>
          <div class="card-diff muted">หน่วย</div>
        </div>
        <div class="card">
          <div class="card-title">แผนกสูงสุด</div>
          <div class="card-val">${summary.value.topDepartment.name}</div>
          <div class="card-diff ${summary.value.topDepartment.change >= 0 ? 'text-red' : 'text-green'}">
             ${diffText(summary.value.topDepartment.value, summary.value.topDepartment.value / (1 + summary.value.topDepartment.change/100))} (${summary.value.topDepartment.percentOfTotal.toFixed(1)}%)
          </div>
        </div>
        <div class="card">
          <div class="card-title">โรคที่พบบ่อย</div>
          <div class="card-val">${summary.value.topDiagnosis.name}</div>
          <div class="card-diff ${summary.value.topDiagnosis.change >= 0 ? 'text-red' : 'text-green'}">
             ${diffText(summary.value.topDiagnosis.value, summary.value.topDiagnosis.value / (1 + summary.value.topDiagnosis.change/100))} (${summary.value.topDiagnosis.percentOfTotal.toFixed(1)}%)
          </div>
        </div>
        <div class="card">
          <div class="card-title">จ่ายยาเดือนนี้</div>
          <div class="card-val">${summary.value.dispensedThisMonth.value}</div>
          <div class="card-diff ${summary.value.dispensedThisMonth.change >= 0 ? 'text-red' : 'text-green'}">
             ${diffText(summary.value.dispensedThisMonth.value, prevDispensed.value)}
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div style="display: flex; gap: 16px;">
        <div style="flex: 1;">
          <h2>สถิติรายแผนก (Top Departments)</h2>
          <table>
            <thead>
              <tr>
                <th>แผนก</th>
                <th class="text-right">ผู้ป่วย (คน)</th>
                <th class="text-right">ใช้ยา (หน่วย)</th>
                <th class="text-right">KPI</th>
              </tr>
            </thead>
            <tbody>
              ${departmentStats.value.slice(0, 10).map(d => `
                <tr>
                  <td>${d.department}</td>
                  <td class="text-right">${d.patientCount}</td>
                  <td class="text-right">${d.medicineCount}</td>
                  <td class="text-right ${d.change > 0 ? 'text-red' : d.change < 0 ? 'text-green' : ''}">
                    ${d.change > 0 ? '+' : ''}${d.change.toFixed(1)}%
                  </td>
                </tr>
              `).join('')}
              ${departmentStats.value.length === 0 ? '<tr><td colspan="4" class="muted text-center">ไม่มีข้อมูล</td></tr>' : ''}
            </tbody>
          </table>
        </div>
        <div style="flex: 1;">
           <div class="chart-container">
             <div class="muted" style="margin-bottom:4px">เปรียบเทียบ KPI รายแผนก</div>
             ${barCanvasImage.value ? `<img src="${barCanvasImage.value}" />` : '<div class="muted">ไม่มีกราฟ</div>'}
           </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>รายการยาที่ใช้มากที่สุด (Top Medicines)</h2>
      <table>
        <thead>
          <tr>
            <th>รายการยา</th>
            <th>อาการที่พบบ่อย</th>
            <th class="text-right">จำนวนที่จ่าย</th>
            <th class="text-right">KPI</th>
          </tr>
        </thead>
        <tbody>
          ${medicineStats.value.slice(0, 10).map(m => `
            <tr>
              <td>${m.name}</td>
              <td>${m.diagnosis}</td>
              <td class="text-right">${m.dispensedCount}</td>
              <td class="text-right ${m.change > 0 ? 'text-red' : m.change < 0 ? 'text-green' : ''}">
                ${m.change > 0 ? '+' : ''}${m.change.toFixed(1)}%
              </td>
            </tr>
          `).join('')}
          ${medicineStats.value.length === 0 ? '<tr><td colspan="4" class="muted text-center">ไม่มีข้อมูล</td></tr>' : ''}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>แนวโน้ม 15 วันล่าสุด</h2>
      <div class="chart-container">
        ${lineCanvasImage.value ? `<img src="${lineCanvasImage.value}" />` : '<div class="muted">ไม่มีกราฟ</div>'}
      </div>
    </div>

    <div class="section">
      <div style="display: flex; gap: 16px;">
        <div style="flex: 1;">
          <h2>โรคที่พบบ่อย (Top Diagnosis)</h2>
          <table>
            <thead><tr><th>ชื่อโรค</th><th class="text-right">จำนวนครั้ง</th><th class="text-right">KPI</th></tr></thead>
            <tbody>
              ${topDiagnoses.value.map(r => `
                <tr>
                  <td>${r.diagnosis}</td>
                  <td class="text-right">${r.count}</td>
                  <td class="text-right ${r.change > 0 ? 'text-red' : r.change < 0 ? 'text-green' : ''}">
                    ${r.change > 0 ? '+' : ''}${r.change.toFixed(1)}%
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="flex: 1;">
           <h2>ผู้ป่วยล่าสุด (วันนี้)</h2>
           <table>
             <thead><tr><th>เวลา</th><th>ชื่อ-สกุล</th><th>แผนก</th></tr></thead>
             <tbody>
               ${lastPatients.value.map(p => `
                 <tr>
                   <td>${new Date(p.created_at).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</td>
                   <td>${p.fullname}</td>
                   <td>${p.department}</td>
                 </tr>
               `).join('')}
             </tbody>
           </table>
        </div>
      </div>
    </div>

  </body>
</html>
    `
    w.document.open()
    w.document.write(html)
    w.document.close()
    setTimeout(() => {
      w.focus()
      w.print()
    }, 500)
  } catch (e) {
    console.error('Export dashboard PDF failed', e)
    import('../stores/ui').then(({ showToast }) => showToast('error', 'เกิดข้อผิดพลาดในการส่งออก PDF'))
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
        Dashboard (ภาพรวม)
      </h1>
      
      <div class="flex flex-wrap items-center gap-2">
        <!-- Date Filter Presets -->
        <div class="inline-flex bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-lg p-1 shadow-sm">
          <button 
            v-for="preset in [
              { label: 'เดือนนี้', value: 'this-month' },
              { label: 'เดือนก่อน', value: 'last-month' },
              { label: 'อาทิตย์นี้', value: 'this-week' },
              { label: 'อาทิตย์ก่อน', value: 'last-week' },
              { label: 'กำหนดเอง', value: 'custom' }
            ]"
            :key="preset.value"
            @click="dateRange = preset.value"
            class="px-3 py-1.5 text-[10px] font-medium rounded-md transition-all"
            :class="dateRange === preset.value 
              ? 'bg-clinic-blue text-white shadow-sm' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'"
          >
            {{ preset.label }}
          </button>
        </div>

        <!-- Custom Date Inputs -->
        <div v-if="dateRange === 'custom'" class="flex items-center gap-2 animate-fade-in">
          <input 
            v-model="customStartDate"
            type="date"
            class="px-2 py-1.5 text-[10px] rounded-lg border border-clinic-border dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-clinic-blue outline-none"
          />
          <span class="text-slate-400 text-[10px]">ถึง</span>
          <input 
            v-model="customEndDate"
            type="date"
            class="px-2 py-1.5 text-[10px] rounded-lg border border-clinic-border dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-clinic-blue outline-none"
          />
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-clinic-blue text-white hover:bg-blue-700 transition-colors shadow-sm ml-auto"
          @click="exportDashboardPdf"
        >
          <i class="fa-solid fa-file-pdf"></i>
          <span>ส่งออก PDF</span>
        </button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
      <!-- Patients -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium text-nowrap">ผู้ป่วย (รวม)</span>
          <div class="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-user-injured text-clinic-blue dark:text-blue-400 text-sm"></i>
          </div>
        </div>
        <div class="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {{ summary.patientsThisMonth.value }}
        </div>
        <div
          class="text-xs font-medium flex items-center gap-1"
          :class="summary.patientsThisMonth.change > 0 ? 'text-red-500' : 'text-emerald-500'"
        >
          <i :class="summary.patientsThisMonth.change > 0 ? 'fa-solid fa-arrow-trend-up' : 'fa-solid fa-arrow-trend-down'"></i>
          {{ Math.abs(summary.patientsThisMonth.change).toFixed(1) }}% เทียบช่วงก่อนหน้า
        </div>
      </div>

      <!-- Stock -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium text-nowrap">สต็อกยารวม</span>
          <div class="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-pills text-purple-600 dark:text-purple-400 text-sm"></i>
          </div>
        </div>
        <div class="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {{ summary.totalStock.value }}
        </div>
        <div class="text-xs text-slate-400">
          จำนวนคงเหลือทุกรายการ
        </div>
      </div>

      <!-- Top Department -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium text-nowrap">แผนกสูงสุด</span>
          <div class="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-building-user text-emerald-600 dark:text-emerald-400 text-sm"></i>
          </div>
        </div>
        <div class="text-lg font-bold text-slate-800 dark:text-slate-100 truncate" :title="summary.topDepartment.name">
          {{ summary.topDepartment.name }}
        </div>
        <div class="flex items-center justify-between mt-auto">
          <div class="text-xl font-bold text-emerald-600">{{ summary.topDepartment.value }}</div>
          <div
            class="text-[10px] font-medium flex items-center gap-0.5"
            :class="summary.topDepartment.change >= 0 ? 'text-red-500' : 'text-emerald-500'"
          >
            <i :class="summary.topDepartment.change >= 0 ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'"></i>
            {{ Math.abs(summary.topDepartment.change).toFixed(1) }}%
          </div>
        </div>
        <div class="text-[10px] text-slate-400">
          คิดเป็น {{ summary.topDepartment.percentOfTotal.toFixed(1) }}% ของทั้งหมด
        </div>
      </div>

      <!-- Top Diagnosis -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium text-nowrap">โรคที่พบบ่อย</span>
          <div class="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-virus text-rose-600 dark:text-rose-400 text-sm"></i>
          </div>
        </div>
        <div class="text-lg font-bold text-slate-800 dark:text-slate-100 truncate" :title="summary.topDiagnosis.name">
          {{ summary.topDiagnosis.name }}
        </div>
        <div class="flex items-center justify-between mt-auto">
          <div class="text-xl font-bold text-rose-600">{{ summary.topDiagnosis.value }}</div>
          <div
            class="text-[10px] font-medium flex items-center gap-0.5"
            :class="summary.topDiagnosis.change >= 0 ? 'text-red-500' : 'text-emerald-500'"
          >
            <i :class="summary.topDiagnosis.change >= 0 ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'"></i>
            {{ Math.abs(summary.topDiagnosis.change).toFixed(1) }}%
          </div>
        </div>
        <div class="text-[10px] text-slate-400">
          คิดเป็น {{ summary.topDiagnosis.percentOfTotal.toFixed(1) }}% ของทั้งหมด
        </div>
      </div>

      <!-- Dispensed -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium text-nowrap">ยาที่จ่ายไป</span>
          <div class="w-8 h-8 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-prescription-bottle-medical text-orange-600 dark:text-orange-400 text-sm"></i>
          </div>
        </div>
        <div class="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {{ summary.dispensedThisMonth.value }}
        </div>
        <div
          class="text-xs font-medium flex items-center gap-1"
          :class="summary.dispensedThisMonth.change >= 0 ? 'text-red-500' : 'text-emerald-500'"
        >
          <i :class="summary.dispensedThisMonth.change >= 0 ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'"></i>
          {{ Math.abs(summary.dispensedThisMonth.change).toFixed(1) }}% เทียบช่วงก่อนหน้า
        </div>
      </div>
    </div>

    <!-- Middle Section (6-6) -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <!-- KPI Chart -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 h-80 flex flex-col shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-slate-800 dark:text-white">แนวโน้มการรับรักษา</h2>
          <span class="text-xs text-slate-500">ผู้ป่วย vs การจ่ายยา</span>
        </div>
        <div class="flex-1 min-h-0 relative w-full">
          <Line 
            v-if="chartData.labels.length" 
            :data="chartData" 
            :options="{
              ...chartOptions, 
              plugins: { ...chartOptions.plugins, drawValues: {} }
            }" 
            :plugins="[drawValuesPlugin]"
          />
          <div v-else class="h-full flex items-center justify-center text-xs text-slate-400">
            กำลังโหลดข้อมูล...
          </div>
        </div>
      </div>

      <!-- Department Chart -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 h-80 flex flex-col shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-slate-800 dark:text-white">สถิติรายแผนก (ผู้ป่วยและการใช้ยา)</h2>
          <span class="text-xs text-slate-500">เปรียบเทียบผู้ป่วยและการใช้ยา</span>
        </div>
        <div class="flex-1 min-h-0 relative w-full">
          <Bar 
            v-if="barChartData.labels.length" 
            :data="barChartData" 
            :options="{
              ...chartOptions, 
              plugins: { ...chartOptions.plugins, drawValues: {} }
            }" 
            :plugins="[drawValuesPlugin]"
          />
          <div v-else class="h-full flex items-center justify-center text-xs text-slate-400">
            ไม่มีข้อมูลแผนก
          </div>
        </div>
      </div>
    </div>

    <!-- Middle-Bottom Section (3-3-3-3) -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <!-- Top Diagnosis List -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 space-y-3 shadow-sm flex flex-col">
        <h2 class="text-xs font-semibold text-slate-800 dark:text-white mb-2 flex items-center justify-between">
          <span><i class="fa-solid fa-virus text-rose-500 mr-1"></i> โรคที่พบบ่อย (Top 7)</span>
          <span class="text-[10px] font-normal text-slate-400">KPI</span>
        </h2>
        <div v-if="topDiagnoses.length" class="space-y-1.5 text-[11px] flex-1">
          <div
            v-for="(row, i) in topDiagnoses.slice(0, 7)"
            :key="row.diagnosis"
            class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50"
          >
            <div class="flex items-center gap-1.5 overflow-hidden">
              <span class="w-4 h-4 flex items-center justify-center rounded-full bg-white dark:bg-slate-600 text-slate-500 font-bold text-[9px] shadow-sm">
                {{ i + 1 }}
              </span>
              <span class="truncate font-medium text-slate-700 dark:text-slate-200" :title="row.diagnosis">{{ row.diagnosis }}</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="font-bold text-slate-900 dark:text-white">{{ row.count }}</span>
              <span 
                class="text-[9px] font-bold"
                :class="row.change > 0 ? 'text-red-500' : row.change < 0 ? 'text-emerald-500' : 'text-orange-500'"
              >
                {{ row.change > 0 ? '+' : '' }}{{ row.change.toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Medicine Stats -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 space-y-3 shadow-sm flex flex-col">
        <h2 class="text-xs font-semibold text-slate-800 dark:text-white mb-2 flex items-center justify-between">
          <span><i class="fa-solid fa-pills text-indigo-500 mr-1"></i> รายการยาใช้มาก (Top 7)</span>
          <span class="text-[10px] font-normal text-slate-400">KPI</span>
        </h2>
        <div v-if="medicineStats.length" class="space-y-1.5 text-[11px] flex-1">
          <div
            v-for="(row, i) in medicineStats.slice(0, 7)"
            :key="row.name"
            class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50"
          >
            <div class="flex items-center gap-1.5 overflow-hidden">
              <span class="w-4 h-4 flex items-center justify-center rounded-full bg-white dark:bg-slate-600 text-slate-500 font-bold text-[9px] shadow-sm">
                {{ i + 1 }}
              </span>
              <span class="truncate font-medium text-slate-700 dark:text-slate-200" :title="row.name">{{ row.name }}</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="font-bold text-slate-900 dark:text-white">{{ row.dispensedCount }}</span>
              <span 
                class="text-[9px] font-bold"
                :class="row.change > 0 ? 'text-red-500' : row.change < 0 ? 'text-emerald-500' : 'text-orange-500'"
              >
                {{ row.change > 0 ? '+' : '' }}{{ row.change.toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Department Stats (Scrollable) -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 space-y-3 shadow-sm flex flex-col">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-xs font-semibold text-slate-800 dark:text-white">
            <i class="fa-solid fa-building text-emerald-500 mr-1"></i> แผนกทั้งหมด
          </h2>
          <div class="flex gap-1">
            <button @click="deptPageIndex = Math.max(0, deptPageIndex - 1)" class="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400"><i class="fa-solid fa-chevron-left text-[10px]"></i></button>
            <button @click="deptPageIndex++" :disabled="(deptPageIndex + 1) * 7 >= departmentStats.length" class="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 disabled:opacity-30"><i class="fa-solid fa-chevron-right text-[10px]"></i></button>
          </div>
        </div>
        <div v-if="departmentStats.length" class="space-y-1.5 text-[11px] flex-1">
          <div
            v-for="(row, i) in departmentStats.slice(deptPageIndex * 7, (deptPageIndex + 1) * 7)"
            :key="row.department"
            class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50"
          >
            <div class="flex items-center gap-1.5 overflow-hidden">
              <span class="w-4 h-4 flex items-center justify-center rounded-full bg-white dark:bg-slate-600 text-slate-500 font-bold text-[9px] shadow-sm">
                {{ deptPageIndex * 7 + i + 1 }}
              </span>
              <span class="truncate font-medium text-slate-700 dark:text-slate-200" :title="row.department">{{ row.department }}</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="font-bold text-slate-900 dark:text-white">{{ row.patientCount }}</span>
              <span 
                class="text-[9px] font-bold"
                :class="row.change > 0 ? 'text-red-500' : row.change < 0 ? 'text-emerald-500' : 'text-orange-500'"
              >
                {{ row.change > 0 ? '+' : '' }}{{ row.change.toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Leave Stats (Scrollable) -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 space-y-3 shadow-sm flex flex-col">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-xs font-semibold text-slate-800 dark:text-white">
            <i class="fa-solid fa-calendar-xmark text-amber-500 mr-1"></i> การลาพักแยกแผนก
          </h2>
          <div class="flex gap-1">
            <button @click="leavePageIndex = Math.max(0, leavePageIndex - 1)" class="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400"><i class="fa-solid fa-chevron-left text-[10px]"></i></button>
            <button @click="leavePageIndex++" :disabled="(leavePageIndex + 1) * 7 >= leaveStats.length" class="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 disabled:opacity-30"><i class="fa-solid fa-chevron-right text-[10px]"></i></button>
          </div>
        </div>
        <div v-if="leaveStats.length" class="space-y-1.5 text-[11px] flex-1">
          <div
            v-for="(row, i) in leaveStats.slice(leavePageIndex * 7, (leavePageIndex + 1) * 7)"
            :key="row.department"
            class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50"
          >
            <div class="flex items-center gap-1.5 overflow-hidden">
              <span class="w-4 h-4 flex items-center justify-center rounded-full bg-white dark:bg-slate-600 text-slate-500 font-bold text-[9px] shadow-sm">
                {{ leavePageIndex * 7 + i + 1 }}
              </span>
              <span class="truncate font-medium text-slate-700 dark:text-slate-200" :title="row.department">{{ row.department }}</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="font-bold text-slate-900 dark:text-white">{{ row.leaveCount }}</span>
              <span 
                class="text-[9px] font-bold"
                :class="row.change > 0 ? 'text-red-500' : row.change < 0 ? 'text-emerald-500' : 'text-orange-500'"
              >
                {{ row.change > 0 ? '+' : '' }}{{ row.change.toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Last Patients Table (Bottom 12) -->
    <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-semibold text-slate-800 dark:text-white">
          <i class="fa-regular fa-clock text-blue-500 mr-2"></i>
          ผู้ป่วยล่าสุด (เรียงตามเวลา)
        </h2>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-xs">
          <thead>
            <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <th class="py-2 px-3 rounded-tl-lg">เวลา</th>
              <th class="py-2 px-3">รหัส</th>
              <th class="py-2 px-3">ชื่อ-นามสกุล</th>
              <th class="py-2 px-3">แผนก</th>
              <th class="py-2 px-3">อาการหลัก</th>
              <th class="py-2 px-3 text-right rounded-tr-lg">ยาที่จ่าย</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in lastPatients"
              :key="row.id"
              class="border-b border-clinic-border/60 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
            >
              <td class="py-2 px-3 text-slate-500 whitespace-nowrap">
                {{ new Date(row.created_at).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) }}
              </td>
              <td class="py-2 px-3 font-mono text-slate-500">{{ row.employee_code }}</td>
              <td class="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">{{ row.fullname }}</td>
              <td class="py-2 px-3 text-slate-500">{{ row.department }}</td>
              <td class="py-2 px-3 text-slate-600 dark:text-slate-400 italic">{{ row.diagnosis || row.symptoms }}</td>
              <td class="py-2 px-3 text-right font-bold text-clinic-blue">{{ row.amount }}</td>
            </tr>
            <tr v-if="!lastPatients.length">
              <td colspan="6" class="py-8 text-center text-slate-400">ไม่พบข้อมูลผู้ป่วยล่าสุด</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-nowrap {
  white-space: nowrap;
}
</style>
