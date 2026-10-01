import { userMessage } from '@/lib/presentation'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { api, ApiError, type WhatsappAction } from '@/lib/api'
import { usePolling } from '@/composables/use-polling'

export function useWhatsapp() {
  const busy = ref<WhatsappAction | null>(null)
  const actionError = ref<string | null>(null)
  const poll = usePolling(async (signal) => {
    const session = await api.whatsapp(signal)
    let qr: string | null = null
    let qrError: string | null = null
    if (session.status === 'SCAN_QR_CODE') {
      try {
        qr = (await api.whatsappQr(signal)).dataUrl
      } catch (error) {
        if (signal.aborted || (error instanceof ApiError && error.status === 401)) throw error
        // A transition away from SCAN_QR_CODE can race the QR request.
        qrError = userMessage(error, 'QR belum tersedia.')
      }
    }
    return { session, qr, qrError }
  }, { intervalMs: 3_000 })
  poll.start()

  async function perform(action: WhatsappAction) {
    if (busy.value) return
    busy.value = action
    actionError.value = null
    poll.stop()
    // Never show a QR from before a restart or logout.
    poll.data.value = null
    try {
      await api.whatsappAction(action)
      const messages = {
        connect: 'Koneksi WhatsApp mulai dihubungkan',
        restart: 'Koneksi WhatsApp dimulai ulang',
        stop: 'Koneksi WhatsApp dihentikan',
        logout: 'Keluar dari WhatsApp. Pindai QR untuk menautkan kembali.',
      }
      toast.success(messages[action])
    } catch (error) {
      actionError.value = userMessage(error, 'Koneksi belum dapat diubah. Coba lagi.')
    } finally {
      busy.value = null
      poll.start()
    }
  }

  return {
    ...poll,
    session: computed(() => poll.data.value?.session ?? null),
    qr: computed(() => poll.error.value ? null : poll.data.value?.qr ?? null),
    qrError: computed(() => poll.data.value?.qrError ?? null),
    busy, actionError, perform,
  }
}
