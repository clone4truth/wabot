import { Activity, FileText, ListChecks, MessageCircle, ShieldCheck, SlidersHorizontal, Terminal, Wrench } from '@lucide/vue'

export const navigation = [
  { to: '/', title: 'Ringkasan', name: 'overview', icon: Activity, group: 'Bot' },
  { to: '/whatsapp', title: 'WhatsApp', name: 'whatsapp', icon: MessageCircle, group: 'Bot' },
  { to: '/jobs', title: 'Aktivitas stiker', name: 'jobs', icon: ListChecks, group: 'Bot' },
  { to: '/logs', title: 'Riwayat aktivitas', name: 'logs', icon: FileText, group: 'Bot' },
  { to: '/commands', title: 'Perintah', name: 'commands', icon: Terminal, group: 'Bot' },
  { to: '/access', title: 'Akses', name: 'access', icon: ShieldCheck, group: 'Pengaturan' },
  { to: '/config', title: 'Pengaturan bot', name: 'config', icon: SlidersHorizontal, group: 'Pengaturan' },
  { to: '/maintenance', title: 'Pemeliharaan', name: 'maintenance', icon: Wrench, group: 'Pengaturan' },
] as const
