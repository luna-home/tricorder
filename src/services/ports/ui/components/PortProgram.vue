<script setup lang="ts">
import type { PortListener } from '../../contract'
import { usePortsI18n } from '../i18n'

// Program, PID and user of a port. As the row's headline the name is an orange value; under a
// Docker container (`secondary`) the whole line is cream detail.
defineProps<{ listener: PortListener; secondary?: boolean }>()

const { pt } = usePortsI18n()
const pad = (value: number) => String(value).padStart(5, '0')
</script>

<template>
  <span
    class="port-program__name lc-verbatim"
    :class="[
      secondary ? 'lc-type-label' : 'lc-type-button',
      listener.process && !secondary ? 'lc-text-orange' : 'lc-text-cream',
    ]"
    >{{ listener.process ?? pt('unknownProcess') }}</span
  >
  <span v-if="listener.pid !== null" class="lc-type-label lc-text-cream lc-tabular"
    >{{ pt('pid') }} {{ pad(listener.pid) }}</span
  >
  <span v-if="listener.user" class="lc-type-label lc-text-cream lc-verbatim">{{
    listener.user
  }}</span>
</template>

<style scoped>
.port-program__name {
  overflow-wrap: anywhere;
}
</style>
