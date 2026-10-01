<script setup lang="ts">
import { userMessage } from '@/lib/presentation'

import PageHeader from '@/components/app/PageHeader.vue'
import { onMounted, reactive, ref, computed } from 'vue'
import { toast } from 'vue-sonner'
import { RotateCcw, Save } from '@lucide/vue'
import { api, type ConfigSnapshot, type RuntimeConfigShape } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import DataError from '@/components/app/DataError.vue'
import RecipientList from '@/components/app/RecipientList.vue'
import { BYTES_PER_MB } from '@/lib/presentation'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import SectionCard from '@/components/app/SectionCard.vue'

const snapshot = ref<ConfigSnapshot | null>(null)
const form = reactive<Partial<RuntimeConfigShape>>({})
const saving = ref(false)
const loading = ref(true)
const error = ref<string | null>(null)
const confirmReset = ref(false)

/** Field angka yang bisa diedit + batas valid dari server. */
const NUMERIC_FIELDS: Array<{ key: keyof RuntimeConfigShape; label: string; hint: string }> = [
  { key: 'userRateLimit', label: 'Batas per orang', hint: 'permintaan per menit' },
  { key: 'groupRateLimit', label: 'Batas per grup', hint: 'permintaan per menit' },
  { key: 'maxTextLength', label: 'Panjang teks maksimal', hint: 'karakter' },
]

async function load() {
  loading.value = true
  error.value = null
  try {
    snapshot.value = await api.config()
    Object.assign(form, snapshot.value.effective)
  } catch (err) {
    error.value = userMessage(err, 'Pengaturan belum dapat dimuat. Coba lagi.')
  } finally {
    loading.value = false
  }
}
onMounted(load)

const dirty = computed(() => {
  if (!snapshot.value) return false
  return JSON.stringify(form) !== JSON.stringify(snapshot.value.effective)
})

function bound(key: keyof RuntimeConfigShape) {
  return snapshot.value?.limits?.[key]
}

async function save() {
  saving.value = true
  try {
    const patch = Object.fromEntries(Object.entries(form).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(snapshot.value?.effective[key as keyof RuntimeConfigShape])))
    const res = await api.updateConfig(patch)
    toast.success('Pengaturan bot disimpan', {
      description: 'Pengaturan baru langsung berlaku.',
    })
    Object.assign(form, res.effective)
    snapshot.value = { ...(snapshot.value as ConfigSnapshot), effective: res.effective }
  } catch (err) {
    toast.error(userMessage(err, 'Periksa kembali batas angka dan simbol perintah, lalu coba simpan lagi.'))
  } finally {
    saving.value = false
  }
}

async function resetAll() {
  if (saving.value) return
  saving.value = true
  try {
    const res = await api.resetConfig()
    Object.assign(form, res.effective)
    if (snapshot.value) snapshot.value = { ...snapshot.value, effective: res.effective }
    toast.success('Pengaturan bot dikembalikan ke pengaturan awal')
    confirmReset.value = false
  } catch (err) {
    toast.error(userMessage(err, 'Pengaturan belum dapat dikembalikan. Coba lagi.'))
  } finally {
    saving.value = false
  }
}

function isOverridden(key: keyof RuntimeConfigShape) {
  const snap = snapshot.value
  if (!snap) return false
  return String(snap.effective[key]) !== String(snap.defaults[key])
}

const imageMb = computed({ get: () => (form.maxImageBytes ?? 0) / BYTES_PER_MB, set: value => { form.maxImageBytes = Math.round(value * BYTES_PER_MB) } })
const videoMb = computed({ get: () => (form.maxVideoBytes ?? 0) / BYTES_PER_MB, set: value => { form.maxVideoBytes = Math.round(value * BYTES_PER_MB) } })
function mediaBound(key: string, edge: 'min' | 'max') { const value = snapshot.value?.limits[key]?.[edge]; return value === undefined ? undefined : value / BYTES_PER_MB }
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Pengaturan bot" description="Atur penggunaan bot. Perubahan langsung berlaku setelah disimpan.">
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="saving || loading || !snapshot" @click="confirmReset = true">
          <RotateCcw class="size-3.5" />
          Kembalikan
        </Button>
        <Button size="sm" :disabled="saving || loading || !snapshot || !dirty" @click="save">
          <Save class="size-3.5" />
          {{ saving ? 'Menyimpan…' : 'Simpan' }}
        </Button>
      </div>
    </PageHeader>
    <DataError :message="error" :loading="loading" @retry="load" />

    <div v-if="loading" class="space-y-4">
      <Skeleton v-for="i in 3" :key="i" class="h-48 w-full" />
    </div>

    <div v-else-if="snapshot" class="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Batas penggunaan">
        <div class="space-y-4">
          <div v-for="field in NUMERIC_FIELDS" :key="field.key" class="space-y-1.5">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <Label :for="`f-${String(field.key)}`" class="flex items-center gap-1.5">
                <span v-if="isOverridden(field.key)" class="text-primary" title="Diubah">·</span>
                {{ field.label }}
              </Label>
              <span class="text-xs text-muted-foreground">
                {{ field.hint }}
                <template v-if="bound(field.key)">
                  ({{ bound(field.key)?.min }}–{{ bound(field.key)?.max }})
                </template>
              </span>
            </div>
            <Input
              :id="`f-${String(field.key)}`"
              v-model.number="form[field.key] as number"
              type="number"
              :min="bound(field.key)?.min"
              :max="bound(field.key)?.max"
            />
          </div>
        </div>
      </SectionCard>

      <div class="space-y-4">
        <SectionCard title="Umum">
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <Label for="f-prefix">Simbol perintah</Label>
                <p class="text-xs text-muted-foreground">
                  Pengaturan awal: <span class="font-mono">{{ snapshot?.defaults.commandPrefix }}</span> —
                  gunakan satu karakter simbol.
                </p>
              </div>
              <Input
                id="f-prefix"
                v-model="form.commandPrefix"
                class="w-20 text-center font-mono"
                maxlength="1"
              />
            </div>

            <div class="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <Label for="f-adminonly">Hanya admin grup</Label>
                <p class="text-xs text-muted-foreground">
                  Hanya admin grup yang boleh memakai bot di dalam grup.
                </p>
              </div>
              <Switch id="f-adminonly" v-model="form.groupAdminOnly" />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Batas ukuran media">
          <div class="space-y-4">
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <Label for="f-img">Maks ukuran gambar</Label>
                <span class="text-xs text-muted-foreground">MB</span>
              </div>
              <Input id="f-img" v-model.number="imageMb" type="number" step="any" :min="mediaBound('maxImageBytes', 'min')" :max="mediaBound('maxImageBytes', 'max')" />
            </div>
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <Label for="f-vid">Maks ukuran video</Label>
                <span class="text-xs text-muted-foreground">MB</span>
              </div>
              <Input id="f-vid" v-model.number="videoMb" type="number" step="any" :min="mediaBound('maxVideoBytes', 'min')" :max="mediaBound('maxVideoBytes', 'max')" />
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Izin penggunaan" description="Tambahkan nomor WhatsApp dengan kode negara. Daftar izin kosong berarti semua percakapan diizinkan.">
        <div class="space-y-6">
          <RecipientList label="Percakapan yang diizinkan" :model-value="form.allowedChatIds ?? []" @update:model-value="form.allowedChatIds = $event" />
          <RecipientList label="Nomor yang diblokir" :model-value="form.blockedSenderIds ?? []" @update:model-value="form.blockedSenderIds = $event" />
        </div>
      </SectionCard>
    </div>
    <AlertDialog v-model:open="confirmReset">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kembalikan pengaturan?</AlertDialogTitle>
          <AlertDialogDescription>Semua pengaturan bot akan dikembalikan ke nilai awal, termasuk batas pemrosesan dan daftar izin.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" :disabled="saving" @click="confirmReset = false">Batal</Button>
          <Button :disabled="saving" @click="resetAll">{{ saving ? 'Mereset…' : 'Kembalikan pengaturan' }}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>