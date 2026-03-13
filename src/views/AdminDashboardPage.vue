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
  importedThisMonth: { value: 0, change: 0 },
  dispensedThisMonth: { value: 0, change: 0 },
})

const kpiLabels = ref([])
const kpiPatients = ref([])
const kpiUsage = ref([])
const prevImported = ref(0)
const prevDispensed = ref(0)
const lineCanvasImage = ref('')
const barCanvasImage = ref('')

const lastPatients = ref([])
const mostSymptoms = ref([])
const departmentStats = ref([]) // { department, patientCount, medicineCount }

const chartData = ref({
  labels: [],
  datasets: [],
})

const barChartData = ref({
  labels: [],
  datasets: [],
})

// Admin extras
const latestImports = ref([]) // { created_at, quantity, note, medicine: { name, sku, unit } }
const lowStockList = ref([]) // { name, sku, unit, current_stock, min_stock }
const LOW_STOCK_THRESHOLD = 20

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: {
    padding: { top: 8, right: 8, bottom: 8, left: 8 },
  },
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
          pointStyle: 'circle',
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
          pointStyle: 'circle',
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
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    const last15Start = new Date(now)
    last15Start.setDate(now.getDate() - 14)

    // Parallel Fetching
    const [
      patientsThisMonthRes,
      patientsLastMonthRes,
      totalStockRes,
      importedThisMonthRes,
      importedLastMonthRes,
      dispensedThisMonthRes,
      dispensedLastMonthRes,
      lastPatientsRes,
      kpiPatientsRes,
      usage15DaysRes,
      // Fetch for department stats
      allCheckupsMonthRes,
      allDispensingMonthRes,
      // Admin extras
      latestReceivesRes,
      lowStockRes,
    ] = await Promise.all([
      // 0: Patients This Month
      supabase
        .from('checkups')
        .select('id, created_at')
        .gte('created_at', thisMonthStart.toISOString()),
      // 1: Patients Last Month
      supabase
        .from('checkups')
        .select('id, created_at')
        .gte('created_at', lastMonthStart.toISOString())
        .lte('created_at', lastMonthEnd.toISOString()),
      // 2: Total Stock
      supabase.from('medicine_list').select('id, current_stock'),
      // 3: Imported This Month
      supabase
        .from('stock_transactions')
        .select('id, quantity, transaction_type, created_at')
        .in('transaction_type', ['RECEIVE'])
        .gte('created_at', thisMonthStart.toISOString()),
      // 4: Imported Last Month
      supabase
        .from('stock_transactions')
        .select('id, quantity, transaction_type, created_at')
        .in('transaction_type', ['RECEIVE'])
        .gte('created_at', lastMonthStart.toISOString())
        .lte('created_at', lastMonthEnd.toISOString()),
      // 5: Dispensed This Month
      supabase
        .from('dispensing_records')
        .select('id, amount, created_at')
        .gte('created_at', thisMonthStart.toISOString()),
      // 6: Dispensed Last Month
      supabase
        .from('dispensing_records')
        .select('id, amount, created_at')
        .gte('created_at', lastMonthStart.toISOString())
        .lte('created_at', lastMonthEnd.toISOString()),
      // 7: Last 5 Patients
      supabase
        .from('checkups')
        .select('id, created_at, diagnosis, employees(employee_code, fullname, department), dispensing_records(amount)')
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .order('created_at', { ascending: false })
        .limit(5),
      // 8: KPI Patients (15 Days)
      supabase
        .from('checkups')
        .select('id, created_at, symptoms, diagnosis, clinic_location')
        .gte('created_at', last15Start.toISOString()),
      // 9: Usage (15 Days)
      supabase
        .from('dispensing_records')
        .select('id, created_at, amount')
        .gte('created_at', last15Start.toISOString()),
      // 10: All Checkups This Month (with Department)
      supabase
        .from('checkups')
        .select('id, employees(department)')
        .gte('created_at', thisMonthStart.toISOString()),
      // 11: All Dispensing This Month (with Department via Checkup)
      supabase
        .from('dispensing_records')
        .select('id, amount, checkup:checkups(employees(department))')
        .gte('created_at', thisMonthStart.toISOString()),
      // 12: Latest 10 receive transactions with medicine info
      supabase
        .from('stock_transactions')
        .select('id, created_at, quantity, note, medicine:medicine_list(name, sku, unit)')
        .eq('transaction_type', 'RECEIVE')
        .order('created_at', { ascending: false })
        .limit(5),
      // 13: Low stock list
      supabase
        .from('medicine_list')
        .select('id, name, unit, current_stock, group')
        .order('current_stock', { ascending: true })
        .limit(20),
    ])

    // --- Process Summary ---
    const patientsThisMonth = patientsThisMonthRes.data || []
    const patientsLastMonth = patientsLastMonthRes.data || []
    const totalStockRows = totalStockRes.data || []
    const importedThisMonth = importedThisMonthRes.data || []
    const importedLastMonth = importedLastMonthRes.data || []
    const dispensedThisMonth = dispensedThisMonthRes.data || []
    const dispensedLastMonth = dispensedLastMonthRes.data || []

    const totalStockValue = totalStockRows.reduce((sum, r) => sum + (r.current_stock || 0), 0)
    const importedThisMonthValue = importedThisMonth.reduce((sum, r) => sum + (r.quantity || 0), 0)
    const importedLastMonthValue = importedLastMonth.reduce((sum, r) => sum + (r.quantity || 0), 0)
    const dispensedThisMonthValue = dispensedThisMonth.reduce((sum, r) => sum + (r.amount || 0), 0)
    const dispensedLastMonthValue = dispensedLastMonth.reduce((sum, r) => sum + (r.amount || 0), 0)

    summary.value = {
      patientsThisMonth: {
        value: patientsThisMonth.length,
        change: computeChangePercent(patientsThisMonth.length, patientsLastMonth.length),
      },
      totalStock: {
        value: totalStockValue,
        change: 0,
      },
      importedThisMonth: {
        value: importedThisMonthValue,
        change: computeChangePercent(importedThisMonthValue, importedLastMonthValue),
      },
      dispensedThisMonth: {
        value: dispensedThisMonthValue,
        change: computeChangePercent(dispensedThisMonthValue, dispensedLastMonthValue),
      },
    }
    prevImported.value = importedLastMonthValue
    prevDispensed.value = dispensedLastMonthValue

    // --- Process Last Patients ---
    lastPatients.value = (lastPatientsRes.data || []).map((r) => ({
      ...r,
      fullname: r?.employees?.fullname || '-',
      employee_code: r?.employees?.employee_code || '-',
      department: r?.employees?.department || '-',
      amount: (r?.dispensing_records || []).reduce((sum, d) => sum + (d.amount || 0), 0),
    }))

    // --- Process Most Symptoms ---
    const thisMonthCheckups = kpiPatientsRes.data || []
    mostSymptoms.value = topCounts(thisMonthCheckups, 'diagnosis', 7).map((r) => ({
      symptoms: r.key,
      count: r.count,
    }))

    // --- Process KPI Line Chart (15 Days) ---
    const patientByDay = {}
    const usageByDay = {}

    ;(kpiPatientsRes.data || []).forEach((row) => {
      const day = dayKey(row.created_at)
      patientByDay[day] = (patientByDay[day] || 0) + 1
    })

    ;(usage15DaysRes.data || []).forEach((row) => {
      const day = dayKey(row.created_at)
      usageByDay[day] = (usageByDay[day] || 0) + (row.amount || 0)
    })

    const days = []
    const displayLabels = []
    for (let d = new Date(last15Start); d <= now; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().slice(0, 10))
      const dayNum = String(d.getDate()).padStart(2, '0')
      const monthLabel = thaiMonthsShort[d.getMonth()] || ''
      displayLabels.push(`${dayNum} ${monthLabel}`)
    }

    kpiLabels.value = displayLabels
    kpiPatients.value = days.map((d) => patientByDay[d] || 0)
    kpiUsage.value = days.map((d) => usageByDay[d] || 0)

    // --- Process Department Stats (New) ---
    const depMap = {} // department -> { patientCount, medicineCount }
    
    // Count Patients
    ;(allCheckupsMonthRes.data || []).forEach(r => {
      const dep = r?.employees?.department || 'Unknown'
      if (!depMap[dep]) depMap[dep] = { department: dep, patientCount: 0, medicineCount: 0 }
      depMap[dep].patientCount++
    })

    // Count Medicine
    ;(allDispensingMonthRes.data || []).forEach(r => {
      const dep = r?.checkup?.employees?.department || 'Unknown'
      const amt = r.amount || 0
      if (!depMap[dep]) depMap[dep] = { department: dep, patientCount: 0, medicineCount: 0 }
      depMap[dep].medicineCount += amt
    })

    departmentStats.value = Object.values(depMap).sort((a, b) => b.patientCount - a.patientCount)

    // --- Process Admin Extras ---
    latestImports.value = (latestReceivesRes.data || []).map(r => ({
      created_at: r.created_at,
      quantity: r.quantity || 0,
      note: r.note || '',
      medicine: {
        name: r?.medicine?.name || '-',
        sku: r?.medicine?.sku || '',
        unit: r?.medicine?.unit || '',
      },
    }))
    const threshold = LOW_STOCK_THRESHOLD
    const lowRows = (lowStockRes.data || []).filter(m =>
      (m?.group || '').toString().trim() !== 'เครื่องมือแพทย์' &&
      Number(m?.current_stock ?? 0) <= threshold
    )
    lowStockList.value = lowRows.slice(0, 10)

  } catch (err) {
    console.error('Dashboard load error', err)
  } finally {
    loading.value = false
  }
}

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
      .chart-container { text-align: center; margin-top: 16px; }
      img { max-width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; }
    </style>
  </head>
  <body>
    <h1>รายงานแดชบอร์ดคลินิก TDL</h1>
    <div class="muted">สร้างเมื่อ: ${fmt(now)}</div>

    <div class="section">
      <h2>สรุปภาพรวม (เทียบกับเดือนก่อนหน้า)</h2>
      <div class="grid-4">
        <div class="card">
          <div class="card-title">ผู้ป่วยเดือนนี้</div>
          <div class="card-val">${summary.value.patientsThisMonth.value}</div>
          <div class="card-diff ${summary.value.patientsThisMonth.change >= 0 ? 'text-green' : 'text-red'}">
            ${summary.value.patientsThisMonth.change.toFixed(1)}%
          </div>
        </div>
        <div class="card">
          <div class="card-title">สต็อกยาทั้งหมด</div>
          <div class="card-val">${summary.value.totalStock.value}</div>
          <div class="card-diff text-green">&nbsp;</div>
        </div>
        <div class="card">
          <div class="card-title">รับเข้าเดือนนี้</div>
          <div class="card-val">${summary.value.importedThisMonth.value}</div>
          <div class="card-diff ${summary.value.importedThisMonth.change >= 0 ? 'text-green' : 'text-red'}">
            ${diffText(summary.value.importedThisMonth.value, prevImported.value)}
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
      <h2>ผู้ป่วยล่าสุด (วันนี้)</h2>
      <table>
        <thead>
          <tr>
            <th>เวลา</th>
            <th>รหัส</th>
            <th>ชื่อ</th>
            <th>แผนก</th>
            <th>อาการ</th>
            <th>จ่ายยา (หน่วย)</th>
          </tr>
        </thead>
        <tbody>
          ${lastPatients.value.map(p => `
            <tr>
              <td>${new Date(p.created_at).toLocaleTimeString('th-TH')}</td>
              <td>${p.employee_code}</td>
              <td>${p.fullname}</td>
              <td>${p.department}</td>
              <td>${p.diagnosis}</td>
              <td>${p.amount}</td>
            </tr>
          `).join('')}
          ${lastPatients.value.length === 0 ? '<tr><td colspan="6" style="text-align:center;">ไม่มีข้อมูล</td></tr>' : ''}
        </tbody>
      </table>
    </div>
    
    <div class="section">
      <h2>สถิติผู้ป่วยและยา (15 วันล่าสุด)</h2>
      <div class="chart-container">
        <img src="${lineCanvasImage.value}" alt="Line Chart" />
      </div>
    </div>

    <div class="section">
      <h2>สถิติแผนก (เดือนนี้)</h2>
      <div class="chart-container">
        <img src="${barCanvasImage.value}" alt="Bar Chart" />
      </div>
    </div>

    <div class="section">
      <h2>อาการที่พบบ่อย (15 วันล่าสุด)</h2>
      <table>
        <thead>
          <tr>
            <th>อาการ</th>
            <th>จำนวน (ครั้ง)</th>
          </tr>
        </thead>
        <tbody>
          ${mostSymptoms.value.map(s => `
            <tr>
              <td>${s.symptoms}</td>
              <td>${s.count}</td>
            </tr>
          `).join('')}
          ${mostSymptoms.value.length === 0 ? '<tr><td colspan="2" style="text-align:center;">ไม่มีข้อมูล</td></tr>' : ''}
        </tbody>
      </table>
    </div>

  </body>
</html>
    `
    w.document.write(html)
    w.document.close()
    w.print()
  } catch (err) {
    console.error(err)
    alert('Failed to generate PDF')
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
        แดชบอร์ด
      </h1>
      <!-- <button
        type="button"
        class="inline-flex items-center justify-center gap-1 rounded-lg bg-clinic-blue text-white px-3 py-2 text-xs hover:bg-blue-700"
        @click="exportDashboardPdf"
      >
        <i class="fa-solid fa-print"></i>
        <span>พิมพ์รายงาน</span>
      </button> -->
    </div>

    <div v-if="loading" class="text-center py-10 text-slate-500">
      กำลังโหลดข้อมูล...
    </div>

    <div v-else class="space-y-4">
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <!-- Patients -->
        <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500 font-medium">ผู้ป่วยเดือนนี้</span>
            <div class="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
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
            {{ Math.abs(summary.patientsThisMonth.change).toFixed(1) }}% เทียบเดือนก่อน
          </div>
        </div>

        <!-- Stock -->
        <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500 font-medium">สต็อกยารวม</span>
            <div class="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
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

        <!-- Import -->
        <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500 font-medium">นำเข้าเดือนนี้</span>
            <div class="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <i class="fa-solid fa-truck-medical text-emerald-600 dark:text-emerald-400 text-sm"></i>
            </div>
          </div>
          <div class="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {{ summary.importedThisMonth.value }}
          </div>
          <div
            class="text-xs font-medium flex items-center gap-1"
            :class="summary.importedThisMonth.change >= 0 ? 'text-red-500' : 'text-emerald-500'"
          >
            <i :class="summary.importedThisMonth.change >= 0 ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'"></i>
            {{ Math.abs(summary.importedThisMonth.change).toFixed(1) }}% เทียบเดือนก่อน
          </div>
        </div>

        <!-- Dispensed -->
        <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500 font-medium">จ่ายยาเดือนนี้</span>
            <div class="w-8 h-8 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center">
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
            {{ Math.abs(summary.dispensedThisMonth.change).toFixed(1) }}% เทียบเดือนก่อน
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 h-80 flex flex-col overflow-hidden">
          <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            <i class="fa-solid fa-chart-line text-blue-500 mr-2"></i>
            สถิติผู้ป่วยและยา (15 วันล่าสุด)
          </h2>
          <div class="flex-1 min-h-0 relative w-full">
            <Line id="line" :data="chartData" :options="chartOptions" />
          </div>
        </div>
        <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-4 h-80 flex flex-col overflow-hidden">
          <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            <i class="fa-solid fa-layer-group text-indigo-500 mr-2"></i>
            สถิติแผนก (เดือนนี้)
          </h2>
          <div class="flex-1 min-h-0 relative w-full">
            <Bar id="bar" :data="barChartData" :options="chartOptions" />
          </div>
        </div>
      </div>

      <!-- Admin Extras: Latest Imports & Low Stock -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Latest Imports -->
        <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3">
          <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 px-1">
            <i class="fa-solid fa-boxes-stacked text-emerald-500 mr-2"></i>
            รายการรับเข้า ล่าสุด
          </h2>
          <table class="min-w-full text-xs">
            <thead>
              <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
                <th class="py-2 pr-2">เวลา</th>
                <th class="py-2 pr-2">ยา</th>
                <th class="py-2 pr-2 text-right">จำนวน</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in latestImports"
                :key="r.created_at + r.medicine.name"
                class="border-b border-clinic-border/60 dark:border-slate-800"
              >
                <td class="py-1.5 pr-2">{{ new Date(r.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) }}</td>
                <td class="py-1.5 pr-2">
                  <span class="font-medium">{{ r.medicine.name }}</span>
                </td>
                <td class="py-1.5 pr-2 text-right font-medium">{{ r.quantity }} {{ r.medicine.unit }}</td>
              </tr>
              <tr v-if="!latestImports.length">
                <td colspan="3" class="py-4 text-center text-slate-400">ไม่มีข้อมูล</td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Low Stock -->
        <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3">
          <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 px-1">
            <i class="fa-solid fa-triangle-exclamation text-rose-500 mr-2"></i>
            รายการยาใกล้หมด
          </h2>
          <table class="min-w-full text-xs">
            <thead>
              <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
                <th class="py-2 pr-2">ยา</th>
                <th class="py-2 pr-2 text-right">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in lowStockList"
                :key="m.id"
                class="border-b border-clinic-border/60 dark:border-slate-800"
              >
                <td class="py-1.5 pr-2">
                  <span class="font-medium">{{ m.name }}</span>
                </td>
                <td class="py-1.5 pr-2 text-right">
                  <span :class="(m.current_stock ?? 0) <= LOW_STOCK_THRESHOLD ? 'text-red-600 font-semibold' : ''">
                    {{ m.current_stock ?? 0 }}
                  </span>
                  <span class="text-slate-400 ml-1">{{ m.unit }}</span>
                </td>
              </tr>
              <tr v-if="!lowStockList.length">
                <td colspan="2" class="py-4 text-center text-slate-400">ไม่มีข้อมูล</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tables -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3">
          <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 px-1">
            <i class="fa-solid fa-user-injured text-rose-500 mr-2"></i>
            ผู้ป่วยล่าสุด (วันนี้)
          </h2>
          <table class="min-w-full text-xs">
            <thead>
              <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
                <th class="py-2 pr-2">เวลา</th>
                <th class="py-2 pr-2">ชื่อ</th>
                <th class="py-2 pr-2">แผนก</th>
                <th class="py-2 pr-2">อาการ</th>
                <th class="py-2 pr-2 text-right">จ่ายยา</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in lastPatients"
                :key="p.id"
                class="border-b border-clinic-border/60 dark:border-slate-800"
              >
                <td class="py-1.5 pr-2">{{ new Date(p.created_at).toLocaleTimeString('th-TH') }}</td>
                <td class="py-1.5 pr-2 font-medium">{{ p.fullname }}</td>
                <td class="py-1.5 pr-2">{{ p.department }}</td>
                <td class="py-1.5 pr-2">{{ p.diagnosis }}</td>
                <td class="py-1.5 pr-2 text-right">{{ p.amount }}</td>
              </tr>
              <tr v-if="!lastPatients.length">
                <td colspan="5" class="py-4 text-center text-slate-400">
                  ไม่มีข้อมูล
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-xl p-3">
          <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 px-1">
            <i class="fa-solid fa-virus text-purple-500 mr-2"></i>
            อาการที่พบบ่อย (15 วันล่าสุด)
          </h2>
          <table class="min-w-full text-xs">
            <thead>
              <tr class="text-left text-slate-500 border-b border-clinic-border dark:border-slate-700">
                <th class="py-2 pr-2">อาการ</th>
                <th class="py-2 pr-2 text-right">จำนวน (ครั้ง)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in mostSymptoms"
                :key="s.symptoms"
                class="border-b border-clinic-border/60 dark:border-slate-800"
              >
                <td class="py-1.5 pr-2 font-medium">{{ s.symptoms }}</td>
                <td class="py-1.5 pr-2 text-right">{{ s.count }}</td>
              </tr>
              <tr v-if="!mostSymptoms.length">
                <td colspan="2" class="py-4 text-center text-slate-400">
                  ไม่มีข้อมูล
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
