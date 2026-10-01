<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowUpRight, MessageCircle } from '@lucide/vue'
import { api } from '@/lib/api'
import { whatsappStatus } from '@/lib/whatsapp'
import { usePolling } from '@/composables/use-polling'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
const { data, error, loading, start } = usePolling(api.whatsapp, { intervalMs: 10_000 })
start()
const status = computed(() => whatsappStatus(data.value?.status))
</script>

<template>
  <Card class="py-4">
    <CardContent class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex min-w-0 items-start gap-3">
        <MessageCircle class="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div class="space-y-1.5">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-semibold">WhatsApp</h2>
            <Skeleton v-if="loading && !data" class="h-5 w-24" />
            <Badge v-else :variant="error ? 'destructive' : status.variant">{{ error ? 'Tidak dapat diperiksa' : status.label }}</Badge>
          </div>
          <p class="max-w-prose text-sm text-muted-foreground">{{ error || status.description }}</p>
        </div>
      </div>
      <Button as-child variant="outline" size="sm"><RouterLink to="/whatsapp">Kelola koneksi <ArrowUpRight class="size-4" /></RouterLink></Button>
    </CardContent>
  </Card>
</template>
