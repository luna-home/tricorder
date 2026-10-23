<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'

import { LcControlRow, LcNotice } from '@renderer/design/luna-console/vue'
import LcField from '@renderer/components/LcField.vue'
import { getBridge, serviceQueryKey } from '@renderer/platform/client'
import { useErrorText } from '@renderer/platform/errors'
import { useServicesStore } from '@renderer/platform/status'
import { useService } from '@renderer/platform/useService'
import { ServiceCallError } from '@shared/ipc'
import type { ServiceStatus } from '@shared/service'

import { useLogbuchI18n } from '../i18n'

// Yellow alert of the unconfigured logbuch: which file was looked up, why, and a field to set
// the path in the service settings.
defineProps<{ status: ServiceStatus }>()

const { lt } = useLogbuchI18n()
const logbuch = useService('logbuch')
const store = useServicesStore()
const queryClient = useQueryClient()
const errorText = useErrorText()

const info = logbuch.query('dbInfo')
const path = ref('')
const error = ref<string>()

const details = computed(() => [
  lt(info.data.value?.pathSource === 'env' ? 'setup.fixEnv' : 'setup.fix'),
])

async function save(dbPath: string | null) {
  const bridge = getBridge()
  if (!bridge) return
  const result = await bridge.settings.set('logbuch', { dbPath })
  if (!result.ok) {
    const cause =
      result.error.code === 'invalid-input'
        ? lt('setup.invalidPath')
        : errorText.error(new ServiceCallError('logbuch', 'settings', result.error))
    error.value = `${lt('setup.failed')}: ${cause}`
    return
  }
  error.value = undefined
  await store.connect()
  await queryClient.invalidateQueries({ queryKey: serviceQueryKey('logbuch') })
}

function press(id: string) {
  void save(id === 'save' ? path.value.trim() || null : null)
}
</script>

<template>
  <div class="setup-notice">
    <LcNotice
      class="setup-notice__notice"
      kind="yellow"
      :title="lt('setup.title')"
      :details="details"
    />
    <dl v-if="info.data.value" class="setup-notice__path">
      <dt class="lc-type-label lc-text-lavender">
        {{ lt('setup.path') }} · {{ lt(`setup.source.${info.data.value.pathSource}`) }}
      </dt>
      <dd class="lc-type-label lc-text-cream lc-verbatim">{{ info.data.value.path }}</dd>
    </dl>
    <form class="setup-notice__form" @submit.prevent="press('save')">
      <LcField v-model="path" :label="lt('setup.field')" :error="error" />
      <LcControlRow
        :buttons="[
          { id: 'save', label: lt('setup.save'), color: 'orange' },
          { id: 'reset', label: lt('setup.reset'), color: 'lavender' },
        ]"
        @press="press"
      />
    </form>
  </div>
</template>

<style scoped>
.setup-notice {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
}
.setup-notice__notice {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
}
.setup-notice__path {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  margin: 0;
  text-align: center;
}
.setup-notice__path dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.setup-notice__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
}
</style>
