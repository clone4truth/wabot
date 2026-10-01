<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

withDefaults(
  defineProps<{
    label: string
    value?: string | number | null
    hint?: string
    tone?: 'default' | 'good' | 'warn' | 'bad'
    loading?: boolean
  }>(),
  { tone: 'default', loading: false, hint: undefined, value: undefined },
)

const TONE: Record<string, string> = {
  default: 'text-foreground',
  good: 'text-primary',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-destructive',
}
</script>

<template>
  <Card class="gap-0 py-0">
    <CardContent class="px-5 py-5">
      <p class="text-xs font-medium text-muted-foreground">{{ label }}</p>
      <Skeleton v-if="loading" class="mt-1.5 h-7 w-20" />
      <p v-else class="mt-1 text-2xl font-semibold tabular-nums" :class="TONE[tone]">
        {{ value ?? '—' }}
      </p>
      <p v-if="hint && !loading" class="mt-0.5 break-words text-xs text-muted-foreground">
        {{ hint }}
      </p>
    </CardContent>
  </Card>
</template>