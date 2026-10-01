import type { JobStatus } from './api'
import type { BadgeVariants } from '@/components/ui/badge'
export function jobVariant(status: JobStatus): BadgeVariants['variant'] {
  if (status === 'DONE') return 'default'
  if (status === 'FAILED') return 'destructive'
  if (status === 'PROCESSING') return 'secondary'
  return 'outline'
}
export function jobLabel(status: string) {
  return ({ QUEUED: 'Menunggu', PROCESSING: 'Diproses', DONE: 'Selesai', FAILED: 'Gagal', CANCELLED: 'Dibatalkan' } as Record<string, string>)[status] ?? 'Perlu diperiksa'
}
export function jobTypeLabel(type: string) {
  return ({ image: 'Stiker gambar', video: 'Stiker video', animation: 'Stiker animasi', background: 'Hapus latar', text: 'Stiker teks', attp: 'Teks animasi', meme: 'Meme', quote: 'Kutipan', toimg: 'Stiker ke gambar', togif: 'Stiker ke video' } as Record<string, string>)[type] ?? 'Stiker'
}
