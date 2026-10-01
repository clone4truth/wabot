<script setup lang="ts">
// Adapted from the official shadcn-vue dashboard-01 AppSidebar + NavMain block.
import { RouterLink, useRoute } from 'vue-router'
import { LogOut, Sticker } from '@lucide/vue'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { navigation } from '@/lib/navigation'
import { useAuth } from '@/composables/use-auth'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarRail, SidebarSeparator, useSidebar,
} from '@/components/ui/sidebar'

const route = useRoute()
const auth = useAuth()
const { setOpenMobile } = useSidebar()
const loggingOut = ref(false)

async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await auth.logout()
  } catch {
    toast.error('Gagal keluar. Coba lagi.')
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <Sidebar variant="inset" collapsible="icon">
    <SidebarHeader class="py-3">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <RouterLink to="/" @click="setOpenMobile(false)">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sticker class="size-5" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">Sticker Bot</span>
                <span class="truncate text-xs text-muted-foreground">Panel administrasi</span>
              </div>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarSeparator />
    <SidebarContent>
      <SidebarGroup v-for="group in ['Bot', 'Pengaturan']" :key="group">
        <SidebarGroupLabel>{{ group }}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in navigation.filter(item => item.group === group)" :key="item.name">
              <SidebarMenuButton as-child :is-active="route.name === item.name" :tooltip="item.title">
                <RouterLink :to="item.to" @click="setOpenMobile(false)">
                  <component :is="item.icon" />
                  <span>{{ item.title }}</span>
                </RouterLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton :disabled="loggingOut" tooltip="Keluar dari dashboard" @click="logout">
            <LogOut />
            <span>{{ loggingOut ? 'Keluar…' : 'Keluar dari dashboard' }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
