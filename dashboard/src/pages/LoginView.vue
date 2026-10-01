<script setup lang="ts">
import { userMessage } from '@/lib/presentation'

import ThemeToggle from '@/components/app/ThemeToggle.vue'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { ShieldAlert } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/composables/use-auth'

const auth = useAuth()
const route = useRoute()
const router = useRouter()

const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

async function submit() {
  if (!password.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    await auth.login(password.value)
    password.value = ''
    const target = route.query.redirect
    const redirect = typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login') ? target : '/'
    await router.replace(redirect)
    toast.success('Login berhasil')
  } catch (err) {
    error.value = userMessage(err, 'Tidak dapat masuk. Periksa kata sandi dan coba lagi.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-background p-4">
    <div class="absolute right-4 top-4"><ThemeToggle /></div>
    <div class="w-full max-w-sm">
      <div class="mb-6 flex flex-col items-center gap-3 text-center">
        <div
          class="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground"
        >
          <ShieldAlert class="size-5" />
        </div>
        <div>
          <h1 class="text-lg font-semibold">Sticker Bot</h1>
          <p class="text-sm text-muted-foreground">Masuk ke panel admin</p>
        </div>
      </div>

      <Card v-if="!auth.enabled.value">
        <CardHeader>
          <CardTitle class="text-base">Dashboard nonaktif</CardTitle>
          <CardDescription>
            Hubungi pengelola untuk mengaktifkan dashboard.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card v-else>
        <CardContent class="pt-6">
          <form class="space-y-4" @submit.prevent="submit">
            <div class="space-y-2">
              <Label for="password">Kata sandi</Label>
              <Input
                id="password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                autofocus
                placeholder="••••••••"
              />
            </div>

            <Alert v-if="error" variant="destructive" role="alert"><AlertDescription>{{ error }}</AlertDescription></Alert>

            <Button type="submit" class="w-full" :disabled="busy || !password">
              {{ busy ? 'Memproses…' : 'Masuk' }}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
</template>