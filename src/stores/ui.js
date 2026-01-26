import { ref } from 'vue'

export const toasts = ref([])
export const confirmState = ref({
  show: false,
  title: '',
  message: '',
  type: 'info',
  resolve: null,
  reject: null,
})

export const showToast = (type, text, timeout = 3000) => {
  const id = Date.now() + Math.random()
  toasts.value.push({ id, type, text })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, timeout)
}

export const showConfirm = ({ title = 'ยืนยันการทำรายการ', message = '', type = 'info' } = {}) =>
  new Promise((resolve) => {
    confirmState.value = { show: true, title, message, type, resolve }
  })

export const closeConfirm = (result) => {
  const r = confirmState.value.resolve
  confirmState.value.show = false
  confirmState.value.resolve = null
  if (typeof r === 'function') r(!!result)
}
