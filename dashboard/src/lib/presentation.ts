import type { LogEntry } from './api'

/** Never render server errors: they can contain infrastructure details or secrets. */
export function userMessage(error: unknown, fallback = 'Data belum dapat dimuat. Coba lagi.') {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  if (status === 429) return 'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.'
  if (status === 502 || status === 503) return 'Layanan belum dapat diakses. Coba lagi atau hubungi pengelola.'
  return fallback
}

export function phoneChatId(input: string): string | null {
  if (!/^[+\d\s()-]+$/.test(input)) return null
  let digits = input.replace(/\D/g, '')
  if (digits.startsWith('08')) digits = `62${digits.slice(1)}`
  if (!/^[1-9]\d{6,14}$/.test(digits)) return null
  return `${digits}@c.us`
}

export function recipientLabel(id: string, index: number): string {
  if (/^\d{7,15}@c\.us$/.test(id)) return `+${id.split('@')[0]}`
  return id.endsWith('@g.us') ? `Grup WhatsApp ${index + 1}` : `Percakapan ${index + 1}`
}

export const BYTES_PER_MB = 1024 * 1024
export function activityMessage(entry: LogEntry): string {
  if (entry.level === 'error' || entry.errorCode || entry.error) return 'Terjadi kendala pada bot. Periksa koneksi atau coba kembali.'
  if (entry.level === 'warn') return 'Ada aktivitas yang perlu diperiksa. Pastikan koneksi dan pengaturan sesuai.'
  const message = entry.message.toLowerCase()
  if (/cancel/.test(message)) return 'Permintaan stiker dibatalkan.'
  if (/job.*(completed|done|finished)/.test(message)) return 'Pemrosesan stiker selesai.'
  if (/job.*(queued|enqueued)/.test(message)) return 'Permintaan stiker masuk ke antrean.'
  if (/job.*(started|processing)/.test(message)) return 'Stiker sedang diproses.'
  return 'Aktivitas bot diperbarui.'
}
