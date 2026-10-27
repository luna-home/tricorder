<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import LcChip from '@renderer/components/LcChip.vue'
import { useService } from '@renderer/platform/useService'

import type { LogbuchPin } from '../../contract'
import { useLogbuchI18n } from '../i18n'
import { pinColor } from '../pins'

// The pinned topics as a row of chips on top of the logbuch pages, by position; a pin keeps its
// number, so Cmd/Ctrl+1..4 always means the same topic. The keys work while this row is on screen (not in
// the form, so typing is never interrupted). The open topic's pill turns cream.
const props = defineProps<{ project?: string; topic?: string }>()

const { lt } = useLogbuchI18n()
const router = useRouter()
const logbuch = useService('logbuch')
const pins = logbuch.query('pins')

const isCurrent = (pin: LogbuchPin) =>
  pin.project === props.project && pin.topic.toLowerCase() === props.topic?.toLowerCase()

function open(pin: LogbuchPin) {
  void router.push({
    name: 'logbuch.history',
    params: { project: pin.project, topic: pin.topic },
  })
}

function onKey(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
  const position = /^[1-9]$/.test(event.key) ? Number(event.key) : 0
  const pin = pins.data.value?.find((item) => item.position === position)
  if (!pin) return
  event.preventDefault()
  open(pin)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <nav v-if="pins.data.value?.length" class="lc-chips" :aria-label="lt('pins.label')">
    <LcChip
      v-for="pin in pins.data.value"
      :key="pin.position"
      :label="`${pin.position} ${pin.topic}`"
      :color="pinColor(pin.position)"
      :current="isCurrent(pin)"
      :hint="`${pin.project} · ${lt('pins.key', { n: pin.position })}`"
      :aria-keyshortcuts="`Meta+${pin.position} Control+${pin.position}`"
      @click="open(pin)"
    />
  </nav>
</template>
