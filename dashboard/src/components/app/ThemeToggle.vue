<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue'
import { useTheme } from '@/composables/use-theme'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
const { mode, resolved } = useTheme()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" aria-label="Ganti tema" title="Ganti tema">
        <Moon v-if="resolved === 'dark'" class="size-4" /><Sun v-else class="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-44">
      <DropdownMenuRadioGroup v-model="mode">
        <DropdownMenuRadioItem value="light"><Sun class="size-4" /> Terang</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark"><Moon class="size-4" /> Gelap</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="auto"><Monitor class="size-4" /> Ikuti perangkat</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
