<script setup lang="ts">
import type { LcColor } from './types'

withDefaults(
  defineProps<{
    /** 'down' = upper frame (opens downward), 'up' = lower frame. */
    direction?: 'down' | 'up'
    color?: LcColor
    label?: string
    height?: number
  }>(),
  { direction: 'down', color: 'lavender', label: '', height: undefined },
)
</script>

<template>
  <div
    class="lc-elbow lc-pulse"
    :class="[`lc-elbow--${direction}`, `lc-bg-${color}`]"
    :style="height ? { height: `${height}px` } : undefined"
  >
    <span v-if="label" class="lc-elbow__label">{{ label }}</span>
  </div>
</template>
