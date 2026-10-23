<script setup lang="ts">
defineProps<{ online: boolean; label?: string }>()
</script>

<template>
  <span class="lc-status" :data-state="online ? 'online' : 'offline'">
    {{ label ?? (online ? 'Online' : 'Offline') }}
  </span>
</template>
