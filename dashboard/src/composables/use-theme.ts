import { computed, watchEffect } from 'vue'
import { createGlobalState, useColorMode } from '@vueuse/core'

export const useTheme = createGlobalState(() => {
  const mode = useColorMode({ storageKey: 'stikerbot-theme', emitAuto: true })
  const resolved = computed(() => mode.store.value === 'auto' ? mode.system.value : mode.store.value)
  watchEffect(() => { document.documentElement.style.colorScheme = resolved.value })
  return { mode, resolved }
})
