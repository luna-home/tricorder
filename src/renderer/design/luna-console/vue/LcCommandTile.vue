<script setup lang="ts">
import type { LcColor } from './types'

// One-shot command. Destructive commands use two taps: the parent sets `armed`
// after the first press and runs the command on the second.
withDefaults(
  defineProps<{
    code: string
    label: string
    color?: LcColor
    corner?: 'tl' | 'tr' | 'bl' | 'br'
    armed?: boolean
    confirmLabel?: string
  }>(),
  { color: 'orange', corner: undefined, armed: false, confirmLabel: 'Confirm?' },
)
defineEmits<{ press: [] }>()
</script>

<template>
  <button
    type="button"
    class="lc-tile"
    :class="[`lc-bg-${color}`, corner ? `lc-tile--${corner}` : '']"
    :data-armed="armed ? 'true' : 'false'"
    @click="$emit('press')"
  >
    <span class="lc-tile__code">{{ code }}</span>
    <span>{{ armed ? confirmLabel : label }}</span>
  </button>
</template>
