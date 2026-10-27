<script setup lang="ts">
// Page heading: lavender kicker above an orange title, optional zero-padded count on the right.
defineProps<{ kicker: string; title: string; count?: number }>()
</script>

<template>
  <header class="page-head">
    <div class="page-head__text">
      <span class="lc-type-label lc-text-lavender">{{ kicker }}</span>
      <h2 class="page-head__title lc-type-readout lc-text-orange">{{ title }}</h2>
    </div>
    <span v-if="count !== undefined" class="lc-type-readout lc-text-orange lc-tabular">
      {{ String(count).padStart(3, '0') }}
    </span>
  </header>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-5);
}
.page-head__text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.page-head__title {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
