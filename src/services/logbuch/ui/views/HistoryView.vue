<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import LcTimestamp from '@renderer/components/LcTimestamp.vue'
import QueryState from '@renderer/components/QueryState.vue'
import { LcControlRow } from '@renderer/design/luna-console/vue'
import { useService } from '@renderer/platform/useService'

import EntryFields from '../components/EntryFields.vue'
import PageHead from '../components/PageHead.vue'
import { useLogbuchI18n } from '../i18n'

// VERLAUF: every entry of one topic, oldest first. The topic matches case-insensitively; the
// heading shows the stored spelling.
const props = defineProps<{ project: string; topic: string }>()

const { lt, te } = useLogbuchI18n()
const router = useRouter()
const logbuch = useService('logbuch')

const history = logbuch.query('history', () => ({ project: props.project, topic: props.topic }))
const entries = computed(() => history.data.value ?? [])
const latest = computed(() => entries.value.at(-1))
const topic = computed(() => latest.value?.topic ?? props.topic)
const closed = computed(() => latest.value?.kind === 'done')

const buttons = computed(() => [
  { id: 'new', label: lt('actions.new'), color: 'peach' as const },
  ...(closed.value || !latest.value
    ? []
    : [{ id: 'finish', label: lt('actions.finish'), color: 'orange' as const }]),
  { id: 'back', label: lt('actions.back'), color: 'lavender' as const },
])

function sourceLabel(source: string): string {
  const key = `services.logbuch.sources.${source.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}`
  return te(key) ? lt(key.slice('services.logbuch.'.length)) : source
}

function press(id: string) {
  const params = { project: props.project, topic: topic.value }
  if (id === 'new') void router.push({ name: 'logbuch.new', query: params })
  else if (id === 'finish') void router.push({ name: 'logbuch.done', params })
  else void router.push({ name: 'logbuch' })
}
</script>

<template>
  <div class="logbuch-page">
    <PageHead :kicker="project" :title="topic" :count="entries.length" />

    <LcControlRow :buttons="buttons" @press="press" />

    <p v-if="closed" class="lc-type-label lc-text-lavender">{{ lt('history.closed') }}</p>

    <QueryState
      :loading="history.isPending.value"
      :error="history.error.value"
      :empty="!entries.length"
      :empty-title="lt('history.notFound')"
      :empty-hint="lt('history.notFoundHint')"
    >
      <ol class="entry-list" :aria-label="lt('history.list')">
        <li v-for="entry in entries" :key="entry.id" class="entry">
          <span class="entry__spine" aria-hidden="true" />
          <div class="entry__body">
            <LcTimestamp :value="entry.ts" />
            <div class="entry__meta">
              <span class="lc-type-status lc-text-lavender">
                {{ lt('fields.source') }}
                <span class="lc-text-cream">{{ sourceLabel(entry.source) }}</span>
              </span>
              <span v-if="entry.kind === 'done'" class="entry__done lc-type-code">
                {{ lt('history.done') }}
              </span>
            </div>
            <EntryFields :entry="entry" />
          </div>
        </li>
      </ol>
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
.logbuch-page > p {
  margin: 0;
}
.entry-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin: 0;
  padding: 0;
  list-style: none;
}
.entry {
  display: grid;
  grid-template-columns: var(--space-3) minmax(0, 1fr);
  column-gap: var(--space-5);
}
.entry__spine {
  border-radius: var(--radius-segment);
  background: var(--color-lcars-inactive);
}
.entry__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
  min-width: 0;
}
.entry__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
/* Done marker: ink on a mauve pill. */
.entry__done {
  padding: var(--space-1-5) var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-lcars-mauve);
  color: var(--color-lcars-ink);
}
</style>
