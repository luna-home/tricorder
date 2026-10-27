<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

import type { LcColor } from '../design/luna-console/vue'

// Compact pill button: as wide as its label, up to a maximum, then an ellipsis. Only a cut label
// gets a tooltip with the full text; `hint` (e.g. a shortcut) is always in the tooltip. Set
// `pressed` for a toggle (filter) and `current` for the open page; both turn the pill on.
// Chips sit in a `.lc-chips` row, which wraps.
const props = withDefaults(
  defineProps<{
    label: string
    color?: LcColor
    pressed?: boolean | null
    current?: boolean
    hint?: string
  }>(),
  { color: 'lavender', pressed: null, current: false, hint: undefined },
)

const text = useTemplateRef<HTMLElement>('text')
const cut = ref(false)
// Measured when the pointer or focus arrives, so the tooltip follows the current width.
function measure() {
  const el = text.value
  cut.value = !!el && el.scrollWidth > el.clientWidth
}
const title = computed(
  () => [cut.value ? props.label : undefined, props.hint].filter(Boolean).join(' · ') || undefined,
)
</script>

<template>
  <button
    type="button"
    class="lc-chip"
    :class="`lc-bg-${color}`"
    :aria-pressed="pressed ?? undefined"
    :aria-current="current ? 'page' : undefined"
    :title="title"
    @pointerenter="measure"
    @focus="measure"
  >
    <span ref="text" class="lc-chip__label">{{ label }}</span>
  </button>
</template>

<style src="./chip.css"></style>
