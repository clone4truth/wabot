import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth } from '@/composables/use-auth'

// SPA disajikan di /dashboard oleh Fastify, jadi basename wajib diset agar
// hard-refresh di /dashboard/jobs tidak salah rute.
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginView.vue'),
    meta: { public: true, title: 'Masuk' },
  },
  {
    path: '/',
    name: 'overview',
    component: () => import('@/pages/OverviewView.vue'),
    meta: { title: 'Ringkasan' },
  },
  {
    path: '/jobs',
    name: 'jobs',
    component: () => import('@/pages/JobsView.vue'),
    meta: { title: 'Aktivitas stiker' },
  },
  {
    path: '/whatsapp',
    name: 'whatsapp',
    component: () => import('@/pages/WhatsappView.vue'),
    meta: { title: 'WhatsApp' },
  },
  {
    path: '/logs',
    name: 'logs',
    component: () => import('@/pages/LogsView.vue'),
    meta: { title: 'Riwayat aktivitas' },
  },
  {
    path: '/access',
    name: 'access',
    component: () => import('@/pages/AccessView.vue'),
    meta: { title: 'Akses bot' },
  },
  {
    path: '/config',
    name: 'config',
    component: () => import('@/pages/ConfigView.vue'),
    meta: { title: 'Pengaturan bot' },
  },
  {
    path: '/commands',
    name: 'commands',
    component: () => import('@/pages/CommandsView.vue'),
    meta: { title: 'Perintah' },
  },
  {
    path: '/maintenance',
    name: 'maintenance',
    component: () => import('@/pages/MaintenanceView.vue'),
    meta: { title: 'Pemeliharaan' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory('/dashboard'),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuth()

  // Session dicek sekali saat app boot; setelah itu state di-cache lokal.
  if (!auth.checked.value) {
    await auth.refresh()
  }

  if (!auth.enabled.value && to.name !== 'login') {
    return { name: 'login' }
  }

  if (to.meta.public) {
    // Sudah login dan mau buka /login → lempar ke dashboard.
    return auth.authenticated.value && to.name === 'login' ? { name: 'overview' } : true
  }

  if (!auth.authenticated.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  return true
})

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) ?? ''
  document.title = title ? `${title} · Sticker Bot` : 'Sticker Bot'
})
