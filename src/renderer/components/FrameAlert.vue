<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ServiceStatus } from '@shared/service'

import { LcControlRow, LcNotice } from '../design/luna-console/vue'

// Replaces the page content while the frame is in red or yellow alert. A service may bring its
// own notice (`alerts` in its ui/routes.ts); the controls below stay the same, because the rail
// is disabled during an alert.
const props = defineProps<{
  kind: 'red' | 'yellow'
  title: string
  details: string[]
  /** Technical detail (path, error message): keeps its case, shown under the notice. */
  verbatim?: string
  /** The service's own notice; receives `status`. */
  notice?: Component
  status?: ServiceStatus
}>()

const emit = defineEmits<{ home: []; retry: [] }>()
const { t } = useI18n()

const buttons = computed(() => [
  { id: 'home', label: t('alert.actions.home'), color: 'lavender' as const },
  {
    id: 'retry',
    label: t('alert.actions.retry'),
    color: props.kind === 'red' ? 'red' : 'orange',
  } as const,
])

function press(id: string) {
  if (id === 'home') emit('home')
  else emit('retry')
}
</script>

<template>
  <div class="frame-alert">
    <component :is="notice" v-if="notice && status" class="frame-alert__notice" :status="status" />
    <template v-else>
      <LcNotice class="frame-alert__notice" :kind="kind" :title="title" :details="details" />
      <p v-if="verbatim" class="frame-alert__verbatim lc-type-label lc-text-cream lc-verbatim">
        {{ verbatim }}
      </p>
    </template>
    <LcControlRow :buttons="buttons" @press="press" />
  </div>
</template>

<style scoped>
.frame-alert {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
  height: 100%;
}
.frame-alert__notice {
  flex: 1 1 auto;
  min-height: 0;
}
.frame-alert__verbatim {
  margin: 0;
  text-align: center;
  overflow-wrap: anywhere;
}
</style>
