<script setup lang="ts">
import { computed } from 'vue'

import LcNoteText from '@renderer/components/LcNoteText.vue'

import type { LogbuchEntry } from '../../contract'
import { useLogbuchI18n } from '../i18n'

// Stand / Weiter / Offen / Bezug of one entry, stacked like a protocol: a small lavender label
// above a cream note with Spiegelstriche, so the text gets the full width. Weiter is indented by
// one dash and starts under the text of Stand, as its sub-point. On a `done` marker the status
// holds the closing note.
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
    <div
      v-for="field in fields"
      :key="field.key"
      class="entry-fields__row"
      :class="{ 'entry-fields__row--indent': field.key === 'nextStep' }"
    >
      <dt class="lc-type-code lc-text-lavender">{{ lt(`fields.${field.key}`) }}</dt>
      <dd class="entry-fields__value lc-type-label lc-text-cream">
        <LcNoteText :text="field.value" />
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.entry-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
  margin: 0;
}
.entry-fields__row {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
/* One dash plus its gap (see LcNoteText), so WEITER lines up with the text of Stand. */
.entry-fields__row--indent {
  margin-left: calc(var(--type-label) + var(--space-1-5));
}
.entry-fields__value {
  margin: 0;
  min-width: 0;
}
</style>
