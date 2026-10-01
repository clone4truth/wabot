<script setup lang="ts">
import PageHeader from '@/components/app/PageHeader.vue'
import { computed, ref, watch } from 'vue'
import { activityMessage } from '@/lib/presentation'
import { api } from '@/lib/api'
import DataError from '@/components/app/DataError.vue'
import { usePolling } from '@/composables/use-polling'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const level = ref('all')
const filter = ref('')
const { data, error, loading, start, stop, refresh } = usePolling(
  signal => api.logs(level.value, 200, signal), { intervalMs: 5_000 },
)
const entries = computed(() => (data.value?.entries ?? []).map(entry => ({ ...entry, message: activityMessage(entry) })))
start()
watch(level, () => {
  stop()
  data.value = null
  start()
})

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return entries.value
  return entries.value.filter(
    (e) =>
      e.message?.toLowerCase().includes(q),
  )
})

// Log terbaru di atas supaya tidak perlu scroll ke bawah.
const ordered = computed(() => [...filtered.value].reverse())

function tone(levelValue: string) {
  if (levelValue === 'error') return 'text-destructive'
  if (levelValue === 'warn') return 'text-amber-700 dark:text-amber-400'
  return 'text-muted-foreground'
}
</script>

<template>
  <div class="space-y-4">
    <PageHeader title="Riwayat aktivitas" description="Lihat aktivitas terbaru dan kendala yang perlu diperiksa.">
      <div class="flex flex-wrap items-center gap-2">
        <Input
          v-model="filter"
          placeholder="Cari aktivitas…"
          class="h-9 w-full sm:w-56"
          aria-label="Cari aktivitas"
        />
        <Button variant="outline" size="sm" :disabled="loading" @click="refresh()">
          Perbarui
        </Button>
      </div>
    </PageHeader>
    <DataError :message="error" :loading="loading" @retry="refresh" />

    <Tabs v-model="level">
      <TabsList>
        <TabsTrigger value="all">Semua</TabsTrigger>
        <TabsTrigger value="error">Kendala</TabsTrigger>
        <TabsTrigger value="warn">Perhatian</TabsTrigger>
        <TabsTrigger value="info">Informasi</TabsTrigger>
      </TabsList>
    </Tabs>

    <Card class="overflow-hidden">
      <ScrollArea class="h-[calc(100dvh-16rem)] min-h-72">
        <div class="divide-y text-sm">
          <div v-if="loading && ordered.length === 0" class="space-y-2 p-3">
            <Skeleton v-for="i in 8" :key="i" class="h-5 w-full" />
          </div>

          <div v-for="(entry, i) in ordered" :key="i" class="flex flex-wrap gap-x-3 gap-y-2 px-4 py-4">
            <span class="shrink-0 tabular-nums text-muted-foreground">
              {{ entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '--:--:--' }}
            </span>
            <span class="shrink-0 text-xs font-medium" :class="tone(entry.errorCode ? 'error' : entry.level)">
              {{ entry.errorCode || entry.level === 'error' ? 'Kendala' : entry.level === 'warn' ? 'Perhatian' : 'Informasi' }}
            </span>
            <span class="min-w-0 flex-1 break-words">
              {{ entry.message }}

            </span>
          </div>

          <p
            v-if="!loading && !error && ordered.length === 0"
            class="p-8 text-center font-sans text-sm text-muted-foreground"
          >
            Belum ada aktivitas yang cocok.
          </p>
        </div>
      </ScrollArea>
    </Card>

    <div class="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{{ filtered.length }} entri ditampilkan</Badge>

    </div>
  </div>
</template>
