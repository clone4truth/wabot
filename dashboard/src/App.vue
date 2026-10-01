<script setup lang="ts">
import { useTheme } from '@/composables/use-theme'
import { watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { Toaster } from '@/components/ui/sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import { useAuth } from '@/composables/use-auth'

const { resolved } = useTheme()
const route = useRoute()
const router = useRouter()
const auth = useAuth()

watch(auth.authenticated, (authenticated) => {
  if (auth.ready.value && !authenticated && route.name !== 'login') {
    void router.replace({ name: 'login', query: { redirect: route.fullPath } })
  }
})
</script>

<template>
  <div v-if="!auth.ready.value" class="flex min-h-dvh items-center justify-center p-6" role="status" aria-label="Memuat dashboard">
    <Skeleton class="h-36 w-full max-w-sm" />
  </div>
  <RouterView v-else-if="route.name === 'login'" />
  <SidebarProvider v-else-if="auth.authenticated.value" :style="{ '--sidebar-width': '16rem', '--header-height': '3.5rem' }">
    <a href="#main-content" class="sr-only z-50 rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Lewati ke konten</a>
    <AppSidebar />
    <SidebarInset class="min-w-0">
      <SiteHeader />
      <main id="main-content" tabindex="-1" class="@container/main min-w-0 flex-1 p-4 outline-none md:p-6 lg:p-8">
        <div class="mx-auto w-full max-w-7xl"><RouterView /></div>
      </main>
    </SidebarInset>
  </SidebarProvider>
  <Toaster :theme="resolved" position="bottom-right" rich-colors />
</template>
