import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from './views/LoginPage.vue'
import MainLayout from './views/MainLayout.vue'
import DashboardPage from './views/DashboardPage.vue'
import CheckupPage from './views/CheckupPage.vue'
import MedicineListPage from './views/MedicineListPage.vue'
import TreatmentHistoryPage from './views/TreatmentHistoryPage.vue'
import DispensingHistoryPage from './views/DispensingHistoryPage.vue'
import ImportHistoryPage from './views/ImportHistoryPage.vue'
import SystemUsersPage from './views/SystemUsersPage.vue'
import EmployeeList from './views/EmployeeList.vue'
import AdminDashboardPage from './views/AdminDashboardPage.vue'
import AdminLayout from './views/admin/AdminLayout.vue'
import ApproveHistory from './views/ApproveHistory.vue'
import MedicineAdminPage from './views/admin/MedicineAdminPage.vue'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
  },
  {
    path: '/',
    component: MainLayout,
    children: [
      { path: '', name: 'home', component: CheckupPage },
      { path: 'dashboard', name: 'dashboard', component: DashboardPage },
      { path: 'medicine-list', name: 'medicine-list', component: MedicineListPage },
      { path: 'treatment-history', name: 'treatment-history', component: TreatmentHistoryPage },
      { path: 'depensing-history', redirect: { name: 'dispensing-history' } },
      { path: 'dispensing-history', name: 'dispensing-history', component: DispensingHistoryPage },
      { path: 'import-history', name: 'import-history', component: ImportHistoryPage },
      { path: 'system-users', name: 'system-users', component: SystemUsersPage },
      { path: 'employee-list', name: 'employee-list', component: EmployeeList },
      { path: 'approve-history', name: 'approve-history', component: ApproveHistory },
    ],
  },
  {
    path: '/admin',
    component: AdminLayout,
    children: [
      { path: '', redirect: { name: 'admin-dashboard' } },
      { path: 'dashboard', name: 'admin-dashboard', component: AdminDashboardPage },
      { path: 'medicine-list', name: 'admin-medicine-list', component: MedicineAdminPage },
      { path: 'treatment-history', name: 'admin-treatment-history', component: TreatmentHistoryPage },
      { path: 'dispensing-history', name: 'admin-dispensing-history', component: DispensingHistoryPage },
      { path: 'import-history', name: 'admin-import-history', component: ImportHistoryPage },
      { path: 'system-users', name: 'admin-system-users', component: SystemUsersPage },
      { path: 'employee-list', name: 'admin-employee-list', component: EmployeeList },
      { path: 'approve-history', name: 'admin-approve-history', component: ApproveHistory },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const getCookie = (name) => {
    const v = document.cookie.split('; ').find((row) => row.startsWith(name + '='))
    return v ? v.split('=')[1] : ''
  }
  const raw = getCookie('clinic_tdl_session')
  let session = null
  try {
    session = raw ? JSON.parse(decodeURIComponent(raw)) : null
  } catch {}
  const isAuthenticated = !!session

  if (to.name !== 'login' && !isAuthenticated) {
    next({ name: 'login' })
  } else if ((to.path || '').startsWith('/admin') || (to.name && String(to.name).startsWith('admin-'))) {
    if (!isAuthenticated) {
      next({ name: 'login' })
    } else if (session?.status !== 'admin') {
      next({ name: 'home' })
    } else {
      next()
    }
  } else if (isAuthenticated && session?.status === 'admin') {
    const map = {
      home: 'admin-dashboard',
      dashboard: 'admin-dashboard',
      'medicine-list': 'admin-medicine-list',
      'treatment-history': 'admin-treatment-history',
      'dispensing-history': 'admin-dispensing-history',
      'import-history': 'admin-import-history',
      'system-users': 'admin-system-users',
      'employee-list': 'admin-employee-list',
      'approve-history': 'admin-approve-history',
    }
    const target = to?.name && map[to.name]
    if (target) {
      next({ name: target })
    } else {
      next({ name: 'admin-dashboard' })
    }
  } else if (to.name === 'login' && isAuthenticated) {
    if (session?.status === 'admin') {
      next({ name: 'admin-dashboard' })
    } else {
      next({ name: 'home' })
    }
  } else {
    next()
  }
})

export default router
