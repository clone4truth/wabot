<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
defineProps<{ message: string | null; loading?: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <Alert v-if="message" variant="destructive" role="alert">
    <CircleAlert class="size-4" />
    <AlertTitle>Data belum dapat diperbarui</AlertTitle>
    <AlertDescription class="flex flex-wrap items-center justify-between gap-3">
      <span>{{ message }}</span>
      <Button variant="outline" size="sm" :disabled="loading" @click="$emit('retry')">Coba lagi</Button>
    </AlertDescription>
  </Alert>
</template>
