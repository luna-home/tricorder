<script setup lang="ts">
import { computed } from 'vue'

import { parseNote } from './note'

// User-entered note with Spiegelstriche (see note.ts): paragraphs and lists with a lavender dash
// and a hanging indent. Keeps its own case; type size and colour come from the parent.
const props = defineProps<{ text: string }>()
const blocks = computed(() => parseNote(props.text))
</script>

<template>
  <div class="lc-note lc-verbatim">
    <template v-for="(block, i) in blocks" :key="i">
      <ul v-if="block.kind === 'list'" class="lc-note__list">
        <li v-for="(item, j) in block.items" :key="j" class="lc-note__item">{{ item }}</li>
      </ul>
      <p v-else class="lc-note__paragraph">{{ block.text }}</p>
    </template>
  </div>
</template>

<style scoped>
.lc-note {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.lc-note__list,
.lc-note__paragraph {
  margin: 0;
  padding: 0;
  list-style: none;
}
.lc-note__item {
  display: grid;
  grid-template-columns: 1em minmax(0, 1fr);
  column-gap: var(--space-1-5);
}
/* The dash is decoration; the list itself tells assistive tech that these are items. */
.lc-note__item::before {
  content: '–' / '';
  color: var(--color-lcars-lavender);
}
</style>
