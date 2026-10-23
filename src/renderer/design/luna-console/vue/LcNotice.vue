<script setup lang="ts">
// Replaces page content: 'red' = connection lost, 'yellow' = misconfiguration,
// 'offline' = the controlled device is off.
defineProps<{ kind: 'red' | 'yellow' | 'offline'; title: string; details?: string[] }>()
</script>

<template>
  <div class="lc-notice" :class="`lc-notice--${kind}`" role="status">
    <span class="lc-notice__title">{{ title }}</span>
    <span v-for="detail in details ?? []" :key="detail" class="lc-notice__detail">{{ detail }}</span>
  </div>
</template>
