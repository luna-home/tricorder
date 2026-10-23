<script setup lang="ts">
import type { LcColor } from './types'

// A row of pill buttons that reads as one shape: only the outer ends are rounded.
const props = defineProps<{
  buttons: { id: string; label: string; color?: LcColor }[]
  /** CSS grid-template-columns, e.g. '1fr 1fr 1.3fr'. */
  columns?: string
}>()

const emit = defineEmits<{ press: [id: string] }>()

function capClass(i: number): string {
  if (props.buttons.length === 1) return 'lc-btn--pill'
  if (i === 0) return 'lc-btn--cap-left'
  if (i === props.buttons.length - 1) return 'lc-btn--cap-right'
  return ''
}
</script>

<template>
  <div class="lc-row" :style="columns ? { gridTemplateColumns: columns } : undefined">
    <button
      v-for="(button, i) in buttons"
      :key="button.id"
      type="button"
      class="lc-btn"
      :class="[`lc-bg-${button.color ?? 'lavender'}`, capClass(i)]"
      @click="emit('press', button.id)"
    >
      {{ button.label }}
    </button>
  </div>
</template>
