import { ref } from 'vue'

export const notifications = ref([])
export const lowStockThreshold = ref(10)

export const setNotifications = (list) => {
  notifications.value = Array.isArray(list) ? list : []
}

export const addNotification = (n) => {
  notifications.value = [...notifications.value, n]
}

export const clearNotifications = () => {
  notifications.value = []
}
