<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { ServiceState } from '@shared/service'
import { registry } from '@services/registry'

import { LcCommandTile, LcReadout } from '../design/luna-console/vue'
import { useServicesStore } from '../platform/status'
import { serviceUiIds } from '../router/services'

// Start page: one command tile per service, and its live status.
const { t } = useI18n()
const router = useRouter()
const store = useServicesStore()

const ALERT_STATES: ReadonlySet<ServiceState> = new Set(['offline', 'error', 'unconfigured'])

const services = computed(() =>
  Object.values(registry)
    .map(({ manifest }) => manifest)
    .sort((a, b) => a.order - b.order)
    .map((manifest, index) => {
      const state = store.statusOf(manifest.id)?.state
      return {
        ...manifest,
        code: `${String(index + 1).padStart(2, '0')}-${manifest.id.slice(0, 3).toUpperCase()}`,
        name: t(manifest.nameKey),
        state: t(`serviceState.${state ?? 'unknown'}`),
        alert: state !== undefined && ALERT_STATES.has(state),
        hasUi: serviceUiIds.has(manifest.id),
      }
    }),
)

function open(id: string) {
  if (serviceUiIds.has(id)) void router.push(`/${id}`)
}
</script>

<template>
  <div class="lc-cols">
    <section class="lc-col" :aria-label="t('home.services')">
      <LcReadout :label="t('home.services')" :value="services.length" />
      <div class="lc-tiles">
        <LcCommandTile
          v-for="service in services"
          :key="service.id"
          :code="service.code"
          :label="service.name"
          :color="service.color"
          :disabled="!service.hasUi"
          @press="open(service.id)"
        />
      </div>
    </section>
    <section class="lc-col" :aria-label="t('home.status')">
      <LcReadout
        v-for="service in services"
        :key="service.id"
        :label="service.name"
        :value="service.state"
        :alert="service.alert"
      />
    </section>
  </div>
</template>
