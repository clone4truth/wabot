<script setup lang="ts">
import { userMessage } from '@/lib/presentation'

import PageHeader from '@/components/app/PageHeader.vue'
import { computed, onMounted, ref } from 'vue'
import { api, type CommandMeta } from '@/lib/api'
import DataError from '@/components/app/DataError.vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const categories = ref<Array<{ category: string; commands: CommandMeta[] }>>([])
const total = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)
const search = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api.commands()
    const labels: Record<string, string> = { Sticker: 'Stiker', Effects: 'Efek gambar', Text: 'Teks', Animation: 'Animasi', Creative: 'Kreasi', Utility: 'Bantuan' }
    categories.value = res.categories.map(group => ({
      ...group,
      category: labels[group.category] ?? 'Perintah lainnya',
      commands: group.commands.map(command => ({ ...command, description: command.description.replace(/ \(contain\)| \(cover\)/g, '').replace(/prefix/gi, 'simbol perintah') })),
    }))
    total.value = res.total
  } catch (err) {
    error.value = userMessage(err, 'Gagal memuat perintah')
  } finally {
    loading.value = false
  }
}
onMounted(load)

function filter(list: CommandMeta[]): CommandMeta[] {
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.usage.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q),
  )
}
const filteredCategories = computed(() => categories.value.map(group => ({
  ...group, commands: filter(group.commands),
})).filter(group => group.commands.length > 0))
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Perintah bot" description="Temukan perintah yang tersedia beserta cara menggunakannya.">
      <Input v-model="search" placeholder="Cari perintah…" class="h-9 w-full sm:w-56" aria-label="Cari perintah" />
    </PageHeader>
    <DataError :message="error" :loading="loading" @retry="load" />

    <div v-if="loading" class="grid gap-4 md:grid-cols-2">
      <Skeleton v-for="i in 4" :key="i" class="h-52 w-full" />
    </div>

    <p v-else-if="!error && filteredCategories.length === 0" class="py-10 text-center text-sm text-muted-foreground">Tidak ada perintah yang cocok. Coba kata pencarian lain.</p>
    <div v-else class="grid gap-4 md:grid-cols-2">
      <Card v-for="group in filteredCategories" :key="group.category">
        <CardHeader class="pb-3">
          <div class="flex items-center justify-between gap-2">
            <CardTitle class="text-base">{{ group.category }}</CardTitle>
            <Badge variant="secondary">{{ group.commands.length }}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p v-if="group.commands.length === 0" class="text-sm text-muted-foreground">
            Tidak ada yang cocok.
          </p>
          <ul v-else class="divide-y">
            <li v-for="cmd in group.commands" :key="cmd.name" class="py-2 first:pt-0 last:pb-0">
              <div class="flex flex-wrap items-baseline gap-2">
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{{ cmd.usage }}</code>
                <Badge v-for="alias in cmd.aliases ?? []" :key="alias" variant="outline" class="text-xs">
                  {{ alias }}
                </Badge>
              </div>
              <p class="mt-1 text-sm text-muted-foreground">{{ cmd.description }}</p>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  </div>
</template>