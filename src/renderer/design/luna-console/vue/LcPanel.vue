<script setup lang="ts">
import LcBar from './LcBar.vue'
import LcElbow from './LcElbow.vue'
import LcStatus from './LcStatus.vue'
import type { LcBarSegment, LcMode, LcNavPage } from './types'

// App frame; fills its container at any size. Fill the default slot with the page
// content (usually .lc-cols with two .lc-col).
const props = withDefaults(
  defineProps<{
    title: string
    clock: string
    date: string
    online?: boolean
    statusLabel?: string
    upperLabel?: string
    lowerLabel?: string
    mode?: LcMode
    pages?: LcNavPage[]
    currentPage?: string
    upperBar?: LcBarSegment[]
    lowerBar?: LcBarSegment[]
  }>(),
  {
    online: true,
    statusLabel: undefined,
    upperLabel: '',
    lowerLabel: '',
    mode: 'normal',
    pages: () => [],
    currentPage: undefined,
    upperBar: () => [
      { color: 'orange', width: 44 },
      { color: 'mauve', width: 300 },
      { color: 'lavender', width: 'fill' },
      { color: 'orange', width: 70 },
    ],
    lowerBar: () => [
      { color: 'red', width: 180 },
      { color: 'peach', width: 44 },
      { color: 'mauve', width: 'fill' },
      { color: 'red', width: 120 },
    ],
  },
)

const emit = defineEmits<{ navigate: [name: string] }>()
</script>

<template>
  <main
    class="lc-surface lc-panel"
    :class="{ 'lc-red-alert': props.mode === 'red-alert', 'lc-yellow-alert': props.mode === 'yellow-alert' }"
  >
    <LcElbow class="lc-panel__upper" direction="down" color="lavender" :label="upperLabel" />
    <LcBar class="lc-panel__upper-bar" :segments="upperBar" />
    <LcElbow class="lc-panel__lower" direction="up" color="red" :label="lowerLabel" :height="70" />
    <LcBar class="lc-panel__lower-bar" :segments="lowerBar" />

    <div class="lc-panel__header">
      <div class="lc-panel__clock">{{ clock }}</div>
      <div class="lc-panel__meta">
        <span class="lc-panel__date">{{ date }}</span>
        <LcStatus :online="online" :label="statusLabel" />
      </div>
    </div>
    <div class="lc-panel__title">{{ title }}</div>

    <nav class="lc-rail lc-panel__rail">
      <button
        v-for="page in pages"
        :key="page.name"
        type="button"
        class="lc-nav lc-pulse"
        :class="`lc-bg-${page.color}`"
        :aria-current="page.name === currentPage ? 'page' : undefined"
        :disabled="mode !== 'normal'"
        @click="emit('navigate', page.name)"
      >
        {{ page.label }}
      </button>
    </nav>

    <div class="lc-panel__content">
      <slot />
    </div>
  </main>
</template>
