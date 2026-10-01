<script setup lang="ts">
import { ref, useId } from 'vue'
import { Plus, X } from '@lucide/vue'
import { phoneChatId, recipientLabel } from '@/lib/presentation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
const props = defineProps<{ label: string; modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const id = useId()
const phone = ref('')
const error = ref('')
function add() {
  const value = phoneChatId(phone.value)
  if (!value) { error.value = 'Masukkan nomor WhatsApp yang valid, misalnya 6281234567890.'; return }
  emit('update:modelValue', [...new Set([...props.modelValue, value])])
  phone.value = ''; error.value = ''
}
</script>
<template>
  <div class="space-y-3">
    <Label :for="id">{{ label }}</Label>
    <form class="flex gap-2" @submit.prevent="add">
      <Input :id="id" v-model="phone" type="tel" autocomplete="off" placeholder="6281234567890" :aria-invalid="!!error" :aria-describedby="error ? `${id}-error` : undefined" />
      <Button variant="outline" type="submit" size="icon" :aria-label="`Tambah ${label.toLowerCase()}`"><Plus class="size-4" /></Button>
    </form>
    <p v-if="error" :id="`${id}-error`" class="text-sm text-destructive" role="alert">{{ error }}</p>
    <ul v-if="modelValue.length" class="divide-y rounded-md border">
      <li v-for="(recipient, index) in modelValue" :key="recipient" class="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
        <span>{{ recipientLabel(recipient, index) }}</span>
        <Button variant="ghost" size="icon" :aria-label="`Hapus ${recipientLabel(recipient, index)}`" @click="emit('update:modelValue', modelValue.filter(value => value !== recipient))"><X class="size-4" /></Button>
      </li>
    </ul>
    <p v-else class="text-sm text-muted-foreground">Belum ada nomor dalam daftar.</p>
  </div>
</template>
