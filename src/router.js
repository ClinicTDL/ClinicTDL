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
    ],
  },
  {
    path: '/admin',
    component: AdminLayout,
    children: [
      { path: '', redirect: { name: 'admin-dashboard' } },
      { path: 'dashboard', name: 'admin-dashboard', component: AdminDashboardPage },
      { path: 'medicine-list', name: 'admin-medicine-list', component: MedicineListPage },
      { path: 'treatment-history', name: 'admin-treatment-history', component: TreatmentHistoryPage },
      { path: 'dispensing-history', name: 'admin-dispensing-history', component: DispensingHistoryPage },
      { path: 'import-history', name: 'admin-import-history', component: ImportHistoryPage },
      { path: 'system-users', name: 'admin-system-users', component: SystemUsersPage },
      { path: 'employee-list', name: 'admin-employee-list', component: EmployeeList },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const rawSession = localStorage.getItem('clinic_tdl_session')
  const session = rawSession ? JSON.parse(rawSession) : null
  const now = Date.now()

  if (session && session.expiresAt && now > session.expiresAt) {
    localStorage.removeItem('clinic_tdl_session')
  }

  const isAuthenticated = !!localStorage.getItem('clinic_tdl_session')

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
  } else if (to.name === 'home' && isAuthenticated && session?.status === 'admin') {
    next({ name: 'admin-dashboard' })
  } else if (to.name === 'login' && isAuthenticated) {
    if (session.status === 'admin') {
      next({ name: 'admin-dashboard' })
    } else {
      next({ name: 'home' })
    }
  } else {
    next()
  }
})

export default router
