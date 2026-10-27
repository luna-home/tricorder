<script setup lang="ts">
import { computed } from 'vue'

import { useTimeFormat } from '../time/format'
import { useNow } from '../time/useNow'

// Real time first (orange), how long ago (cream), the stardate small below (cream); `inline`
// puts all three on one baseline, for a protocol line.
const props = defineProps<{
  /** ISO 8601 time, e.g. an entry's `ts`, or a Date. */
  value: string | Date
  /** Reference time for the relative part; defaults to a clock ticking every 30 s. */
  now?: Date
  inline?: boolean
}>()

const format = useTimeFormat()
const ticking = useNow(30_000)

const iso = computed(() =>
  typeof props.value === 'string' ? props.value : props.value.toISOString(),
)
const realTime = computed(() => format.realTime(props.value))
const relative = computed(() => format.relative(props.value, props.now ?? ticking.value))
const stardate = computed(() => format.stardate(props.value))
</script>

<template>
  <div class="lc-timestamp" :class="{ 'lc-timestamp--inline': inline }">
    <div class="lc-timestamp__line">
      <time :datetime="iso" class="lc-timestamp__real lc-type-button lc-tabular">
        {{ realTime }}
      </time>
      <span class="lc-timestamp__relative lc-type-label lc-tabular">{{ relative }}</span>
    </div>
    <span class="lc-timestamp__stardate lc-type-code lc-tabular">{{ stardate }}</span>
  </div>
</template>

<style scoped>
.lc-timestamp {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.lc-timestamp--inline {
  flex-flow: row wrap;
  align-items: baseline;
  column-gap: var(--space-3);
}
.lc-timestamp__line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: var(--space-3);
}
.lc-timestamp__real {
  color: var(--color-lcars-orange);
}
.lc-timestamp__relative,
.lc-timestamp__stardate {
  color: var(--color-lcars-cream);
}
</style>
