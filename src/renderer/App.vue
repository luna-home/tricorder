<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { registry } from '@services/registry'

import FrameAlert from './components/FrameAlert.vue'
import { LcPanel, type LcMode, type LcNavPage } from './design/luna-console/vue'
import { getBridge } from './platform/client'
import { useErrorText } from './platform/errors'
import { useServicesStore } from './platform/status'
import { useServiceEventSync } from './platform/sync'
import { serviceAlert, serviceUiIds } from './router/services'
import { formatDay } from './time/format'
import { useNow } from './time/useNow'

const { t, d } = useI18n()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const store = useServicesStore()
const errorText = useErrorText()

void store.connect()
onUnmounted(() => store.disconnect())
useServiceEventSync()

const platform = getBridge()?.platform

const now = useNow(1000)
const clock = computed(() => d(now.value, 'time'))
const date = computed(() => formatDay(now.value, (value, key) => d(value, key)))

const manifests = Object.values(registry)
  .map(({ manifest }) => manifest)
  .filter((manifest) => serviceUiIds.has(manifest.id))
  .sort((a, b) => a.order - b.order)

const serviceId = computed(() => route.meta.serviceId)

// The rail is fixed: START and one button per service. A service's own pages and commands live
// on its pages, never in the rail, so the rail stays the same while more services arrive.
const pages = computed<LcNavPage[]>(() => [
  { name: 'home', label: t('nav.home'), color: 'mauve' },
  ...manifests.map((manifest) => ({
    name: manifest.id,
    label: t(manifest.nameKey),
    color: manifest.color,
  })),
])

const currentPage = computed(() => serviceId.value ?? 'home')

function navigate(name: string) {
  void router.push(name === 'home' ? '/' : `/${name}`)
}

const serviceName = (id: string) => {
  const manifest = manifests.find((item) => item.id === id)
  return manifest ? t(manifest.nameKey) : id
}

const alert = computed(() => {
  if (store.connection === 'unreachable') {
    return {
      kind: 'red' as const,
      title: t('alert.bridge.title'),
      details: [
        t(`alert.bridge.causes.${store.failure?.code ?? 'hostUnreachable'}`),
        t('alert.bridge.fix'),
      ],
      verbatim: store.failure?.detail,
    }
  }
  const id = serviceId.value
  const status = id ? store.statusOf(id) : undefined
  if (!id || !status) return undefined
  const { state, reason } = status
  if (state !== 'error' && state !== 'offline' && state !== 'unconfigured') return undefined
  return {
    kind: state === 'unconfigured' ? ('yellow' as const) : ('red' as const),
    title: t(`alert.${state}.title`, { service: serviceName(id) }),
    details: [reason && errorText.reason(id, reason), t(`alert.${state}.fix`)].filter(
      (detail): detail is string => !!detail,
    ),
    verbatim: reason?.detail,
    notice: serviceAlert(id, state),
    status,
  }
})

const mode = computed<LcMode>(() =>
  !alert.value ? 'normal' : alert.value.kind === 'red' ? 'red-alert' : 'yellow-alert',
)
const online = computed(() => store.connection === 'connected' && !alert.value)
const statusLabel = computed(() => {
  if (store.connection === 'connecting') return t('status.connecting')
  return t(alert.value ? 'status.alert' : 'status.online')
})

function retry() {
  void store.connect()
  void queryClient.invalidateQueries()
}
</script>

<template>
  <div class="app-shell" :data-platform="platform">
    <div v-if="platform === 'darwin'" class="app-shell__drag" aria-hidden="true" />
    <LcPanel
      :title="t('app.title')"
      :clock="clock"
      :date="date"
      :online="online"
      :status-label="statusLabel"
      :mode="mode"
      :pages="pages"
      :current-page="currentPage"
      @navigate="navigate"
    >
      <FrameAlert
        v-if="alert"
        :kind="alert.kind"
        :title="alert.title"
        :details="alert.details"
        :verbatim="alert.verbatim"
        :notice="'notice' in alert ? alert.notice : undefined"
        :status="'status' in alert ? alert.status : undefined"
        @home="router.push('/')"
        @retry="retry"
      />
      <RouterView v-else />
    </LcPanel>
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  height: 100%;
}
/* macOS: an invisible strip over the top of the frame to drag the window by (see main.css). */
.app-shell__drag {
  position: absolute;
  inset: 0 0 auto 0;
  height: var(--space-8);
  z-index: 2;
}
</style>
