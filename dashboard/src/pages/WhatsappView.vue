<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckCircle2, MessageCircle, Power, QrCode, RefreshCw, RotateCcw, Smartphone, Unplug } from '@lucide/vue'
import { useWhatsapp } from '@/composables/use-whatsapp'
import { whatsappStatus } from '@/lib/whatsapp'
import type { WhatsappAction } from '@/lib/api'
import PageHeader from '@/components/app/PageHeader.vue'
import DataError from '@/components/app/DataError.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

const { session, qr, qrError, loading, error, updatedAt, busy, actionError, refresh, perform } = useWhatsapp()
const status = computed(() => whatsappStatus(session.value?.status))
const connected = computed(() => session.value?.status === 'WORKING')
const canStart = computed(() => !session.value || ['MISSING', 'STOPPED', 'FAILED'].includes(session.value.status))
const confirmAction = ref<'stop' | 'logout' | null>(null)
const dialogOpen = computed({ get: () => confirmAction.value !== null, set: (open: boolean) => { if (!open) confirmAction.value = null } })

async function confirm() {
  const action = confirmAction.value
  confirmAction.value = null
  if (action) await perform(action)
}

function run(action: WhatsappAction) {
  if (action === 'stop' || action === 'logout') confirmAction.value = action
  else void perform(action)
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Hubungkan WhatsApp" description="Tautkan akun WhatsApp ke bot dan kelola koneksinya dari satu tempat.">
      <Button variant="outline" :disabled="loading || !!busy" @click="refresh">
        <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" /> Perbarui
      </Button>
    </PageHeader>
    <DataError :message="error" :loading="loading || !!busy" @retry="refresh" />
    <Alert v-if="actionError" variant="destructive" role="alert">
      <AlertTitle>Operasi belum berhasil</AlertTitle><AlertDescription>{{ actionError }}</AlertDescription>
    </Alert>

    <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <CardTitle class="flex items-center gap-2 text-base"><MessageCircle class="size-4" /> Koneksi akun</CardTitle>
            <Badge :variant="status.variant" :class="connected ? 'bg-primary text-primary-foreground' : ''" aria-live="polite">{{ status.label }}</Badge>
          </div>
          <CardDescription>{{ status.description }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <Skeleton v-if="loading && !session" class="mx-auto size-64 max-w-full" />
          <div v-else-if="connected" class="flex flex-col items-center gap-4 rounded-lg bg-muted/50 px-5 py-10 text-center">
            <div class="grid size-14 place-items-center rounded-full bg-primary/10 text-primary"><CheckCircle2 class="size-7" /></div>
            <div class="space-y-1">
              <h2 class="text-lg font-semibold">WhatsApp berhasil terhubung</h2>
              <p class="text-sm text-muted-foreground">{{ session?.me?.pushName || 'Akun WhatsApp' }}</p>
              <p v-if="session?.me?.id" class="break-all text-sm tabular-nums">{{ session.me.id.split('@')[0] }}</p>
            </div>
          </div>
          <div v-else-if="session?.status === 'SCAN_QR_CODE'" class="space-y-4 text-center">
            <div class="mx-auto flex aspect-square w-72 max-w-full items-center justify-center rounded-xl border bg-white p-4">
              <img v-if="qr" :src="qr" alt="QR penautan akun WhatsApp" class="size-full object-contain" width="256" height="256" />
              <Skeleton v-else class="size-full" />
            </div>
            <p v-if="qrError" class="text-sm text-destructive" role="alert">{{ qrError }}</p>
            <p v-else class="text-sm text-muted-foreground">Setelah memindai QR, klik Perbarui untuk memeriksa koneksi. Jika QR kedaluwarsa, klik Perbarui untuk mengambil kode baru.</p>
          </div>
          <div v-else class="flex flex-col items-center gap-4 rounded-lg bg-muted/50 px-5 py-10 text-center">
            <QrCode class="size-12 text-muted-foreground" />
            <div class="max-w-sm space-y-2">
              <h2 class="text-lg font-semibold">{{ session?.status === 'STARTING' ? 'Menyiapkan koneksi…' : status.label }}</h2>
              <p class="text-sm leading-relaxed text-muted-foreground">{{ status.description }}</p>
            </div>
            <Button v-if="canStart" :disabled="loading || !!busy || (session?.status === 'MISSING' && !session.webhookConfigured)" @click="run('start')">
              <Smartphone class="size-4" /> {{ busy === 'start' ? 'Memulai sesi…' : 'Mulai sesi' }}
            </Button>
          </div>
          <Alert v-if="session?.status === 'MISSING' && !session.webhookConfigured">
            <AlertTitle>Koneksi belum siap</AlertTitle>
            <AlertDescription>Hubungi pengelola untuk menyelesaikan pengaturan koneksi, lalu coba lagi.</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter class="flex flex-wrap justify-between gap-3 border-t pt-6">
          <p class="text-xs text-muted-foreground" aria-live="polite">{{ busy ? 'Memperbarui koneksi…' : updatedAt ? `Diperbarui ${updatedAt.toLocaleTimeString('id-ID')}` : 'Menunggu informasi koneksi' }}</p>
          <Button v-if="session?.exists" variant="outline" size="sm" :disabled="!!busy || !!error || session.status === 'STARTING'" @click="run('restart')"><RotateCcw class="size-3.5" /> Hubungkan ulang</Button>
        </CardFooter>
      </Card>

      <div class="space-y-6">
        <Card>
          <CardHeader><CardTitle class="text-base">Cara menautkan perangkat</CardTitle><CardDescription>Gunakan aplikasi WhatsApp di ponsel Anda.</CardDescription></CardHeader>
          <CardContent>
            <ol class="space-y-5 text-sm leading-relaxed">
              <li class="flex gap-3"><Badge variant="secondary" class="size-6 shrink-0 justify-center">1</Badge><span>Klik <strong>Mulai sesi</strong>. Jika koneksi masih disiapkan, tunggu sebentar lalu klik <strong>Perbarui</strong> untuk melihat QR.</span></li>
              <li class="flex gap-3"><Badge variant="secondary" class="size-6 shrink-0 justify-center">2</Badge><span>Buka WhatsApp → <strong>Perangkat tertaut</strong> → <strong>Tautkan perangkat</strong>.</span></li>
              <li class="flex gap-3"><Badge variant="secondary" class="size-6 shrink-0 justify-center">3</Badge><span>Pindai QR di dashboard ini, lalu klik <strong>Perbarui</strong> untuk memastikan status <strong>Terhubung</strong>.</span></li>
            </ol>
          </CardContent>
        </Card>
        <Card v-if="session?.exists">
          <CardHeader><CardTitle class="text-base">Kelola koneksi</CardTitle><CardDescription>Hentikan koneksi sementara atau tautkan akun lain.</CardDescription></CardHeader>
          <CardContent class="space-y-5">
            <div class="space-y-2">
              <Button variant="outline" class="w-full justify-start" :disabled="!!busy || !!error || session.status === 'STOPPED'" @click="run('stop')"><Power class="size-4" /> Jeda koneksi</Button>
              <p class="text-xs leading-relaxed text-muted-foreground">Menghentikan bot menerima dan mengirim pesan. Akun tetap tertaut.</p>
            </div>
            <Separator />
            <div class="space-y-2">
              <Button variant="outline" class="w-full justify-start text-destructive hover:text-destructive" :disabled="!!busy || !!error" @click="run('logout')"><Unplug class="size-4" /> Keluar dari WhatsApp</Button>
              <p class="text-xs leading-relaxed text-muted-foreground">Melepas akun yang tertaut. Anda perlu memindai QR kembali.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    <AlertDialog v-model:open="dialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ confirmAction === 'logout' ? 'Keluar dari WhatsApp?' : 'Jeda koneksi WhatsApp?' }}</AlertDialogTitle>
          <AlertDialogDescription>{{ confirmAction === 'logout' ? 'Akun akan dilepas dari bot. Untuk menggunakan bot lagi, tautkan perangkat dengan QR baru.' : 'Bot berhenti menerima dan mengirim pesan sampai koneksi diaktifkan kembali. Akun tetap tertaut.' }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" @click="confirmAction = null">Batal</Button>
          <Button :variant="confirmAction === 'logout' ? 'destructive' : 'default'" @click="confirm">{{ confirmAction === 'logout' ? 'Keluar dari WhatsApp' : 'Jeda koneksi' }}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
