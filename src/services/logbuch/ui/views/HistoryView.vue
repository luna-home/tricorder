<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import LcChip from '@renderer/components/LcChip.vue'
import LcPageHead from '@renderer/components/LcPageHead.vue'
import LcTimestamp from '@renderer/components/LcTimestamp.vue'
import { parseNote } from '@renderer/components/note'
import QueryState from '@renderer/components/QueryState.vue'
import { useService } from '@renderer/platform/useService'
import { useTimeFormat } from '@renderer/time/format'

import { MAX_PINS, type LogbuchEntry } from '../../contract'
import EntryFields from '../components/EntryFields.vue'
import PinRow from '../components/PinRow.vue'
import { useLogbuchI18n } from '../i18n'

// THEMA: the newest entry in full on top, that is where the topic stands. Below it the older
// entries, newest first, one line each; a line opens to the full entry. An open topic can be
// pinned (ANHEFTEN / LÖSEN). The topic matches case-insensitively; the heading shows the stored
// spelling.
const props = defineProps<{ project: string; topic: string }>()

const { lt, te } = useLogbuchI18n()
const router = useRouter()
const logbuch = useService('logbuch')
const format = useTimeFormat()

const history = logbuch.query('history', () => ({ project: props.project, topic: props.topic }))
const entries = computed(() => history.data.value ?? [])
const latest = computed(() => entries.value.at(-1))
const older = computed(() => entries.value.slice(0, -1).reverse())
const topic = computed(() => latest.value?.topic ?? props.topic)
const closed = computed(() => latest.value?.kind === 'done')

const pins = logbuch.query('pins')
const pinned = computed(() =>
  (pins.data.value ?? []).find(
    (pin) => pin.project === props.project && pin.topic.toLowerCase() === topic.value.toLowerCase(),
  ),
)
const pin = logbuch.mutation('pin')
const unpin = logbuch.mutation('unpin')
const pinMessage = ref<string>()

const buttons = computed(() => [
  { id: 'continue', label: lt('actions.continue'), color: 'peach' as const },
  ...(closed.value || !latest.value
    ? []
    : [
        pinned.value
          ? { id: 'unpin', label: lt('actions.unpin'), color: 'mauve' as const }
          : { id: 'pin', label: lt('actions.pin'), color: 'mauve' as const },
        { id: 'finish', label: lt('actions.finish'), color: 'orange' as const },
      ]),
  { id: 'back', label: lt('actions.back'), color: 'lavender' as const },
])

async function togglePin() {
  pinMessage.value = undefined
  const params = { project: props.project, topic: topic.value }
  if (pinned.value) return void (await unpin.mutateAsync(params).catch(showPinError))
  if ((pins.data.value?.length ?? 0) >= MAX_PINS) {
    pinMessage.value = lt('pins.full', { max: MAX_PINS })
    return
  }
  await pin.mutateAsync(params).catch(showPinError)
}
function showPinError(error: unknown) {
  pinMessage.value = error instanceof Error ? error.message : String(error)
}

function sourceLabel(source: string): string {
  const key = `services.logbuch.sources.${source.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}`
  return te(key) ? lt(key.slice('services.logbuch.'.length)) : source
}

/** First paragraph or Spiegelstrich of the status: the one-line summary of an older entry. */
function firstLine(entry: LogbuchEntry): string {
  const block = parseNote(entry.status ?? '')[0]
  return block ? (block.kind === 'list' ? block.items[0]! : block.text) : ''
}

function press(id: string) {
  const params = { project: props.project, topic: topic.value }
  if (id === 'continue') void router.push({ name: 'logbuch.new', query: params })
  else if (id === 'pin' || id === 'unpin') void togglePin()
  else if (id === 'finish') void router.push({ name: 'logbuch.done', params })
  else void router.push({ name: 'logbuch' })
}
</script>

<template>
  <div class="logbuch-page" data-lc-density="log">
    <PinRow :project="project" :topic="topic" />
    <LcPageHead
      :kicker="pinned ? `${project} · ${lt('pins.key', { n: pinned.position })}` : project"
      :title="topic"
      :count="entries.length"
    />

    <div class="lc-chips">
      <LcChip
        v-for="item in buttons"
        :key="item.id"
        :label="item.label"
        :color="item.color"
        @click="press(item.id)"
      />
    </div>
    <p v-if="pinMessage" class="lc-type-status lc-text-cream lc-verbatim" role="status">
      {{ pinMessage }}
    </p>

    <QueryState
      :loading="history.isPending.value"
      :error="history.error.value"
      :empty="!entries.length"
      :empty-title="lt('history.notFound')"
      :empty-hint="lt('history.notFoundHint')"
    >
      <section v-if="latest" class="current" :aria-label="lt('history.current')">
        <span class="current__spine" aria-hidden="true" />
        <div class="current__body">
          <div class="entry__meta">
            <LcTimestamp :value="latest.ts" inline />
            <span class="lc-type-status lc-text-lavender">
              {{ lt('fields.source') }}
              <span class="lc-text-cream">{{ sourceLabel(latest.source) }}</span>
            </span>
            <span v-if="closed" class="entry__done lc-type-code">{{ lt('history.done') }}</span>
          </div>
          <EntryFields :entry="latest" />
        </div>
      </section>
      <p v-if="closed" class="lc-type-label lc-text-lavender">{{ lt('history.closed') }}</p>

      <template v-if="older.length">
        <h3 class="history__title lc-type-label lc-text-lavender">{{ lt('history.title') }}</h3>
        <ol class="entry-list" :aria-label="lt('history.list')">
          <li v-for="entry in older" :key="entry.id" class="entry">
            <details>
              <summary class="entry__summary">
                <time :datetime="entry.ts" class="lc-type-status lc-text-orange lc-tabular">
                  {{ format.realTime(entry.ts) }}
                </time>
                <span v-if="entry.kind === 'done'" class="entry__done lc-type-code">
                  {{ lt('history.done') }}
                </span>
                <span class="entry__line lc-type-status lc-text-cream lc-verbatim">
                  {{ firstLine(entry) }}
                </span>
              </summary>
              <div class="entry__body">
                <span class="lc-type-status lc-text-lavender">
                  {{ lt('fields.source') }}
                  <span class="lc-text-cream">{{ sourceLabel(entry.source) }}</span>
                </span>
                <EntryFields :entry="entry" />
              </div>
            </details>
          </li>
        </ol>
      </template>
    </QueryState>
  </div>
</template>

<style scoped>
.logbuch-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 0;
}
.logbuch-page > p,
.history__title {
  margin: 0;
}
.current {
  display: grid;
  grid-template-columns: var(--space-3) minmax(0, 1fr);
  column-gap: var(--space-5);
}
.current__spine {
  border-radius: var(--radius-segment);
  background: var(--color-lcars-orange);
}
.current__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
  min-width: 0;
}
.entry__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-3);
}
.entry-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
/* One line per older entry; the marker is ours, not the browser's triangle. */
.entry__summary {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  min-width: 0;
  cursor: pointer;
  list-style: none;
}
.entry__summary::-webkit-details-marker {
  display: none;
}
.entry__summary:focus-visible {
  outline: 3px solid var(--color-lcars-cream);
  outline-offset: 2px;
}
.entry__summary:hover .entry__line {
  color: var(--color-lcars-orange);
}
.entry__line {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
details[open] .entry__line {
  white-space: normal;
}
.entry__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
  margin: var(--space-1-5) 0 var(--space-2-5) var(--space-5);
}
/* Done marker: ink on a mauve pill. */
.entry__done {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-lcars-mauve);
  color: var(--color-lcars-ink);
}
</style>
