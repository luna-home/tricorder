<script setup lang="ts">
import type { LcBarSegment } from './types'

defineProps<{ segments: LcBarSegment[] }>()
</script>

<template>
  <div class="lc-bar">
    <div
      v-for="(segment, i) in segments"
      :key="i"
      class="lc-pulse"
      :class="[`lc-bg-${segment.color}`, { 'lc-bar__fill': segment.width === 'fill' }]"
      :style="segment.width === 'fill' ? undefined : { width: `${segment.width}px` }"
    />
  </div>
</template>
