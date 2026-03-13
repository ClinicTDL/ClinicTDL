<script setup>
import { computed, onMounted, onUnmounted, ref, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabaseClient'
import bcrypt from 'bcryptjs'
import { notifications } from '../stores/notifications'

const router = useRouter()

const now = ref(new Date())
let intervalId

const theme = ref(localStorage.getItem('clinic_tdl_theme') || 'light')

const user = ref(null)
const profileImage = ref(null)

// Edit Profile State
const showEditSidebar = ref(false)
const isChangingPassword = ref(false)
const isLoadingProfile = ref(false)
const isSavingPassword = ref(false)
const isSavingProfile = ref(false)
const passwordError = ref('')
const passwordSuccess = ref('')
const profileError = ref('')
const profileSuccess = ref('')
const fileInput = ref(null)
const showImageOptions = ref(false)

const editForm = reactive({
  username: '',
  full_name: '',
  employee_code: '',
  id: ''
})

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const formattedDateTime = computed(() =>
  now.value.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }),
)

const applyTheme = (mode) => {
  const isDark = mode === 'dark'
  localStorage.setItem('clinic_tdl_theme', mode)
  document.documentElement.classList.toggle('dark', isDark)
  document.body.classList.toggle('dark', isDark)
}

const toggleTheme = () => {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  applyTheme(theme.value)
}

onMounted(() => {
  applyTheme(theme.value)
})

const showNotifications = ref(false)
const showProfile = ref(false)

const handleLogout = () => {
  document.cookie = 'clinic_tdl_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=Lax'
  localStorage.removeItem('clinic_tdl_session')
  user.value = null
  router.push({ name: 'login' })
}

const loadProfileImage = () => {
  if (user.value?.username) {
    const key = `clinic_tdl_avatar_${user.value.username}`
    const saved = localStorage.getItem(key)
    if (saved) {
      profileImage.value = saved
    } else {
      profileImage.value = null
    }
  }
}

const handleEditProfile = async () => {
  showProfile.value = false
  showEditSidebar.value = true
  isLoadingProfile.value = true
  isChangingPassword.value = false
  showImageOptions.value = false
  passwordError.value = ''
  passwordSuccess.value = ''
  profileError.value = ''
  profileSuccess.value = ''
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''

  // Add global click listener to close image options
  const closeOptions = () => {
    showImageOptions.value = false
  }
  window.addEventListener('click', closeOptions)
  // Clean up listener when sidebar closes or component unmounts
  watch(showEditSidebar, (val) => {
    if (!val) window.removeEventListener('click', closeOptions)
  })

  try {
    // Reload user data from DB to be sure
    const { data, error } = await supabase
      .from('system_users')
      .select('*')
      .eq('id', user.value.userId)
      .single()
    
    if (data) {
      editForm.id = data.id
      editForm.username = data.username
      editForm.full_name = data.full_name
      editForm.employee_code = data.emp_code
    }
  } catch (err) {
    console.error('Failed to load profile', err)
  } finally {
    isLoadingProfile.value = false
  }
}

const triggerFileUpload = () => {
  fileInput.value?.click()
  showImageOptions.value = false
}

const removeProfileImage = () => {
  if (user.value?.username) {
    localStorage.removeItem(`clinic_tdl_avatar_${user.value.username}`)
    profileImage.value = null
    showImageOptions.value = false
  }
}

const onFileSelected = (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const result = e.target.result
    profileImage.value = result
    // Save to local storage
    if (user.value?.username) {
      localStorage.setItem(`clinic_tdl_avatar_${user.value.username}`, result)
    }
  }
  reader.readAsDataURL(file)
}

const saveProfile = async () => {
  profileError.value = ''
  profileSuccess.value = ''

  if (!editForm.username.trim()) {
    profileError.value = 'กรุณากรอก Username'
    return
  }

  isSavingProfile.value = true
  try {
    const oldUsername = user.value.username
    const newUsername = editForm.username.trim()

    // 1. Check if username changed and if new one is taken
    if (newUsername !== oldUsername) {
      const { data: existing } = await supabase
        .from('system_users')
        .select('id')
        .eq('username', newUsername)
        .maybeSingle()
      
      if (existing) {
        throw new Error('Username นี้ถูกใช้งานแล้ว')
      }
    }

    // 2. Update DB
    const { error: updateError } = await supabase
      .from('system_users')
      .update({ username: newUsername })
      .eq('id', user.value.userId)

    if (updateError) throw updateError

    // 3. Migrate profile image if username changed
    if (newUsername !== oldUsername) {
      const img = localStorage.getItem(`clinic_tdl_avatar_${oldUsername}`)
      if (img) {
        localStorage.setItem(`clinic_tdl_avatar_${newUsername}`, img)
        localStorage.removeItem(`clinic_tdl_avatar_${oldUsername}`)
      }
    }

    // 4. Update local session
    const updatedSession = { ...user.value, username: newUsername }
    localStorage.setItem('clinic_tdl_session', JSON.stringify(updatedSession))
    user.value = updatedSession

    profileSuccess.value = 'บันทึกข้อมูลสำเร็จ'
  } catch (err) {
    console.error(err)
    profileError.value = err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล'
  } finally {
    isSavingProfile.value = false
  }
}

const toggleChangePassword = () => {
  isChangingPassword.value = !isChangingPassword.value
  passwordError.value = ''
  passwordSuccess.value = ''
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
}

const savePassword = async () => {
  passwordError.value = ''
  passwordSuccess.value = ''

  if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
    passwordError.value = 'กรุณากรอกข้อมูลให้ครบถ้วน'
    return
  }

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    passwordError.value = 'รหัสผ่านใหม่ไม่ตรงกัน'
    return
  }

  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการเปลี่ยนรหัสผ่าน?')) {
    return
  }

  isSavingPassword.value = true
  try {
    // 1. Get current password hash
    const { data: userData, error: fetchError } = await supabase
      .from('system_users')
      .select('password_hash')
      .eq('id', user.value.userId)
      .single()

    if (fetchError || !userData) throw new Error('ไม่พบข้อมูลผู้ใช้')

    // 2. Verify old password
    const valid = await bcrypt.compare(passwordForm.oldPassword, userData.password_hash || '')
    if (!valid) {
      throw new Error('รหัสผ่านเดิมไม่ถูกต้อง')
    }

    // 3. Hash new password
    const salt = await bcrypt.genSalt(10)
    const newHash = await bcrypt.hash(passwordForm.newPassword, salt)

    // 4. Update DB
    const { error: updateError } = await supabase
      .from('system_users')
      .update({ password_hash: newHash })
      .eq('id', user.value.userId)

    if (updateError) throw updateError

    passwordSuccess.value = 'เปลี่ยนรหัสผ่านสำเร็จ'
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    isChangingPassword.value = false

  } catch (err) {
    console.error(err)
    passwordError.value = err.message || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน'
  } finally {
    isSavingPassword.value = false
  }
}

onMounted(() => {
  intervalId = setInterval(() => {
    now.value = new Date()
  }, 1000)

  const getCookie = (name) => {
    const v = document.cookie.split('; ').find((row) => row.startsWith(name + '='))
    return v ? v.split('=')[1] : ''
  }
  const rawSession = getCookie('clinic_tdl_session')
  try {
    user.value = rawSession ? JSON.parse(decodeURIComponent(rawSession)) : null
  } catch {
    user.value = null
  }
  
  if (user.value) {
    loadProfileImage()
  }
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})
</script>

<template>
  <header
    class="sticky top-0 z-20 h-14 border-b border-clinic-border dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur flex items-center justify-between px-4"
  >
    <div class="flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
      <i class="fa-regular fa-calendar"></i>
      <span>{{ formattedDateTime }}</span>
    </div>

    <div class="flex items-center gap-3">
      <button
        type="button"
        class="w-9 h-9 inline-flex items-center justify-center rounded-full border border-clinic-border dark:border-slate-700 hover:bg-clinic-light dark:hover:bg-slate-800"
        @click="toggleTheme"
      >
        <i
          class="fa-solid"
          :class="theme === 'dark' ? 'fa-moon text-yellow-300' : 'fa-sun text-yellow-400'"
        ></i>
      </button>

      <div class="relative">
        <button
          type="button"
          class="w-9 h-9 inline-flex items-center justify-center rounded-full border border-clinic-border dark:border-slate-700 hover:bg-clinic-light dark:hover:bg-slate-800"
          @click="showNotifications = !showNotifications"
        >
          <i class="fa-regular fa-bell"></i>
          <span
            v-if="notifications.length"
            class="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] rounded-full bg-red-600 text-white px-1"
          >{{ notifications.length }}</span>
        </button>
        <div
          v-if="showNotifications"
          class="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-lg shadow-md text-sm z-10"
        >
          <div class="px-3 py-2 border-b border-clinic-border dark:border-slate-700 font-medium">
            แจ้งเตือน
          </div>
          <div v-if="!notifications.length" class="px-3 py-3 text-slate-500 dark:text-slate-400 text-xs">
            ไม่มีแจ้งเตือนใหม่
          </div>
          <div v-else class="max-h-64 overflow-y-auto">
            <div
              v-for="(n, idx) in notifications"
              :key="idx"
              class="px-3 py-2 text-xs border-b border-clinic-border/60 dark:border-slate-700"
            >
              <span class="inline-flex items-center gap-1">
                <i class="fa-solid fa-triangle-exclamation text-amber-500"></i>
                <span>{{ n.text }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="relative">
        <button
          type="button"
          class="flex items-center gap-2 rounded-full border border-clinic-border dark:border-slate-700 px-2 py-1 hover:bg-clinic-light dark:hover:bg-slate-800"
          @click="showProfile = !showProfile"
        >
          <div
            class="w-8 h-8 rounded-full bg-clinic-blue/10 flex items-center justify-center overflow-hidden"
          >
            <img v-if="profileImage" :src="profileImage" class="w-full h-full object-cover" alt="Profile" />
            <i v-else class="fa-solid fa-user text-clinic-blue text-sm"></i>
          </div>
          <div class="hidden sm:flex flex-col items-start">
            <span class="text-xs font-medium leading-tight">
              {{ user?.full_name || user?.username || 'User' }}
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              ID: {{ user?.employee_code || '-' }}
            </span>
          </div>
          <i class="fa-solid fa-chevron-down text-[10px] text-slate-500"></i>
        </button>

        <div
          v-if="showProfile"
          class="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-clinic-border dark:border-slate-700 rounded-lg shadow-md text-sm z-10"
        >
          <div class="px-3 py-2 border-b border-clinic-border dark:border-slate-700">
            <div class="font-medium">
              {{ user?.full_name || user?.username || 'User' }}
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              รหัสพนักงาน: {{ user?.employee_code || '-' }}
            </div>
          </div>
          <button
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            @click="handleEditProfile"
          >
            <i class="fa-solid fa-user-pen"></i>
            <span>แก้ไขโปรไฟล์</span>
          </button>
          <button
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
            @click="handleLogout"
          >
            <i class="fa-solid fa-arrow-right-from-bracket"></i>
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Profile Sidebar (Right Drawer) -->
    <Teleport to="body">
      <div
        v-if="showEditSidebar"
        class="fixed inset-0 z-[9999] flex justify-end font-sans"
      >
        <!-- Backdrop -->
        <div 
          class="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
          @click="showEditSidebar = false"
        ></div>

        <!-- Sidebar Content -->
        <div class="relative w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl h-full flex flex-col transform transition-transform duration-300 animate-slide-in-right">
          <div class="flex items-center justify-between p-4 border-b border-clinic-border dark:border-slate-800">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
              <i class="fa-solid fa-user-pen mr-2 text-clinic-blue"></i>
              แก้ไขโปรไฟล์
            </h2>
            <button 
              @click="showEditSidebar = false"
              class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <!-- Profile Image Section -->
            <div class="flex flex-col items-center gap-4">
              <div class="relative group">
                <div 
                  class="w-24 h-24 rounded-full border-2 border-clinic-blue overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer"
                  @click.stop="showImageOptions = !showImageOptions"
                >
                  <img v-if="profileImage" :src="profileImage" class="w-full h-full object-cover" />
                  <i v-else class="fa-solid fa-user text-4xl text-slate-300"></i>
                </div>
                
                <!-- Image Options Popover (Left Side) -->
                <div 
                  v-if="showImageOptions"
                  class="absolute top-1/2 right-full -translate-y-1/2 mr-4 w-40 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-clinic-border dark:border-slate-700 py-1 z-10 animate-fade-in"
                  @click.stop
                >
                  <button 
                    @click="triggerFileUpload"
                    class="w-full px-4 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-200"
                  >
                    <i class="fa-solid fa-upload text-clinic-blue"></i>
                    อัพโหลดรูปภาพ
                  </button>
                  <button 
                    @click="removeProfileImage"
                    :disabled="!profileImage"
                    class="w-full px-4 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <i class="fa-solid fa-trash-can"></i>
                    ลบรูปภาพ
                  </button>
                  <!-- Arrow (Pointing Right) -->
                  <div class="absolute top-1/2 left-full -translate-y-1/2 border-8 border-transparent border-l-white dark:border-l-slate-800"></div>
                </div>

                <div 
                  class="absolute inset-0 bg-black/20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer pointer-events-none"
                >
                  <i class="fa-solid fa-camera text-white text-xl"></i>
                </div>
              </div>
              <p class="text-[11px] text-slate-500">คลิกที่รูปเพื่อจัดการรูปโปรไฟล์</p>
              <input 
                ref="fileInput"
                type="file" 
                accept="image/*" 
                class="hidden" 
                @change="onFileSelected"
              />
            </div>

            <!-- User Info Form -->
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">รหัสพนักงาน</label>
                <input 
                  :value="editForm.employee_code || '-'" 
                  readonly 
                  class="w-full rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-clinic-border dark:border-slate-700 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">ชื่อ-นามสกุล</label>
                <input 
                  :value="editForm.full_name || '-'" 
                  readonly 
                  class="w-full rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-clinic-border dark:border-slate-700 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">ชื่อผู้ใช้งาน (Username)</label>
                <input 
                  v-model="editForm.username" 
                  type="text"
                  class="w-full rounded-lg bg-white dark:bg-slate-900 border border-clinic-border dark:border-slate-600 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-clinic-blue focus:border-transparent outline-none transition-all"
                  placeholder="กรอก Username"
                />
              </div>

              <!-- Profile Info Messages -->
              <div v-if="profileError" class="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded flex items-center gap-2">
                <i class="fa-solid fa-circle-exclamation"></i>
                {{ profileError }}
              </div>
              <div v-if="profileSuccess" class="text-xs text-green-500 bg-green-50 dark:bg-green-900/20 p-2 rounded flex items-center gap-2">
                <i class="fa-solid fa-circle-check"></i>
                {{ profileSuccess }}
              </div>

              <button 
                @click="saveProfile"
                :disabled="isSavingProfile || isLoadingProfile"
                class="w-full py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <i v-if="isSavingProfile" class="fa-solid fa-circle-notch fa-spin"></i>
                <i v-else class="fa-solid fa-user-check"></i>
                บันทึกการเปลี่ยนแปลงโปรไฟล์
              </button>

              <div class="pt-4 border-t border-clinic-border dark:border-slate-800">
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">ความปลอดภัย</label>
                <div class="relative">
                  <input 
                    type="password" 
                    value="********" 
                    readonly 
                    class="w-full rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-clinic-border dark:border-slate-700 px-3 py-2 text-sm text-slate-500"
                  />
                </div>
                <button 
                  type="button" 
                  @click="toggleChangePassword"
                  class="mt-2 text-sm text-clinic-blue hover:text-blue-600 hover:underline flex items-center gap-1"
                >
                  <i class="fa-solid" :class="isChangingPassword ? 'fa-chevron-up' : 'fa-key'"></i>
                  {{ isChangingPassword ? 'ยกเลิกการเปลี่ยนรหัสผ่าน' : 'เปลี่ยนรหัสผ่าน' }}
                </button>
              </div>

              <!-- Change Password Form -->
              <div v-if="isChangingPassword" class="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-clinic-border dark:border-slate-700 space-y-3 animate-fade-in">
                <div>
                  <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">รหัสผ่านเดิม</label>
                  <input 
                    v-model="passwordForm.oldPassword"
                    type="password" 
                    class="w-full rounded-lg bg-white dark:bg-slate-900 border border-clinic-border dark:border-slate-600 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-clinic-blue focus:border-transparent outline-none transition-all"
                    placeholder="กรอกรหัสผ่านเดิม"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">รหัสผ่านใหม่</label>
                  <input 
                    v-model="passwordForm.newPassword"
                    type="password" 
                    class="w-full rounded-lg bg-white dark:bg-slate-900 border border-clinic-border dark:border-slate-600 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-clinic-blue focus:border-transparent outline-none transition-all"
                    placeholder="กรอกรหัสผ่านใหม่"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">ยืนยันรหัสผ่านใหม่</label>
                  <input 
                    v-model="passwordForm.confirmPassword"
                    type="password" 
                    class="w-full rounded-lg bg-white dark:bg-slate-900 border border-clinic-border dark:border-slate-600 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-clinic-blue focus:border-transparent outline-none transition-all"
                    placeholder="กรอกรหัสผ่านใหม่ซ้ำอีกครั้ง"
                  />
                </div>

                <div v-if="passwordError" class="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded flex items-center gap-2">
                  <i class="fa-solid fa-circle-exclamation"></i>
                  {{ passwordError }}
                </div>
                <div v-if="passwordSuccess" class="text-xs text-green-500 bg-green-50 dark:bg-green-900/20 p-2 rounded flex items-center gap-2">
                  <i class="fa-solid fa-circle-check"></i>
                  {{ passwordSuccess }}
                </div>

                <button 
                  @click="savePassword"
                  :disabled="isSavingPassword"
                  class="w-full py-2 bg-clinic-blue hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <i v-if="isSavingPassword" class="fa-solid fa-circle-notch fa-spin"></i>
                  <i v-else class="fa-solid fa-save"></i>
                  บันทึกรหัสผ่านใหม่
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </header>
</template>
