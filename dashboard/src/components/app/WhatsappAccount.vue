<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2 } from '@lucide/vue'
import type { WhatsappProfile, WhatsappSession } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  profile: WhatsappProfile | null
  me: WhatsappSession['me']
  error: string | null
}>()
const name = computed(() => props.profile?.name?.trim() || props.me?.pushName?.trim() || 'Akun WhatsApp')
const initials = computed(() => name.value.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('id-ID'))
const phone = computed(() => {
  const id = props.profile?.id || props.me?.id || ''
  const match = /^(\d{7,15})(?:@c\.us|@s\.whatsapp\.net)?$/.exec(id)
  return match ? `+${match[1]}` : null
})
</script>

<template>
  <section class="flex min-w-0 flex-col items-center gap-4 rounded-lg bg-muted/50 px-5 py-8 text-center" aria-labelledby="whatsapp-account-title">
    <Avatar size="base" class="size-20">
      <AvatarImage v-if="profile?.picture" :src="profile.picture" :alt="`Foto profil ${name}`" referrerpolicy="no-referrer" />
      <AvatarFallback>{{ initials }}</AvatarFallback>
    </Avatar>
    <div class="min-w-0 max-w-full space-y-2">
      <Badge variant="secondary" class="gap-1.5"><CheckCircle2 class="size-3.5" /> Akun terhubung</Badge>
      <h2 id="whatsapp-account-title" class="break-words text-xl font-semibold [overflow-wrap:anywhere]">{{ name }}</h2>
      <p v-if="phone" class="break-all text-sm tabular-nums text-muted-foreground">{{ phone }}</p>
      <p class="text-sm text-muted-foreground">Bot siap menerima dan mengirim pesan.</p>
    </div>
    <p v-if="error" class="max-w-prose text-sm text-muted-foreground" role="status">{{ error }}</p>
  </section>
</template>
