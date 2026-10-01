<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/lib/api'
import { usePolling } from '@/composables/use-polling'
import { jobLabel, jobTypeLabel, jobVariant } from '@/lib/jobs'
import PageHeader from '@/components/app/PageHeader.vue'
import WhatsappSummary from '@/components/app/WhatsappSummary.vue'
import DataError from '@/components/app/DataError.vue'
import StatCard from '@/components/app/StatCard.vue'
import SectionCard from '@/components/app/SectionCard.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
const { data, error, loading, start, refresh } = usePolling(api.overview, { intervalMs: 5_000 })
start()
const queues = computed(() => Object.entries(data.value?.jobs.queues ?? {}).map(([type, counts]) => ({ type, ...counts })))
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Ringkasan" description="Pantau koneksi WhatsApp dan aktivitas stiker Anda.">
      <Button variant="outline" :disabled="loading" @click="refresh">Perbarui</Button>
    </PageHeader>
    <DataError :message="error" :loading="loading" @retry="refresh" />
    <WhatsappSummary />
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Sedang diproses" :value="data?.jobs.byStatus.PROCESSING" :loading="loading && !data" />
      <StatCard label="Menunggu" :value="data?.jobs.byStatus.QUEUED" :loading="loading && !data" />
      <StatCard label="Selesai" :value="data?.jobs.byStatus.DONE" hint="Pada riwayat yang tersedia" tone="good" :loading="loading && !data" />
      <StatCard label="Perlu dicoba lagi" :value="data?.jobs.byStatus.FAILED" hint="Stiker yang gagal diproses" :tone="data?.jobs.byStatus.FAILED ? 'bad' : 'default'" :loading="loading && !data" />
    </div>
    <div class="grid items-start gap-4 lg:grid-cols-2">
      <SectionCard title="Aktivitas terbaru" description="Permintaan stiker yang sedang diproses dan baru selesai.">
        <Skeleton v-if="loading && !data" class="h-32 w-full" />
        <Table v-else-if="data?.jobs.recent.length">
          <TableHeader><TableRow><TableHead>Stiker</TableHead><TableHead>Status</TableHead><TableHead class="text-right">Waktu</TableHead></TableRow></TableHeader>
          <TableBody><TableRow v-for="job in data.jobs.recent.slice(0, 6)" :key="job.jobId">
            <TableCell>{{ jobTypeLabel(job.type) }}</TableCell>
            <TableCell><Badge :variant="jobVariant(job.status)">{{ jobLabel(job.status) }}</Badge></TableCell>
            <TableCell class="text-right text-muted-foreground tabular-nums">{{ new Date(job.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }}</TableCell>
          </TableRow></TableBody>
        </Table>
        <p v-else class="py-6 text-sm text-muted-foreground">Belum ada permintaan stiker. Kirim perintah ke bot melalui WhatsApp untuk memulai.</p>
        <Button as-child variant="link" class="mt-3 h-auto p-0"><RouterLink to="/jobs">Lihat aktivitas stiker</RouterLink></Button>
      </SectionCard>
      <div class="space-y-4">
        <SectionCard title="Antrean stiker" description="Jumlah permintaan yang sedang diproses dan menunggu.">
          <Skeleton v-if="loading && !data" class="h-24 w-full" />
          <div v-else class="divide-y">
            <div v-for="queue in queues" :key="queue.type" class="flex flex-wrap justify-between gap-2 py-3 first:pt-0 last:pb-0 text-sm">
              <span class="font-medium">{{ jobTypeLabel(queue.type) }}</span>
              <span class="text-muted-foreground">{{ queue.active }} diproses · {{ queue.depth }} menunggu</span>
            </div>
            <p v-if="!queues.length" class="text-sm text-muted-foreground">Antrean masih kosong.</p>
          </div>
        </SectionCard>
        <SectionCard title="Penggunaan bot" description="Pengaturan yang berlaku untuk percakapan Anda.">
          <Skeleton v-if="loading && !data" class="h-24 w-full" />
          <dl v-else-if="data" class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-sm">
            <dt class="text-muted-foreground">Simbol perintah</dt><dd class="font-semibold">{{ data.config.commandPrefix }}</dd>
            <dt class="text-muted-foreground">Batas per orang</dt><dd>{{ data.config.userRateLimit }} / menit</dd>
            <dt class="text-muted-foreground">Batas per grup</dt><dd>{{ data.config.groupRateLimit }} / menit</dd>
            <dt class="text-muted-foreground">Penggunaan di grup</dt><dd>{{ data.config.groupAdminOnly ? 'Hanya admin' : 'Semua anggota' }}</dd>
          </dl>
          <Button as-child variant="link" class="mt-4 h-auto p-0"><RouterLink to="/config">Ubah pengaturan</RouterLink></Button>
        </SectionCard>
      </div>
    </div>
  </div>
</template>
