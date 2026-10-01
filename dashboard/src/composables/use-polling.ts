import { userMessage } from '../lib/presentation'
import { onMounted, onUnmounted, ref, shallowRef, type Ref } from 'vue'
import { ApiError } from '../lib/api'

/** One request at a time; backoff on failure and suspend in background tabs. */
export function usePolling<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  options: { intervalMs: number; enabled?: Ref<boolean> },
) {
  const data = shallowRef<T | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(false)
  const updatedAt = ref<Date | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let running = false
  let mounted = false
  let failures = 0

  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  function schedule() {
    clearTimer()
    if (!running || !mounted || document.hidden) return
    timer = setTimeout(() => void refresh(), Math.min(options.intervalMs * 2 ** failures, 60_000))
  }

  async function refresh() {
    if (controller || !mounted) return
    clearTimer()
    if (options.enabled && !options.enabled.value) {
      schedule()
      return
    }
    const request = new AbortController()
    controller = request
    loading.value = true
    try {
      const result = await loader(request.signal)
      if (request.signal.aborted) return
      data.value = result
      error.value = null
      failures = 0
      updatedAt.value = new Date()
    } catch (err) {
      if (request.signal.aborted) return
      failures = Math.min(failures + 1, 6)
      error.value = userMessage(err, 'Gagal memuat data. Coba lagi.')
      if (err instanceof ApiError && err.status === 401) running = false
    } finally {
      if (controller === request) {
        controller = undefined
        loading.value = false
        schedule()
      }
    }
  }

  function start() {
    running = true
    if (mounted) void refresh()
  }

  function stop() {
    running = false
    clearTimer()
    controller?.abort()
    controller = undefined
    loading.value = false
  }

  function visibilityChanged() {
    if (document.hidden) clearTimer()
    else if (running) void refresh()
  }

  onMounted(() => {
    mounted = true
    document.addEventListener('visibilitychange', visibilityChanged)
    if (running) void refresh()
  })
  onUnmounted(() => {
    mounted = false
    stop()
    document.removeEventListener('visibilitychange', visibilityChanged)
  })

  return { data, error, loading, updatedAt, refresh, start, stop }
}
