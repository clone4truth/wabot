<script setup lang="ts">
import { userMessage } from '@/lib/presentation'

import PageHeader from '@/components/app/PageHeader.vue'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { Ban } from '@lucide/vue'
import { api, type JobStats } from '@/lib/api'
import { usePolling } from '@/composables/use-polling'
import DataError from '@/components/app/DataError.vue'
import { jobVariant, jobLabel, jobTypeLabel } from '@/lib/jobs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import StatCard from '@/components/app/StatCard.vue'

const { data, error, loading, start, refresh } = usePolling<JobStats>(api.jobs, {
  intervalMs: 3_000,
})
start()

const cancelling = ref<string | null>(null)

async function cancel(jobId: string) {
  cancelling.value = jobId
  try {
    const res = await api.cancelJob(jobId)
    if (res.cancelled) toast.success('Permintaan stiker dibatalkan')
    else toast.warning('Permintaan sudah diproses atau selesai.')
    await refresh()
  } catch (err) {
    toast.error(userMessage(err, 'Permintaan belum dapat dibatalkan. Coba lagi.'))
  } finally {
    cancelling.value = null
  }
}



function duration(job: { createdAt: string; finishedAt?: string; startedAt?: string }) {
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now()
  const ms = end - new Date(job.createdAt).getTime()
  return ms < 1000 ? 'Kurang dari 1 detik' : `${(ms / 1000).toFixed(1)} detik`
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Aktivitas stiker" description="Pantau pemrosesan stiker. Permintaan yang masih menunggu dalam antrean dapat dibatalkan.">
      <Button variant="outline" size="sm" :disabled="loading" @click="refresh()">
        Perbarui
      </Button>
    </PageHeader>
    <DataError :message="error" :loading="loading" @retry="refresh" />

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard label="Aktif" :value="data?.active ?? '—'" :loading="loading && !data" tone="good" />
      <StatCard
        label="Antrean"
        :value="data?.byStatus.QUEUED ?? '—'"
        :loading="loading && !data"
        :tone="(data?.byStatus.QUEUED ?? 0) > 0 ? 'warn' : 'default'"
      />
      <StatCard label="Selesai" :value="data?.byStatus.DONE ?? '—'" :loading="loading && !data" />
      <StatCard
        label="Gagal"
        :value="data?.byStatus.FAILED ?? '—'"
        :loading="loading && !data"
        :tone="(data?.byStatus.FAILED ?? 0) > 0 ? 'bad' : 'default'"
      />
      <StatCard
        label="Dibatalkan"
        :value="data?.byStatus.CANCELLED ?? '—'"
        :loading="loading && !data"
      />
    </div>

    <div class="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>

            <TableHead>Stiker</TableHead>
            <TableHead>Status</TableHead>

            <TableHead class="text-right">Durasi</TableHead>
            <TableHead class="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading && !data">
            <TableCell colspan="4" class="p-3">
              <div class="space-y-2">
                <Skeleton v-for="i in 5" :key="i" class="h-8 w-full" />
              </div>
            </TableCell>
          </TableRow>
          <TableRow v-for="job in data?.recent ?? []" :key="job.jobId">
            <TableCell class="capitalize">{{ jobTypeLabel(job.type) }}</TableCell>
            <TableCell>
              <div class="flex items-center gap-2">
                <Badge :variant="jobVariant(job.status)" class="text-xs">
                  {{ jobLabel(job.status) }}
                </Badge>

              </div>
            </TableCell>
            <TableCell class="text-right tabular-nums text-muted-foreground">
              {{ duration(job) }}
            </TableCell>
            <TableCell class="text-right">
              <Button
                v-if="job.status === 'QUEUED'"
                variant="ghost"
                size="sm"
                :disabled="cancelling === job.jobId"
                @click="cancel(job.jobId)"
              >
                <Ban class="size-3.5" />
                <span class="sr-only">Batalkan</span>
              </Button>
              <span v-else class="text-xs text-muted-foreground">—</span>
            </TableCell>
          </TableRow>
          <TableRow v-if="!loading && !error && (data?.recent.length ?? 0) === 0">
            <TableCell colspan="4" class="py-8 text-center text-sm text-muted-foreground">
              Belum ada permintaan stiker.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
