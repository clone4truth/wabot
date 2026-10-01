<script setup lang="ts">
import { phoneChatId, recipientLabel, userMessage } from '@/lib/presentation'

import PageHeader from '@/components/app/PageHeader.vue'
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Trash2 } from '@lucide/vue'
import { api, type AccessInfo } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import DataError from '@/components/app/DataError.vue'
import SectionCard from '@/components/app/SectionCard.vue'

const info = ref<AccessInfo | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const busy = ref(false)

const newChatId = ref('')
const newPrefix = ref('!')

async function load() {
  loading.value = true
  error.value = null
  try {
    info.value = await api.access()
  } catch (err) {
    error.value = userMessage(err, 'Gagal memuat data akses')
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function addPrefix() {
  const chatId = phoneChatId(newChatId.value)
  if (!chatId) { toast.error('Masukkan nomor WhatsApp yang valid.'); return }
  if (!chatId || busy.value) return
  busy.value = true
  try {
    await api.setPrefix(chatId, newPrefix.value)
    toast.success('Simbol perintah disimpan')
    newChatId.value = ''
    await load()
  } catch (err) {
    toast.error(userMessage(err, 'Simbol belum dapat disimpan. Gunakan satu karakter simbol dan coba lagi.'))
  } finally {
    busy.value = false
  }
}

async function removePrefix(chatId: string) {
  if (busy.value) return
  busy.value = true
  try {
    await api.clearPrefix(chatId)
    toast.success('Simbol khusus dihapus')
    await load()
  } catch (err) {
    toast.error(userMessage(err, 'Simbol belum dapat dihapus. Coba lagi.'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Akses bot" description="Atur simbol perintah khusus dan tinjau siapa yang dapat memakai bot.">
    </PageHeader>
    <DataError :message="error" :loading="loading" @retry="load" />

    <div v-if="loading" class="space-y-4">
      <Skeleton class="h-40 w-full" />
      <Skeleton class="h-52 w-full" />
    </div>

    <template v-else-if="info">
      <SectionCard
        title="Simbol perintah khusus"
        description="Tambahkan nomor WhatsApp untuk memakai simbol perintah yang berbeda. Identitas percakapan lama disamarkan."
      >
        <form class="flex flex-wrap items-end gap-2" @submit.prevent="addPrefix">
          <div class="min-w-40 flex-1 space-y-1.5">
            <Label for="chatid">Nomor WhatsApp</Label>
            <Input id="chatid" v-model="newChatId" placeholder="6281234567890" type="tel" />
          </div>
          <div class="w-24 space-y-1.5">
            <Label for="pfx">Simbol</Label>
            <Input id="pfx" v-model="newPrefix" maxlength="1" class="text-center font-mono" />
          </div>
          <Button type="submit" :disabled="busy || !newChatId.trim()">Simpan</Button>
        </form>

        <div v-if="info.prefixOverrides.length" class="mt-4 divide-y rounded-md border">
          <div
            v-for="(entry, index) in info.prefixOverrides"
            :key="entry.chatIdHash"
            class="flex items-center justify-between gap-2 p-2.5"
          >
            <div class="flex min-w-0 items-center gap-2">
              <span class="truncate font-mono text-xs text-muted-foreground">
                Percakapan khusus {{ index + 1 }}
              </span>
              <Badge variant="secondary" class="font-mono">{{ entry.prefix }}</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              :disabled="busy"
              @click="removePrefix(entry.chatIdHash)"
            >
              <Trash2 class="size-3.5" />
              <span class="sr-only">Hapus</span>
            </Button>
          </div>
        </div>
        <p v-else class="mt-4 text-sm text-muted-foreground">
          Semua percakapan memakai simbol umum (
          <span class="font-mono">{{ info.commandPrefix }}</span>).
        </p>
      </SectionCard>

      <div class="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Percakapan yang diizinkan">
          <p class="mb-2 text-xs text-muted-foreground">
            Daftar kosong berarti semua percakapan diizinkan.
          </p>
          <div v-if="info.allowedChatIds.length" class="flex flex-wrap gap-1.5">
            <Badge
              v-for="(id, index) in info.allowedChatIds"
              :key="id"
              variant="outline"
              class="font-mono text-xs"
            >
              {{ recipientLabel(id, index) }}
            </Badge>
          </div>
          <p v-else class="text-sm text-muted-foreground">Semua percakapan diizinkan.</p>
          <p class="mt-3 text-xs text-muted-foreground">
            Ubah lewat halaman <RouterLink class="underline" to="/config">Pengaturan bot</RouterLink>.
          </p>
        </SectionCard>

        <SectionCard title="Nomor yang diblokir">
          <div v-if="info.blockedSenderIds.length" class="flex flex-wrap gap-1.5">
            <Badge
              v-for="(id, index) in info.blockedSenderIds"
              :key="id"
              variant="destructive"
              class="font-mono text-xs"
            >
              {{ recipientLabel(id, index) }}
            </Badge>
          </div>
          <p v-else class="text-sm text-muted-foreground">Tidak ada nomor yang diblokir.</p>
          <p class="mt-3 text-xs text-muted-foreground">
            Ubah lewat halaman <RouterLink class="underline" to="/config">Pengaturan bot</RouterLink>.
          </p>
        </SectionCard>
      </div>
    </template>
  </div>
</template>