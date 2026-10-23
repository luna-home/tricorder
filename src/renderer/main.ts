import '@fontsource/antonio/400.css'
import '@fontsource/antonio/600.css'
import '@fontsource/antonio/700.css'
import './assets/main.css'

import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { DEFAULT_LOCALE, isLocale } from '@shared/locale'

import App from './App.vue'
import { createAppI18n } from './i18n'
import { getBridge } from './platform/client'
import { createQueryClient } from './platform/query'
import { createAppRouter } from './router'

const app = createApp(App)

app.use(createPinia())
app.use(createAppRouter())
app.use(VueQueryPlugin, { queryClient: createQueryClient() })

// The language the main process decided (tray and window use the same).
const locale = getBridge()?.locale
const i18n = createAppI18n(isLocale(locale) ? locale : DEFAULT_LOCALE)
app.use(i18n)
document.title = i18n.global.t('app.title')

app.mount('#app')
