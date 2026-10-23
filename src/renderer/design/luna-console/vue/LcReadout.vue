<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ label: string; value: number | string; alert?: boolean }>()

const isNumber = computed(() => typeof props.value === 'number')
const display = computed(() => (isNumber.value ? String(props.value).padStart(3, '0') : props.value))
</script>

<template>
  <div class="lc-readout">
    <span class="lc-readout__label">{{ label }}</span>
    <span
      class="lc-readout__value"
      :class="{ 'lc-readout__value--text': !isNumber && !alert }"
      :data-state="alert ? 'alert' : undefined"
    >
      {{ display }}
    </span>
  </div>
</template>
