<script setup lang="ts">
import { computed } from 'vue'

import type { LogbuchEntry } from '../../contract'
import { useLogbuchI18n } from '../i18n'

// Stand / Weiter / Offen / Bezug of one entry: lavender labels, cream values in their own case.
// On a `done` marker the status holds the closing note.
const props = defineProps<{ entry: LogbuchEntry }>()
const { lt } = useLogbuchI18n()

const fields = computed(() =>
  [
    { key: props.entry.kind === 'done' ? 'note' : 'status', value: props.entry.status },
    { key: 'nextStep', value: props.entry.nextStep },
    { key: 'openQuestions', value: props.entry.openQuestions },
    { key: 'refs', value: props.entry.refs },
  ].filter((field): field is { key: string; value: string } => !!field.value),
)
</script>

<template>
  <dl v-if="fields.length" class="entry-fields">
    <template v-for="field in fields" :key="field.key">
      <dt class="lc-type-label lc-text-lavender">{{ lt(`fields.${field.key}`) }}</dt>
      <dd class="entry-fields__value lc-type-label lc-text-cream lc-verbatim">{{ field.value }}</dd>
    </template>
  </dl>
</template>

<style scoped>
.entry-fields {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--space-1) var(--space-3);
  margin: 0;
}
.entry-fields__value {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
