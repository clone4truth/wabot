import type { BadgeVariants } from '@/components/ui/badge'

interface StatusPresentation {
  label: string
  description: string
  variant: BadgeVariants['variant']
}

const statuses: Record<string, StatusPresentation> = {
  MISSING: { label: 'Belum terhubung', description: 'Hubungkan WhatsApp untuk menampilkan kode QR.', variant: 'outline' },
  STOPPED: { label: 'Dihentikan', description: 'Aktifkan koneksi agar bot dapat digunakan kembali.', variant: 'secondary' },
  STARTING: { label: 'Menghubungkan', description: 'Koneksi sedang disiapkan. Tunggu sebentar, lalu klik Perbarui untuk melihat kode QR atau status terbaru.', variant: 'secondary' },
  SCAN_QR_CODE: { label: 'Menunggu pemindaian', description: 'Pindai QR dari menu Perangkat tertaut di WhatsApp Anda.', variant: 'outline' },
  WORKING: { label: 'Terhubung', description: 'WhatsApp terhubung. Bot siap menerima pesan.', variant: 'default' },
  FAILED: { label: 'Koneksi gagal', description: 'Coba hubungkan ulang. Jika masih gagal, keluar dari WhatsApp lalu pindai QR baru.', variant: 'destructive' },
  PASSKEY_REQUIRED: { label: 'Verifikasi diperlukan', description: 'Hubungi pengelola untuk menyelesaikan verifikasi tambahan akun.', variant: 'outline' },
  PASSKEY_CONFIRMATION_REQUIRED: { label: 'Konfirmasi diperlukan', description: 'Periksa konfirmasi di ponsel Anda. Hubungi pengelola jika penautan belum selesai.', variant: 'outline' },
}

export function whatsappStatus(status?: string): StatusPresentation {
  return statuses[status ?? ''] ?? { label: status ? 'Perlu diperiksa' : 'Belum diperiksa', description: status ? 'Koneksi perlu diperiksa. Coba hubungkan ulang atau hubungi pengelola.' : 'Klik Perbarui untuk memeriksa koneksi WhatsApp.', variant: 'outline' }
}
