<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { errorDetail, useErrorText } from '../platform/errors'

// Loading, error and empty states around query results; the default slot shows the data.
const props = defineProps<{
  loading: boolean
  error?: unknown
  empty?: boolean
  emptyTitle?: string
  emptyHint?: string
}>()

const { t } = useI18n()
const errorText = useErrorText()

const errorLabel = computed(() => (props.error ? errorText.error(props.error) : undefined))
const detail = computed(() => (props.error ? errorDetail(props.error) : undefined))
</script>

<template>
  <p v-if="error" class="query-state lc-type-label" role="alert">
    <span class="lc-text-red">{{ t('query.error') }} · {{ errorLabel }}</span>
    <span class="lc-text-cream lc-verbatim">{{ detail }}</span>
  </p>
  <p v-else-if="loading" class="query-state lc-type-label lc-text-lavender" aria-live="polite">
    {{ t('query.loading') }}
  </p>
  <div v-else-if="empty" class="query-state">
    <p class="lc-type-readout lc-text-orange">{{ emptyTitle }}</p>
    <p v-if="emptyHint" class="lc-type-label lc-text-cream">{{ emptyHint }}</p>
  </div>
  <slot v-else />
</template>

<style scoped>
.query-state {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
  margin: 0;
}
.query-state p {
  margin: 0;
}
</style>
