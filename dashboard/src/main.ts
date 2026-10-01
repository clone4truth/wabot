import { createApp } from 'vue'
import { useTheme } from './composables/use-theme'
import App from './App.vue'
import { router } from './router'
import 'vue-sonner/style.css'
import './assets/main.css'
import { setUnauthorizedHandler } from '@/lib/api'
import { useAuth } from '@/composables/use-auth'

setUnauthorizedHandler(() => {
  useAuth().markUnauthenticated()
  const route = router.currentRoute.value
  if (route.name !== 'login') {
    void router.replace({ name: 'login', query: { redirect: route.fullPath } })
  }
})

useTheme()
createApp(App).use(router).mount('#app')
