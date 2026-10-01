<script setup lang="ts">
// Header layout adapted from shadcn-vue's official dashboard-01 block.
import ThemeToggle from '@/components/app/ThemeToggle.vue'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { navigation } from '@/lib/navigation'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

const route = useRoute()
const title = computed(() => navigation.find(item => item.name === route.name)?.title ?? 'Dashboard')
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-2 border-b">
    <div class="flex w-full items-center gap-2 px-4 lg:px-6">
      <SidebarTrigger class="-ml-1 size-9" />
      <Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem class="hidden sm:block">
            <BreadcrumbLink as-child><RouterLink to="/">Dashboard</RouterLink></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator class="hidden sm:block" />
          <BreadcrumbItem><BreadcrumbPage>{{ title }}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div class="ml-auto"><ThemeToggle /></div>
    </div>
  </header>
</template>
