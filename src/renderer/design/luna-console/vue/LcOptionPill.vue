<script setup lang="ts">
defineProps<{ label: string; selected?: boolean }>()
defineEmits<{ select: [] }>()
</script>

<template>
  <button type="button" class="lc-option" :aria-pressed="selected ? 'true' : 'false'" @click="$emit('select')">
    {{ label }}
  </button>
</template>
