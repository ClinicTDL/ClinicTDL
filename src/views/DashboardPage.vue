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
  patientsThisMonth: { value: 0, prev: 0, change: 0 },
  totalStock: { value: 0, change: 0 },
  topDepartment: { name: '-', value: 0, prev: 0, change: 0, percentOfTotal: 0 },
  topDiagnosis: { name: '-', value: 0, prev: 0, change: 0, percentOfTotal: 0 },
  dispensedThisMonth: { value: 0, prev: 0, change: 0 },
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

// Modal State
const showDeptModal = ref(false)
const selectedDept = ref('')
const deptDetails = ref([])
const diagnosisSummary = ref([])
const loadingDeptDetails = ref(false)

const showLeaveModal = ref(false)
const selectedLeaveDept = ref('')
const leaveDetails = ref([])
const loadingLeaveDetails = ref(false)

const showDiagModal = ref(false)
const selectedDiagName = ref('')
const diagDetails = ref([])
const diagDeptSummary = ref([])
const loadingDiagDetails = ref(false)

const showDispensedModal = ref(false)
const dispensedDetails = ref([])
const dispensedPersonSummary = ref([])
const loadingDispensedDetails = ref(false)

const showMedicineModal = ref(false)
const selectedMedicineName = ref('')
const medicineDetails = ref([])
const medicinePersonSummary = ref([])
const loadingMedicineDetails = ref(false)

// Shared date objects for details fetching
let currentStartDate = null
let currentEndDate = null

// Date Filter State
const dateRange = ref('this-month') // this-month, last-month, this-week, last-week, custom
const customStartDate = ref('')
const customEndDate = ref('')
const dateRangeLabel = ref('เดือนนี้')
watch(dateRange, (newVal) => {
  const presets = {
    'this-month': 'เดือนนี้',
    'last-month': 'เดือนก่อน',
    'this-week': 'อาทิตย์นี้',
    'last-week': 'อาทิตย์ก่อน',
    'custom': 'กำหนดเอง'
  }
  dateRangeLabel.value = presets[newVal] || 'ช่วงที่เลือก'
})

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
  if (!previous) {
    return current > 0 ? 100 : 0
  }
  if (current === previous) return 0
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

    // Save for detail modals
    currentStartDate = startDate
    currentEndDate = endDate

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
      patientsThisMonth: { value: patientsRange.length, prev: patientsPrev.length, change: computeChangePercent(patientsRange.length, patientsPrev.length) },
      totalStock: { value: totalStockRows.reduce((sum, r) => sum + (r.current_stock || 0), 0), change: 0 },
      topDepartment: { name: topDeptName, value: topDeptVal, prev: topDeptPrevVal, change: computeChangePercent(topDeptVal, topDeptPrevVal), percentOfTotal: topDeptPercent },
      topDiagnosis: { name: topDiagName, value: topDiagVal, prev: topDiagPrevVal, change: computeChangePercent(topDiagVal, topDiagPrevVal), percentOfTotal: topDiagPercent },
      dispensedThisMonth: { value: dispensedRangeValue, prev: dispensedPrevValue, change: computeChangePercent(dispensedRangeValue, dispensedPrevValue) },
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
const openDeptDetails = async (dept) => {
  selectedDept.value = dept
  showDeptModal.value = true
  loadingDeptDetails.value = true
  deptDetails.value = []
  diagnosisSummary.value = []

  try {
    let query = supabase
      .from('checkups')
      .select('id, created_at, diagnosis, symptoms, employees!inner(employee_code, fullname, department)')
      .gte('created_at', currentStartDate.toISOString())
      .lte('created_at', currentEndDate.toISOString())
      .order('created_at', { ascending: false })

    if (dept === 'Unknown' || !dept) {
      query = supabase
        .from('checkups')
        .select('id, created_at, diagnosis, symptoms, employees(employee_code, fullname, department)')
        .is('employees', null)
        .gte('created_at', currentStartDate.toISOString())
        .lte('created_at', currentEndDate.toISOString())
        .order('created_at', { ascending: false })
    } else {
      query = query.ilike('employees.department', dept)
    }

    const { data, error } = await query
    if (error) throw error

    const rows = data || []
    deptDetails.value = rows.map(r => ({
      ...r,
      fullname: r.employees?.fullname || '-',
      employee_code: r.employees?.employee_code || '-',
      diagnosis: (r.diagnosis || '').trim() || '-'
    }))

    const summaryMap = {}
    rows.forEach(r => {
      let d = (r.diagnosis || '').trim()
      if (!d) d = 'ไม่ระบุอาการ/วินิจฉัย'
      summaryMap[d] = (summaryMap[d] || 0) + 1
    })
    diagnosisSummary.value = Object.entries(summaryMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

  } catch (err) {
    console.error('Fetch dept details failed', err)
  } finally {
    loadingDeptDetails.value = false
  }
}

const openLeaveDetails = async (dept) => {
  selectedLeaveDept.value = dept
  showLeaveModal.value = true
  loadingLeaveDetails.value = true
  leaveDetails.value = []

  try {
    const { data, error } = await supabase
      .from('checkups')
      .select('id, created_at, leave_start, leave_end, total_leave_days, employees!inner(employee_code, fullname, department)')
      .eq('employees.department', dept)
      .eq('is_leave_allowed', true)
      .gte('created_at', currentStartDate.toISOString())
      .lte('created_at', currentEndDate.toISOString())
      .order('created_at', { ascending: false })

    if (error) throw error

    leaveDetails.value = (data || []).map(r => ({
      ...r,
      fullname: r.employees?.fullname || '-',
      employee_code: r.employees?.employee_code || '-',
      period: `${new Date(r.leave_start).toLocaleDateString('th-TH')} - ${new Date(r.leave_end).toLocaleDateString('th-TH')}`,
      days: r.total_leave_days || 0
    }))

  } catch (err) {
    console.error('Fetch leave details failed', err)
  } finally {
    loadingLeaveDetails.value = false
  }
}

const openDiagDetails = async (diagName) => {
  if (!diagName || diagName === '-') return
  selectedDiagName.value = diagName
  showDiagModal.value = true
  loadingDiagDetails.value = true
  diagDetails.value = []
  diagDeptSummary.value = []

  try {
    const { data, error } = await supabase
      .from('checkups')
      .select('id, created_at, diagnosis, employees(employee_code, fullname, department)')
      .ilike('diagnosis', `%${diagName.trim()}%`)
      .gte('created_at', currentStartDate.toISOString())
      .lte('created_at', currentEndDate.toISOString())
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = (data || []).filter(r => (r.diagnosis || '').trim() === diagName.trim())
    diagDetails.value = rows.map(r => ({
      ...r,
      fullname: r.employees?.fullname || '-',
      employee_code: r.employees?.employee_code || '-',
      department: r.employees?.department || '-'
    }))

    const deptMap = {}
    rows.forEach(r => {
      const d = r.employees?.department || 'ไม่ระบุ'
      deptMap[d] = (deptMap[d] || 0) + 1
    })
    diagDeptSummary.value = Object.entries(deptMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

  } catch (err) {
    console.error('Fetch diagnosis details failed', err)
  } finally {
    loadingDiagDetails.value = false
  }
}

const openMedicineDetails = async (medName) => {
  if (!medName || medName === 'Unknown') return
  selectedMedicineName.value = medName
  showMedicineModal.value = true
  loadingMedicineDetails.value = true
  medicineDetails.value = []
  medicinePersonSummary.value = []

  try {
    const { data, error } = await supabase
      .from('dispensing_records')
      .select('id, amount, created_at, medicine:medicine_list!inner(name), checkup:checkups(diagnosis, employees(employee_code, fullname, department))')
      .eq('medicine.name', medName)
      .gte('created_at', currentStartDate.toISOString())
      .lte('created_at', currentEndDate.toISOString())
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = data || []
    medicineDetails.value = rows.map(r => ({
      ...r,
      fullname: r.checkup?.employees?.fullname || '-',
      employee_code: r.checkup?.employees?.employee_code || '-',
      department: r.checkup?.employees?.department || '-',
      diagnosis: r.checkup?.diagnosis || '-'
    }))

    const personMap = {}
    rows.forEach(r => {
      const code = r.checkup?.employees?.employee_code || 'unknown'
      const name = r.checkup?.employees?.fullname || '-'
      if (!personMap[code]) personMap[code] = { name, total: 0 }
      personMap[code].total += (r.amount || 0)
    })
    medicinePersonSummary.value = Object.entries(personMap)
      .map(([code, p]) => ({ code, name: p.name, total: p.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

  } catch (err) {
    console.error('Fetch medicine details failed', err)
  } finally {
    loadingMedicineDetails.value = false
  }
}

const openDispensedDetails = async () => {
  showDispensedModal.value = true
  loadingDispensedDetails.value = true
  dispensedDetails.value = []
  dispensedPersonSummary.value = []

  try {
    const { data, error } = await supabase
      .from('dispensing_records')
      .select('id, amount, created_at, medicine:medicine_list(name), checkup:checkups(employees(employee_code, fullname, department))')
      .gte('created_at', currentStartDate.toISOString())
      .lte('created_at', currentEndDate.toISOString())
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = data || []
    dispensedDetails.value = rows.map(r => ({
      ...r,
      medicineName: r.medicine?.name || '-',
      fullname: r.checkup?.employees?.fullname || '-',
      employee_code: r.checkup?.employees?.employee_code || '-',
      department: r.checkup?.employees?.department || '-'
    }))

    const personMap = {}
    rows.forEach(r => {
      const code = r.checkup?.employees?.employee_code || 'unknown'
      const name = r.checkup?.employees?.fullname || '-'
      if (!personMap[code]) personMap[code] = { name, total: 0 }
      personMap[code].total += (r.amount || 0)
    })
    dispensedPersonSummary.value = Object.entries(personMap)
      .map(([code, p]) => ({ code, name: p.name, total: p.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

  } catch (err) {
    console.error('Fetch dispensed details failed', err)
  } finally {
    loadingDispensedDetails.value = false
  }
}

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

    const getKpiBadge = (change) => {
      const absChange = Math.abs(change).toFixed(1)
      if (change > 0) return `<span class="text-red font-bold">▲ ${absChange}%</span>`
      if (change < 0) return `<span class="text-green font-bold">▼ ${absChange}%</span>`
      return `<span class="muted">0.0%</span>`
    }

    const w = window.open('', '_blank')
    const html = `
<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <title>รายงานแดชบอร์ดคลินิก TDL (${dateRangeLabel.value})</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap');
      @page { size: A4; margin: 12mm; }
      body { font-family: 'Sarabun', 'SF Thonburi', sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; line-height: 1.4; }
      h1 { font-size: 22px; margin: 0 0 4px; color: #1e3a8a; }
      h2 { font-size: 16px; margin: 16px 0 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; color: #334155; }
      .muted { color: #64748b; font-size: 11px; }
      .section { margin-bottom: 20px; page-break-inside: avoid; }
      .grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
      .card { border: 1px solid #e2e8f0; padding: 12px 8px; border-radius: 12px; background: #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
      .card-title { font-size: 10px; font-weight: 600; color: #64748b; margin-bottom: 4px; text-transform: uppercase; }
      .card-val { font-size: 20px; font-weight: 800; color: #0f172a; margin: 2px 0; }
      .card-diff { font-size: 10px; margin-top: 4px; }
      .text-green { color: #059669; }
      .text-red { color: #dc2626; }
      .text-blue { color: #2563eb; }
      
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 5px; }
      th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
      th { background: #f8fafc; font-weight: 600; color: #475569; }
      .text-right { text-align: right; }
      
      .chart-container { width: 100%; text-align: center; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; background: #ffffff; }
      img { max-width: 100%; height: auto; max-height: 280px; }
      .flex-2 { display: flex; gap: 15px; }
      .col { flex: 1; }
    </style>
  </head>
  <body>
    <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom: 3px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 20px;">
      <div>
        <div style="color: #1e3a8a; font-weight: 800; font-size: 24px;">CLINIC TDL</div>
        <h1 style="margin:0;">รายงานสรุปแดชบอร์ด</h1>
        <div class="muted">ช่วงเวลา: <strong>${dateRangeLabel.value}</strong> | พิมพ์เมื่อ: ${fmt(now)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size: 14px; font-weight: 600;">สรุปผลการดำเนินงาน</div>
        <div class="muted">${thaiMonthsLong[now.getMonth()]} ${now.getFullYear() + 543}</div>
      </div>
    </div>

    <div class="section">
      <div class="grid-5">
        <div class="card">
          <div class="card-title">ผู้ป่วย (คน)</div>
          <div class="card-val">${summary.value.patientsThisMonth.value}</div>
          <div class="card-diff">
            ${getKpiBadge(summary.value.patientsThisMonth.change)}
          </div>
        </div>
        <div class="card">
          <div class="card-title">สต็อกยารวม</div>
          <div class="card-val">${summary.value.totalStock.value}</div>
          <div class="card-diff muted">รายการคงเหลือรวม</div>
        </div>
        <div class="card">
          <div class="card-title">แผนกสูงสุด</div>
          <div class="card-val" style="font-size: 14px; height: 24px; overflow: hidden;">${summary.value.topDepartment.name}</div>
          <div class="card-diff">
             <span class="text-blue font-bold">${summary.value.topDepartment.value} ราย</span>
             ${getKpiBadge(summary.value.topDepartment.change)}
          </div>
        </div>
        <div class="card">
          <div class="card-title">โรคที่พบบ่อย</div>
          <div class="card-val" style="font-size: 14px; height: 24px; overflow: hidden;">${summary.value.topDiagnosis.name}</div>
          <div class="card-diff">
             <span class="text-blue font-bold">${summary.value.topDiagnosis.value} ราย</span>
             ${getKpiBadge(summary.value.topDiagnosis.change)}
          </div>
        </div>
        <div class="card">
          <div class="card-title">จ่ายยา (หน่วย)</div>
          <div class="card-val">${summary.value.dispensedThisMonth.value}</div>
          <div class="card-diff">
             ${getKpiBadge(summary.value.dispensedThisMonth.change)}
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="flex-2">
        <div class="col">
          <h2>สถิติรายแผนก (Departments)</h2>
          <table>
            <thead>
              <tr>
                <th>แผนก</th>
                <th class="text-right">ผู้ป่วย</th>
                <th class="text-right">ใช้ยา</th>
                <th class="text-right">KPI (%)</th>
              </tr>
            </thead>
            <tbody>
              ${departmentStats.value.slice(0, 8).map(d => `
                <tr>
                  <td>${d.department}</td>
                  <td class="text-right">${d.patientCount}</td>
                  <td class="text-right">${d.medicineCount}</td>
                  <td class="text-right">
                    ${getKpiBadge(d.change)}
                  </td>
                </tr>
              `).join('')}
              ${departmentStats.value.length === 0 ? '<tr><td colspan="4" class="muted text-center">ไม่มีข้อมูล</td></tr>' : ''}
            </tbody>
          </table>
        </div>
        <div class="col">
           <div class="chart-container">
             <div class="muted" style="margin-bottom:8px; font-weight: 600;">กราฟเปรียบเทียบรายแผนก</div>
             ${barCanvasImage.value ? `<img src="${barCanvasImage.value}" />` : '<div class="muted">ไม่มีกราฟ</div>'}
           </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>รายการยาที่ใช้มากที่สุด (Top 10 Medicines)</h2>
      <table>
        <thead>
          <tr>
            <th>รายการยา</th>
            <th>อาการที่พบบ่อย</th>
            <th class="text-right">จำนวนที่จ่าย</th>
            <th class="text-right">KPI (%)</th>
          </tr>
        </thead>
        <tbody>
          ${medicineStats.value.slice(0, 10).map(m => `
            <tr>
              <td>${m.name}</td>
              <td>${m.diagnosis}</td>
              <td class="text-right">${m.dispensedCount}</td>
              <td class="text-right">
                ${getKpiBadge(m.change)}
              </td>
            </tr>
          `).join('')}
          ${medicineStats.value.length === 0 ? '<tr><td colspan="4" class="muted text-center">ไม่มีข้อมูล</td></tr>' : ''}
        </tbody>
      </table>
    </div>

    <div class="section" style="page-break-before: always;">
      <h2>แนวโน้มการเข้ารับบริการ (Trends)</h2>
      <div class="chart-container">
        <div class="muted" style="margin-bottom:8px; font-weight: 600;">สถิติผู้ป่วยและการใช้ยา ย้อนหลัง</div>
        ${lineCanvasImage.value ? `<img src="${lineCanvasImage.value}" />` : '<div class="muted">ไม่มีกราฟ</div>'}
      </div>
    </div>

    <div class="section">
      <div class="flex-2">
        <div class="col">
          <h2>โรคที่พบบ่อย (Top Diagnosis)</h2>
          <table>
            <thead><tr><th>ชื่อโรค</th><th class="text-right">จำนวนครั้ง</th><th class="text-right">KPI (%)</th></tr></thead>
            <tbody>
              ${topDiagnoses.value.map(r => `
                <tr>
                  <td>${r.diagnosis}</td>
                  <td class="text-right">${r.count}</td>
                  <td class="text-right">
                    ${getKpiBadge(r.change)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="col">
           <h2>ผู้ป่วยล่าสุด</h2>
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

    <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center;" class="muted">
      รายงานนี้สร้างขึ้นโดยอัตโนมัติจากระบบ Clinic TDL Dashboard
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
    <div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 relative z-10">
      <!-- Patients -->
      <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium text-nowrap">ผู้ป่วย ({{ dateRangeLabel }})</span>
          <div class="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-user-injured text-clinic-blue dark:text-blue-400 text-sm"></i>
          </div>
        </div>
        <div class="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {{ summary.patientsThisMonth.value }}
        </div>
        <div
          class="text-xs font-medium flex items-center gap-1"
          :class="summary.patientsThisMonth.change > 0 ? 'text-red-500' : summary.patientsThisMonth.change < 0 ? 'text-emerald-500' : 'text-slate-400'"
        >
          <i v-if="summary.patientsThisMonth.change !== 0" :class="summary.patientsThisMonth.change > 0 ? 'fa-solid fa-arrow-trend-up' : 'fa-solid fa-arrow-trend-down'"></i>
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
      <div 
        class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors group"
        @click="openDeptDetails(summary.topDepartment.name)"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium text-nowrap">แผนกสูงสุด</span>
          <div class="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
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
            :class="summary.topDepartment.change > 0 ? 'text-red-500' : summary.topDepartment.change < 0 ? 'text-emerald-500' : 'text-slate-400'"
          >
            <i v-if="summary.topDepartment.change !== 0" :class="summary.topDepartment.change > 0 ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'"></i>
            {{ Math.abs(summary.topDepartment.change).toFixed(1) }}%
          </div>
        </div>
        <div class="text-[10px] text-slate-400">
          คิดเป็น {{ summary.topDepartment.percentOfTotal.toFixed(1) }}% ของทั้งหมด
        </div>
      </div>

      <!-- Top Diagnosis -->
      <div 
        class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-all group relative z-30 pointer-events-auto"
        @click="openDiagDetails(summary.topDiagnosis.name)"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium text-nowrap">โรคที่พบบ่อย</span>
          <div class="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
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
            :class="summary.topDiagnosis.change > 0 ? 'text-red-500' : summary.topDiagnosis.change < 0 ? 'text-emerald-500' : 'text-slate-400'"
          >
            <i v-if="summary.topDiagnosis.change !== 0" :class="summary.topDiagnosis.change > 0 ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'"></i>
            {{ Math.abs(summary.topDiagnosis.change).toFixed(1) }}%
          </div>
        </div>
        <div class="text-[10px] text-slate-400">
          คิดเป็น {{ summary.topDiagnosis.percentOfTotal.toFixed(1) }}% ของทั้งหมด
        </div>
      </div>

      <!-- Dispensed -->
      <div 
        class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-all group relative z-30 pointer-events-auto"
        @click="openDispensedDetails"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium text-nowrap">ยาที่จ่าย ({{ dateRangeLabel }})</span>
          <div class="w-8 h-8 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <i class="fa-solid fa-prescription-bottle-medical text-orange-600 dark:text-orange-400 text-sm"></i>
          </div>
        </div>
        <div class="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {{ summary.dispensedThisMonth.value }}
        </div>
        <div
          class="text-xs font-medium flex items-center gap-1"
          :class="summary.dispensedThisMonth.change > 0 ? 'text-red-500' : summary.dispensedThisMonth.change < 0 ? 'text-emerald-500' : 'text-slate-400'"
        >
          <i v-if="summary.dispensedThisMonth.change !== 0" :class="summary.dispensedThisMonth.change > 0 ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'"></i>
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
            class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors group"
            @click="openDiagDetails(row.diagnosis)"
          >
            <div class="flex items-center gap-1.5 overflow-hidden">
              <span class="w-4 h-4 flex items-center justify-center rounded-full bg-white dark:bg-slate-600 text-slate-500 font-bold text-[9px] shadow-sm group-hover:text-rose-600 transition-colors">
                {{ i + 1 }}
              </span>
              <span class="truncate font-medium text-slate-700 dark:text-slate-200 group-hover:text-rose-600 transition-colors" :title="row.diagnosis">{{ row.diagnosis }}</span>
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
            class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors group"
            @click="openMedicineDetails(row.name)"
          >
            <div class="flex items-center gap-1.5 overflow-hidden">
              <span class="w-4 h-4 flex items-center justify-center rounded-full bg-white dark:bg-slate-600 text-slate-500 font-bold text-[9px] shadow-sm group-hover:text-indigo-600 transition-colors">
                {{ i + 1 }}
              </span>
              <span class="truncate font-medium text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 transition-colors" :title="row.name">{{ row.name }}</span>
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
            class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 cursor-pointer hover:bg-clinic-blue/10 dark:hover:bg-clinic-blue/20 transition-colors group"
            @click="openDeptDetails(row.department)"
          >
            <div class="flex items-center gap-1.5 overflow-hidden">
              <span class="w-4 h-4 flex items-center justify-center rounded-full bg-white dark:bg-slate-600 text-slate-500 font-bold text-[9px] shadow-sm group-hover:text-clinic-blue transition-colors">
                {{ deptPageIndex * 7 + i + 1 }}
              </span>
              <span class="truncate font-medium text-slate-700 dark:text-slate-200 group-hover:text-clinic-blue transition-colors" :title="row.department">{{ row.department }}</span>
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
            class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 cursor-pointer hover:bg-clinic-blue/10 dark:hover:bg-clinic-blue/20 transition-colors group"
            @click="openLeaveDetails(row.department)"
          >
            <div class="flex items-center gap-1.5 overflow-hidden">
              <span class="w-4 h-4 flex items-center justify-center rounded-full bg-white dark:bg-slate-600 text-slate-500 font-bold text-[9px] shadow-sm group-hover:text-clinic-blue transition-colors">
                {{ leavePageIndex * 7 + i + 1 }}
              </span>
              <span class="truncate font-medium text-slate-700 dark:text-slate-200 group-hover:text-clinic-blue transition-colors" :title="row.department">{{ row.department }}</span>
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

    <!-- Modals -->
    <Teleport to="body">
      <!-- Dept Details Modal -->
      <div v-if="showDeptModal" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showDeptModal = false"></div>
        <div class="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-clinic-border dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20">
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-white">รายละเอียดแผนก: {{ selectedDept }}</h3>
              <p class="text-xs text-slate-500 mt-0.5">ช่วงเวลา: {{ dateRangeLabel }}</p>
            </div>
            <button @click="showDeptModal = false" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <i class="fa-solid fa-xmark text-slate-500"></i>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <div v-if="loadingDeptDetails" class="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <i class="fa-solid fa-circle-notch fa-spin text-3xl text-clinic-blue"></i>
              <p class="text-sm font-medium">กำลังโหลดข้อมูล...</p>
            </div>
            <template v-else>
              <!-- Diagnosis Summary -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white dark:bg-slate-900/40 border border-clinic-border dark:border-slate-700 rounded-xl p-4">
                  <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-chart-pie text-clinic-blue"></i>
                    สรุปอาการ/การวินิจฉัย
                  </h4>
                  <div class="space-y-2">
                    <div v-for="item in diagnosisSummary" :key="item.name" class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <span class="text-xs text-slate-600 dark:text-slate-300 font-medium">{{ item.name }}</span>
                      <span class="text-xs font-bold text-clinic-blue">{{ item.count }} คน</span>
                    </div>
                    <div v-if="!diagnosisSummary.length" class="text-center py-4 text-xs text-slate-400">ไม่พบข้อมูลการวินิจฉัย</div>
                  </div>
                </div>
                
                <div class="flex flex-col justify-center items-center p-6 bg-clinic-blue/5 dark:bg-clinic-blue/10 rounded-xl border border-clinic-blue/20">
                  <div class="text-3xl font-black text-clinic-blue mb-1">{{ deptDetails.length }}</div>
                  <div class="text-xs font-bold text-slate-500 uppercase tracking-widest">จำนวนผู้ป่วยทั้งหมดในแผนก</div>
                </div>
              </div>

              <!-- Detailed Table -->
              <div class="space-y-3">
                <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <i class="fa-solid fa-list-ul text-clinic-blue"></i>
                  รายชื่อผู้เข้ารับการรักษา
                </h4>
                <div class="overflow-x-auto border border-clinic-border dark:border-slate-700 rounded-xl shadow-sm">
                  <table class="min-w-full text-xs">
                    <thead class="bg-slate-50 dark:bg-slate-900/50 text-slate-500 border-b border-clinic-border dark:border-slate-700">
                      <tr>
                        <th class="py-3 px-4 text-left font-semibold">เวลา</th>
                        <th class="py-3 px-4 text-left font-semibold">รหัสพนักงาน</th>
                        <th class="py-3 px-4 text-left font-semibold">ชื่อ-นามสกุล</th>
                        <th class="py-3 px-4 text-left font-semibold">อาการ/วินิจฉัย</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-clinic-border/60 dark:divide-slate-700">
                      <tr v-for="row in deptDetails" :key="row.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td class="py-3 px-4 text-slate-500">
                          {{ new Date(row.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
                        </td>
                        <td class="py-3 px-4 font-mono text-slate-500">{{ row.employee_code }}</td>
                        <td class="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{{ row.fullname }}</td>
                        <td class="py-3 px-4">
                          <span class="px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-medium">
                            {{ row.diagnosis }}
                          </span>
                        </td>
                      </tr>
                      <tr v-if="!deptDetails.length">
                        <td colspan="4" class="py-10 text-center text-slate-400 italic">ไม่พบข้อมูลรายละเอียด</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-clinic-border dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 text-right">
            <button @click="showDeptModal = false" class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>

      <!-- Medicine Details Modal -->
      <div v-if="showMedicineModal" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showMedicineModal = false"></div>
        <div class="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-clinic-border dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20">
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-white">รายละเอียดตัวยา: {{ selectedMedicineName }}</h3>
              <p class="text-xs text-slate-500 mt-0.5">ช่วงเวลา: {{ dateRangeLabel }}</p>
            </div>
            <button @click="showMedicineModal = false" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <i class="fa-solid fa-xmark text-slate-500"></i>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <div v-if="loadingMedicineDetails" class="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <i class="fa-solid fa-circle-notch fa-spin text-3xl text-clinic-blue"></i>
              <p class="text-sm font-medium">กำลังโหลดข้อมูล...</p>
            </div>
            <template v-else>
              <!-- Summary Grid -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white dark:bg-slate-900/40 border border-clinic-border dark:border-slate-700 rounded-xl p-4">
                  <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-trophy text-indigo-500"></i>
                    ผู้ที่ได้รับยานี้มากที่สุด (Top 10)
                  </h4>
                  <div class="space-y-2">
                    <div v-for="item in medicinePersonSummary" :key="item.code" class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div class="flex flex-col">
                        <span class="text-xs text-slate-900 dark:text-slate-100 font-bold">{{ item.name }}</span>
                        <span class="text-[10px] text-slate-500 font-mono">{{ item.code }}</span>
                      </div>
                      <span class="text-xs font-bold text-indigo-600">{{ item.total }} หน่วย</span>
                    </div>
                    <div v-if="!medicinePersonSummary.length" class="text-center py-4 text-xs text-slate-400">ไม่พบข้อมูล</div>
                  </div>
                </div>
                
                <div class="flex flex-col justify-center items-center p-6 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-200 dark:border-indigo-800/50">
                  <div class="text-3xl font-black text-indigo-600 mb-1">
                    {{ medicineDetails.reduce((acc, curr) => acc + (curr.amount || 0), 0) }}
                  </div>
                  <div class="text-xs font-bold text-slate-500 uppercase tracking-widest">จำนวนหน่วยยารวมที่จ่าย</div>
                </div>
              </div>

              <!-- Detailed Table -->
              <div class="space-y-3">
                <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <i class="fa-solid fa-receipt text-indigo-500"></i>
                  ประวัติการจ่ายยานี้
                </h4>
                <div class="overflow-x-auto border border-clinic-border dark:border-slate-700 rounded-xl shadow-sm">
                  <table class="min-w-full text-xs">
                    <thead class="bg-slate-50 dark:bg-slate-900/50 text-slate-500 border-b border-clinic-border dark:border-slate-700">
                      <tr>
                        <th class="py-3 px-4 text-left font-semibold">เวลา</th>
                        <th class="py-3 px-4 text-left font-semibold">ชื่อ-นามสกุล</th>
                        <th class="py-3 px-4 text-left font-semibold">แผนก</th>
                        <th class="py-3 px-4 text-left font-semibold">อาการ/วินิจฉัย</th>
                        <th class="py-3 px-4 text-right font-semibold">จำนวน</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-clinic-border/60 dark:divide-slate-700">
                      <tr v-for="row in medicineDetails" :key="row.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td class="py-3 px-4 text-slate-500">
                          {{ new Date(row.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
                        </td>
                        <td class="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{{ row.fullname }}</td>
                        <td class="py-3 px-4 text-slate-500">{{ row.department }}</td>
                        <td class="py-3 px-4">
                          <span class="px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-medium">
                            {{ row.diagnosis }}
                          </span>
                        </td>
                        <td class="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                          {{ row.amount }}
                        </td>
                      </tr>
                      <tr v-if="!medicineDetails.length">
                        <td colspan="5" class="py-10 text-center text-slate-400 italic">ไม่พบข้อมูลรายละเอียด</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-clinic-border dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 text-right">
            <button @click="showMedicineModal = false" class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>

      <!-- Diag Details Modal -->
      <div v-if="showDiagModal" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showDiagModal = false"></div>
        <div class="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-clinic-border dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20">
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-white">รายละเอียดโรค: {{ selectedDiagName }}</h3>
              <p class="text-xs text-slate-500 mt-0.5">ช่วงเวลา: {{ dateRangeLabel }}</p>
            </div>
            <button @click="showDiagModal = false" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <i class="fa-solid fa-xmark text-slate-500"></i>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <div v-if="loadingDiagDetails" class="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <i class="fa-solid fa-circle-notch fa-spin text-3xl text-clinic-blue"></i>
              <p class="text-sm font-medium">กำลังโหลดข้อมูล...</p>
            </div>
            <template v-else>
              <!-- Summary Grid -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white dark:bg-slate-900/40 border border-clinic-border dark:border-slate-700 rounded-xl p-4">
                  <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-building text-emerald-500"></i>
                    แยกตามแผนก
                  </h4>
                  <div class="space-y-2">
                    <div v-for="item in diagDeptSummary" :key="item.name" class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <span class="text-xs text-slate-600 dark:text-slate-300 font-medium">{{ item.name }}</span>
                      <span class="text-xs font-bold text-emerald-600">{{ item.count }} คน</span>
                    </div>
                    <div v-if="!diagDeptSummary.length" class="text-center py-4 text-xs text-slate-400">ไม่พบข้อมูลแผนก</div>
                  </div>
                </div>
                
                <div class="flex flex-col justify-center items-center p-6 bg-rose-50 dark:bg-rose-900/10 rounded-xl border border-rose-200 dark:border-rose-800/50">
                  <div class="text-3xl font-black text-rose-600 mb-1">{{ diagDetails.length }}</div>
                  <div class="text-xs font-bold text-slate-500 uppercase tracking-widest">พนักงานที่เป็นโรคนี้ทั้งหมด</div>
                </div>
              </div>

              <!-- Detailed Table -->
              <div class="space-y-3">
                <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <i class="fa-solid fa-users text-rose-500"></i>
                  รายชื่อพนักงานที่เป็นโรคนี้
                </h4>
                <div class="overflow-x-auto border border-clinic-border dark:border-slate-700 rounded-xl shadow-sm">
                  <table class="min-w-full text-xs">
                    <thead class="bg-slate-50 dark:bg-slate-900/50 text-slate-500 border-b border-clinic-border dark:border-slate-700">
                      <tr>
                        <th class="py-3 px-4 text-left font-semibold">เวลา</th>
                        <th class="py-3 px-4 text-left font-semibold">รหัสพนักงาน</th>
                        <th class="py-3 px-4 text-left font-semibold">ชื่อ-นามสกุล</th>
                        <th class="py-3 px-4 text-left font-semibold">แผนก</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-clinic-border/60 dark:divide-slate-700">
                      <tr v-for="row in diagDetails" :key="row.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td class="py-3 px-4 text-slate-500">
                          {{ new Date(row.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
                        </td>
                        <td class="py-3 px-4 font-mono text-slate-500">{{ row.employee_code }}</td>
                        <td class="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{{ row.fullname }}</td>
                        <td class="py-3 px-4 text-slate-500">{{ row.department }}</td>
                      </tr>
                      <tr v-if="!diagDetails.length">
                        <td colspan="4" class="py-10 text-center text-slate-400 italic">ไม่พบข้อมูลรายละเอียด</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-clinic-border dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 text-right">
            <button @click="showDiagModal = false" class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>

      <!-- Dispensed Details Modal -->
      <div v-if="showDispensedModal" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showDispensedModal = false"></div>
        <div class="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-clinic-border dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20">
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-white">รายละเอียดการจ่ายยา</h3>
              <p class="text-xs text-slate-500 mt-0.5">ช่วงเวลา: {{ dateRangeLabel }}</p>
            </div>
            <button @click="showDispensedModal = false" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <i class="fa-solid fa-xmark text-slate-500"></i>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <div v-if="loadingDispensedDetails" class="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <i class="fa-solid fa-circle-notch fa-spin text-3xl text-clinic-blue"></i>
              <p class="text-sm font-medium">กำลังโหลดข้อมูล...</p>
            </div>
            <template v-else>
              <!-- Summary Grid -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white dark:bg-slate-900/40 border border-clinic-border dark:border-slate-700 rounded-xl p-4">
                  <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-trophy text-orange-500"></i>
                    ผู้ที่ได้รับยามากที่สุด (Top 10)
                  </h4>
                  <div class="space-y-2">
                    <div v-for="item in dispensedPersonSummary" :key="item.code" class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div class="flex flex-col">
                        <span class="text-xs text-slate-900 dark:text-slate-100 font-bold">{{ item.name }}</span>
                        <span class="text-[10px] text-slate-500 font-mono">{{ item.code }}</span>
                      </div>
                      <span class="text-xs font-bold text-orange-600">{{ item.total }} หน่วย</span>
                    </div>
                    <div v-if="!dispensedPersonSummary.length" class="text-center py-4 text-xs text-slate-400">ไม่พบข้อมูล</div>
                  </div>
                </div>
                
                <div class="flex flex-col justify-center items-center p-6 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-200 dark:border-orange-800/50">
                  <div class="text-3xl font-black text-orange-600 mb-1">{{ summary.dispensedThisMonth.value }}</div>
                  <div class="text-xs font-bold text-slate-500 uppercase tracking-widest">จำนวนหน่วยยารวมที่จ่าย</div>
                </div>
              </div>

              <!-- Detailed Table -->
              <div class="space-y-3">
                <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <i class="fa-solid fa-receipt text-orange-500"></i>
                  รายการการจ่ายยาทั้งหมด
                </h4>
                <div class="overflow-x-auto border border-clinic-border dark:border-slate-700 rounded-xl shadow-sm">
                  <table class="min-w-full text-xs">
                    <thead class="bg-slate-50 dark:bg-slate-900/50 text-slate-500 border-b border-clinic-border dark:border-slate-700">
                      <tr>
                        <th class="py-3 px-4 text-left font-semibold">เวลา</th>
                        <th class="py-3 px-4 text-left font-semibold">ชื่อ-นามสกุล</th>
                        <th class="py-3 px-4 text-left font-semibold">แผนก</th>
                        <th class="py-3 px-4 text-left font-semibold">ยาที่ได้รับ</th>
                        <th class="py-3 px-4 text-right font-semibold">จำนวน</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-clinic-border/60 dark:divide-slate-700">
                      <tr v-for="row in dispensedDetails" :key="row.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td class="py-3 px-4 text-slate-500">
                          {{ new Date(row.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
                        </td>
                        <td class="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{{ row.fullname }}</td>
                        <td class="py-3 px-4 text-slate-500">{{ row.department }}</td>
                        <td class="py-3 px-4">
                          <span class="px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium">
                            {{ row.medicineName }}
                          </span>
                        </td>
                        <td class="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                          {{ row.amount }}
                        </td>
                      </tr>
                      <tr v-if="!dispensedDetails.length">
                        <td colspan="5" class="py-10 text-center text-slate-400 italic">ไม่พบข้อมูลรายละเอียด</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-clinic-border dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 text-right">
            <button @click="showDispensedModal = false" class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>

      <!-- Leave Details Modal -->
      <div v-if="showLeaveModal" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showLeaveModal = false"></div>
        <div class="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-clinic-border dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20">
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-white">รายละเอียดการลาพัก: {{ selectedLeaveDept }}</h3>
              <p class="text-xs text-slate-500 mt-0.5">ช่วงเวลา: {{ dateRangeLabel }}</p>
            </div>
            <button @click="showLeaveModal = false" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <i class="fa-solid fa-xmark text-slate-500"></i>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <div v-if="loadingLeaveDetails" class="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <i class="fa-solid fa-circle-notch fa-spin text-3xl text-clinic-blue"></i>
              <p class="text-sm font-medium">กำลังโหลดข้อมูล...</p>
            </div>
            <template v-else>
              <div class="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <i class="fa-solid fa-calendar-xmark text-lg"></i>
                  </div>
                  <div>
                    <div class="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">การลาพักรวม</div>
                    <div class="text-sm text-amber-600 dark:text-amber-400 font-medium">ในแผนก {{ selectedLeaveDept }} ช่วง {{ dateRangeLabel }}</div>
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-2xl font-black text-amber-600 dark:text-amber-400">{{ leaveDetails.length }}</div>
                  <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ครั้งที่ลา</div>
                </div>
              </div>

              <!-- Detailed Table -->
              <div class="space-y-3">
                <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <i class="fa-solid fa-users-rectangle text-amber-500"></i>
                  รายชื่อผู้ลาพักและช่วงเวลา
                </h4>
                <div class="overflow-x-auto border border-clinic-border dark:border-slate-700 rounded-xl shadow-sm">
                  <table class="min-w-full text-xs">
                    <thead class="bg-slate-50 dark:bg-slate-900/50 text-slate-500 border-b border-clinic-border dark:border-slate-700">
                      <tr>
                        <th class="py-3 px-4 text-left font-semibold">บันทึกเมื่อ</th>
                        <th class="py-3 px-4 text-left font-semibold">รหัสพนักงาน</th>
                        <th class="py-3 px-4 text-left font-semibold">ชื่อ-นามสกุล</th>
                        <th class="py-3 px-4 text-left font-semibold">ช่วงวันที่ลาพัก</th>
                        <th class="py-3 px-4 text-right font-semibold">รวมจำนวนวัน</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-clinic-border/60 dark:divide-slate-700">
                      <tr v-for="row in leaveDetails" :key="row.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td class="py-3 px-4 text-slate-500">
                          {{ new Date(row.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
                        </td>
                        <td class="py-3 px-4 font-mono text-slate-500">{{ row.employee_code }}</td>
                        <td class="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{{ row.fullname }}</td>
                        <td class="py-3 px-4">
                          <span class="px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 font-medium">
                            {{ row.period }}
                          </span>
                        </td>
                        <td class="py-3 px-4 text-right">
                          <span class="font-bold text-slate-900 dark:text-white">{{ row.days }}</span>
                          <span class="ml-1 text-slate-400">วัน</span>
                        </td>
                      </tr>
                      <tr v-if="!leaveDetails.length">
                        <td colspan="5" class="py-10 text-center text-slate-400 italic">ไม่พบข้อมูลการลาพัก</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-clinic-border dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 text-right">
            <button @click="showLeaveModal = false" class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.text-nowrap {
  white-space: nowrap;
}
</style>
