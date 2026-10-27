<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import LcFieldArea from '@renderer/components/LcFieldArea.vue'
import LcPageHead from '@renderer/components/LcPageHead.vue'
import { LcCommandTile } from '@renderer/design/luna-console/vue'
import { useService } from '@renderer/platform/useService'

import EntryFields from '../components/EntryFields.vue'
import { useLogbuchI18n } from '../i18n'

// ABSCHLIESSEN: two taps. The first arms the tile (it turns red and asks to confirm), the second
// writes the done marker. Without a second tap the tile disarms after a few seconds.
const ARMED_MS = 5000

const props = defineProps<{ project: string; topic: string }>()

const { lt } = useLogbuchI18n()
const router = useRouter()
const logbuch = useService('logbuch')

const last = logbuch.query('history', () => ({
  project: props.project,
  topic: props.topic,
  limit: 1,
}))
const latest = computed(() => last.data.value?.at(-1))

const note = ref('')
const armed = ref(false)
const error = ref<string>()
const done = logbuch.mutation('done')
let disarmTimer: ReturnType<typeof setTimeout> | undefined

function disarm() {
  clearTimeout(disarmTimer)
  armed.value = false
}

async function press() {
  if (done.isPending.value) return
  if (!armed.value) {
    armed.value = true
    disarmTimer = setTimeout(disarm, ARMED_MS)
    return
  }
  disarm()
  error.value = undefined
  try {
    await done.mutateAsync({ project: props.project, topic: props.topic, note: note.value })
    await router.push({ name: 'logbuch' })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function cancel() {
  disarm()
  void router.push({
    name: 'logbuch.history',
    params: { project: props.project, topic: props.topic },
  })
}

onUnmounted(() => clearTimeout(disarmTimer))
</script>

<template>
  <div class="done-page" data-lc-density="log">
    <LcPageHead :kicker="`${project} / ${latest?.topic ?? topic}`" :title="lt('done.title')" />

    <section v-if="latest" class="done-page__last" :aria-label="lt('done.last')">
      <span class="lc-type-label lc-text-lavender">{{ lt('done.last') }}</span>
      <EntryFields :entry="latest" />
    </section>

    <LcFieldArea v-model="note" name="note" :label="lt('fields.note')" />

    <p class="lc-type-status lc-text-cream">{{ lt('done.hint') }}</p>
    <p v-if="error" class="lc-type-status" role="alert">
      <span class="lc-text-red">{{ lt('done.failed') }}</span>
      <span class="lc-text-cream lc-verbatim"> {{ error }}</span>
    </p>

    <div class="lc-tiles">
      <LcCommandTile
        code="01-END"
        :label="lt('actions.finish')"
        :confirm-label="lt('done.confirm')"
        :armed="armed"
        color="orange"
        corner="tl"
        @press="press"
      />
      <LcCommandTile
        code="02-ESC"
        :label="lt('actions.cancel')"
        color="lavender"
        corner="tr"
        @press="cancel"
      />
    </div>
  </div>
</template>

<style scoped>
.done-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 0;
}
.done-page > p {
  margin: 0;
}
.done-page__last {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
}
</style>
