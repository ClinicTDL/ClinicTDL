<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabaseClient'
import bcrypt from 'bcryptjs'

const router = useRouter()

const username = ref('')
const password = ref('')
const rememberMe = ref(true)
const loading = ref(false)
const error = ref('')

const handleLogin = async () => {
  error.value = ''
  loading.value = true
  try {
    const { data, error: queryError } = await supabase
      .from('system_users')
      .select('id, username, password_hash, emp_code, full_name, status')
      .eq('username', username.value)
      .maybeSingle()

    if (queryError) {
      throw queryError
    }

    if (!data) {
      error.value = 'ชื่อหรือรหัสผ่านไม่ถูกต้อง'
      return
    }

    const ok = await bcrypt.compare(password.value, data.password_hash || '')
    if (!ok) {
      error.value = 'รหัสผ่านไม่ถูกต้อง'
      return
    }

    const session = {
      userId: data.id,
      username: data.username,
      employee_code: data.emp_code,
      full_name: data.full_name || data.username,
      status: data.status,
    }
    document.cookie = `clinic_tdl_session=${encodeURIComponent(JSON.stringify(session))}; path=/; samesite=Lax`
    if (session.status === 'admin') {
      router.push({ name: 'admin-dashboard' })
    } else {
      router.push({ name: 'home' })
    }
  } catch (e) {
    error.value = 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
    console.error(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-clinic-light dark:bg-slate-900 px-4"
  >
    <div
      class="w-full max-w-md bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-2xl shadow-lg p-8"
    >
      <div class="flex flex-col items-center mb-8">
        <div
          class="w-16 h-16 rounded-full bg-clinic-blue/10 flex items-center justify-center mb-4"
        >
          <i class="fa-solid fa-house-medical text-clinic-blue text-2xl"></i>
        </div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          Clinic TDL
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Clinic ThaiDrill Lao
        </p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Username</label>
          <input
            v-model="username"
            type="text"
            required
            class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            placeholder="กรอกชื่อผู้ใช้"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            required
            class="w-full rounded-lg border border-clinic-border dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clinic-blue"
            placeholder="กรอกรหัสผ่าน"
          />
        </div>

        <div class="flex items-center justify-between text-sm">
          <label class="inline-flex items-center gap-2">
            <input
              v-model="rememberMe"
              type="checkbox"
              class="rounded border-clinic-border text-clinic-blue focus:ring-clinic-blue"
            />
            <span>จดจำการเข้าสู่ระบบ (7 วัน)</span>
          </label>
        </div>

        <p v-if="error" class="text-sm text-red-600">
          {{ error }}
        </p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full inline-flex justify-center items-center gap-2 rounded-lg bg-clinic-blue text-white py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-70"
        >
          <i class="fa-solid fa-right-to-bracket"></i>
          <span>{{ loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>
