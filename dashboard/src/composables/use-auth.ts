import { ref, computed, readonly } from 'vue'
import { api, ApiError, type SessionState } from '@/lib/api'

const state = ref<SessionState>({ enabled: true, authenticated: false })
const ready = ref(false)
const checked = ref(false)

async function refresh() {
  try {
    state.value = await api.session()
  } catch {
    // Server tidak terjangkau atau session route bermasalah: anggap belum login
    // supaya router mengarahkan ke halaman login, bukan crashed.
    state.value = { enabled: false, authenticated: false }
  } finally {
    ready.value = true
    checked.value = true
  }
}

export function useAuth() {
  async function login(password: string) {
    await api.login(password)
    await refresh()
  }

  async function logout() {
    await api.logout()
    state.value = { ...state.value, authenticated: false }
  }

  /**
   * Dipanggil dari interceptor saat API membalas 401: sesi bisa saja kedaluwarsa
   * di tengah pemakaian dashboard, jadi UI harus balik ke login tanpa perlu
   * user refresh manual.
   */
  function markUnauthenticated() {
    state.value = { ...state.value, authenticated: false }
  }

  return {
    state: readonly(state),
    ready: readonly(ready),
    checked: readonly(checked),
    enabled: computed(() => state.value.enabled),
    authenticated: computed(() => state.value.authenticated),
    isApiError: (e: unknown): e is ApiError => e instanceof ApiError,
    refresh,
    login,
    logout,
    markUnauthenticated,
  }
}