<script setup lang="ts">
import { phoneChatId, userMessage } from '@/lib/presentation'

import PageHeader from '@/components/app/PageHeader.vue'
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Eraser, Power, Send, ShieldOff } from '@lucide/vue'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import DataError from '@/components/app/DataError.vue'
import { Skeleton } from '@/components/ui/skeleton'
import SectionCard from '@/components/app/SectionCard.vue'

const tempCount = ref<number | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const busy = ref<string | null>(null)

const testChatId = ref('')
const testText = ref('')

const confirmRestart = ref(false)
const confirmRevoke = ref(false)

async function loadTemp() {
  loading.value = true
  error.value = null
  try {
    const res = await api.tempFiles()
    tempCount.value = res.count
  } catch (err) {
    error.value = userMessage(err, 'Gagal memuat info berkas sementara')
  } finally {
    loading.value = false
  }
}
onMounted(loadTemp)

async function cleanupTemp() {
  busy.value = 'temp'
  try {
    const res = await api.cleanupTemp()
    tempCount.value = res.remaining
    toast.success('Berkas sementara dibersihkan', {
      description: res.remaining === 0 ? 'Semua bersih.' : `${res.remaining} file tersisa.`,
    })
  } catch (err) {
    toast.error(userMessage(err, 'Berkas belum dapat dibersihkan. Coba lagi.'))
  } finally {
    busy.value = null
  }
}

async function restart() {
  busy.value = 'restart'
  try {
    await api.restart()
    confirmRestart.value = false
    toast.success('Bot mulai dimatikan', {
      description: 'Tunggu hingga bot aktif kembali sebelum mengirim permintaan baru.',
    })
  } catch (err) {
    toast.error(userMessage(err, 'Bot belum dapat dimulai ulang. Coba lagi.'))
  } finally {
    busy.value = null
  }
}

async function sendTest() {
  if (!testChatId.value.trim()) return
  busy.value = 'send'
  try {
    const chatId = phoneChatId(testChatId.value)
    if (!chatId) { toast.error('Masukkan nomor WhatsApp yang valid.'); return }
    await api.testSend(chatId, testText.value)
    toast.success('Pesan tes terkirim')
  } catch (err) {
    toast.error(userMessage(err, 'Gagal mengirim pesan tes'))
  } finally {
    busy.value = null
  }
}

async function revokeAll() {
  busy.value = 'revoke'
  try {
    await api.revokeAllSessions()
    confirmRevoke.value = false
    toast.success('Semua perangkat dikeluarkan', { description: 'Login ulang diperlukan.' })
    // Cookie sesi lokal sudah tidak berlaku → paksa ke halaman login.
    setTimeout(() => window.location.reload(), 800)
  } catch (err) {
    toast.error(userMessage(err, 'Perangkat belum dapat dikeluarkan. Coba lagi.'))
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Pemeliharaan" description="Kelola berkas sementara, uji pengiriman pesan, dan kelola keamanan dashboard.">
    </PageHeader>
    <DataError :message="error" :loading="loading" @retry="loadTemp" />

    <div class="grid gap-4 lg:grid-cols-2">
      <SectionCard
        title="Berkas sementara"
        description="Berkas yang tersisa setelah pemrosesan media. Bersihkan jika sudah tidak diperlukan."
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Skeleton v-if="loading && tempCount === null" class="h-8 w-16" /><p v-else class="text-2xl font-semibold tabular-nums">{{ tempCount ?? '—' }}</p>
            <p class="text-xs text-muted-foreground">
              berkas tersimpan
            </p>
          </div>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" :disabled="loading || !!busy" @click="loadTemp">Perbarui</Button>
            <Button size="sm" :disabled="!!busy || loading" @click="cleanupTemp">
              <Eraser class="size-3.5" />
              Bersihkan
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Kirim pesan tes"
        description="Pastikan bot dapat mengirim pesan ke nomor WhatsApp Anda."
      >
        <form class="space-y-3" @submit.prevent="sendTest">
          <div class="space-y-1.5">
            <Label for="tchat">Nomor WhatsApp</Label>
            <Input id="tchat" v-model="testChatId" placeholder="6281234567890" type="tel" />
          </div>
          <div class="space-y-1.5">
            <Label for="ttext">Pesan (opsional)</Label>
            <Input id="ttext" v-model="testText" placeholder="✅ Test dari dashboard admin" />
          </div>
          <Button type="submit" size="sm" :disabled="!!busy || !testChatId.trim()">
            <Send class="size-3.5" />
            Kirim
          </Button>
        </form>
      </SectionCard>

      <SectionCard
        title="Mulai ulang bot"
        description="Mulai ulang saat bot tidak merespons. Permintaan yang sedang diproses akan terhenti."
      >
        <Button variant="destructive" size="sm" :disabled="!!busy" @click="confirmRestart = true">
          <Power class="size-3.5" />
          Mulai ulang bot
        </Button>
      </SectionCard>

      <SectionCard
        title="Keluarkan semua perangkat"
        description="Memaksa semua perangkat yang login untuk masuk ulang. Gunakan jika kata sandi diketahui orang lain."
      >
        <Button variant="outline" size="sm" :disabled="!!busy" @click="confirmRevoke = true">
          <ShieldOff class="size-3.5" />
          Keluarkan semua perangkat
        </Button>
      </SectionCard>
    </div>

    <Dialog v-model:open="confirmRestart">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mulai ulang bot?</DialogTitle>
          <DialogDescription>
            Bot akan berhenti sementara. Permintaan yang sedang diproses akan terhenti dan perlu dikirim ulang. Pengelola mungkin perlu menyalakan bot kembali.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="confirmRestart = false">Batal</Button>
          <Button variant="destructive" :disabled="busy === 'restart'" @click="restart">
            Ya, mulai ulang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="confirmRevoke">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keluarkan semua perangkat?</DialogTitle>
          <DialogDescription>
            Semua perangkat akan keluar dari dashboard, termasuk perangkat Anda. Masuk kembali diperlukan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="confirmRevoke = false">Batal</Button>
          <Button variant="destructive" :disabled="busy === 'revoke'" @click="revokeAll">
            Keluarkan semua
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>