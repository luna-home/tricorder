<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LcChip from '@renderer/components/LcChip.vue'
import LcPageHead from '@renderer/components/LcPageHead.vue'
import LcTimestamp from '@renderer/components/LcTimestamp.vue'
import QueryState from '@renderer/components/QueryState.vue'
import { useService } from '@renderer/platform/useService'

import EntryFields from '../components/EntryFields.vue'
import PinRow from '../components/PinRow.vue'
import { useLogbuchI18n } from '../i18n'
import { pinColor } from '../pins'

// WO WAR ICH: the newest entry of every open topic, newest first. The project filter lives in
// the query (?project=), so going back keeps it.
const { lt } = useLogbuchI18n()
const route = useRoute()
const router = useRouter()
const logbuch = useService('logbuch')

const project = computed(() =>
  typeof route.query.project === 'string' && route.query.project ? route.query.project : undefined,
)

const projects = logbuch.query('projects')
const topics = logbuch.query('openTopics', () => ({ project: project.value, all: true }))

const filterProjects = computed(() => {
  const names = (projects.data.value ?? [])
    .filter((item) => item.openTopics > 0)
    .map((item) => item.project)
  return project.value && !names.includes(project.value) ? [...names, project.value] : names
})
const pins = logbuch.query('pins')
const pinOf = (project: string, topic: string) =>
  (pins.data.value ?? []).find(
    (pin) => pin.project === project && pin.topic.toLowerCase() === topic.toLowerCase(),
  )?.position
// Pinned topics first, by position (as `logbuch wo`), then the rest newest first.
const entries = computed(() =>
  (topics.data.value ?? [])
    .map((entry) => ({ entry, pin: pinOf(entry.project, entry.topic) }))
    .sort((a, b) => (a.pin ?? Infinity) - (b.pin ?? Infinity))
    .map(({ entry, pin }) => ({ ...entry, pin })),
)

function select(name?: string) {
  void router.replace({ query: name ? { project: name } : {} })
}

function newEntry() {
  void router.push({ name: 'logbuch.new', query: project.value ? { project: project.value } : {} })
}
</script>

<template>
  <div class="logbuch-page" data-lc-density="log">
    <PinRow />
    <LcPageHead :kicker="lt('open.kicker')" :title="lt('open.title')" :count="entries.length" />

    <div class="lc-chips">
      <LcChip :label="lt('actions.new')" color="peach" @click="newEntry" />
      <div
        v-if="filterProjects.length"
        class="topic-filter lc-chips"
        role="group"
        :aria-label="lt('open.filter')"
      >
        <LcChip :label="lt('open.all')" color="inactive" :pressed="!project" @click="select()" />
        <LcChip
          v-for="name in filterProjects"
          :key="name"
          :label="name"
          color="inactive"
          :pressed="name === project"
          @click="select(name)"
        />
      </div>
    </div>

    <QueryState
      :loading="topics.isPending.value"
      :error="topics.error.value"
      :empty="!entries.length"
      :empty-title="lt('open.empty')"
      :empty-hint="lt('open.emptyHint')"
    >
      <ul class="topic-list" :aria-label="lt('open.list')">
        <li v-for="entry in entries" :key="entry.id">
          <RouterLink
            class="topic"
            :to="{
              name: 'logbuch.history',
              params: { project: entry.project, topic: entry.topic },
            }"
          >
            <span class="topic__spine" aria-hidden="true" />
            <span class="topic__body">
              <span class="topic__head">
                <span
                  v-if="entry.pin"
                  class="topic__pin lc-type-code"
                  :class="`lc-bg-${pinColor(entry.pin)}`"
                  :title="lt('pins.key', { n: entry.pin })"
                  >{{ entry.pin }}</span
                >
                <span class="topic__project lc-type-label lc-text-lavender">{{
                  entry.project
                }}</span>
                <span class="topic__name lc-type-button lc-text-orange">{{ entry.topic }}</span>
                <LcTimestamp :value="entry.ts" inline />
              </span>
              <EntryFields :entry="entry" />
            </span>
          </RouterLink>
        </li>
      </ul>
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
/* The filter keeps a little distance from the command before it. */
.topic-filter {
  margin-left: var(--space-5);
}
.topic-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin: 0;
  padding: 0;
  list-style: none;
}
.topic {
  display: grid;
  grid-template-columns: var(--space-3) minmax(0, 1fr);
  column-gap: var(--space-5);
  color: inherit;
  text-decoration: none;
}
.topic:focus-visible {
  outline: 3px solid var(--color-lcars-cream);
  outline-offset: 2px;
}
.topic__spine {
  border-radius: var(--radius-segment);
  background: var(--color-lcars-inactive);
}
.topic:hover .topic__spine,
.topic:focus-visible .topic__spine {
  background: var(--color-lcars-orange);
}
.topic__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
  min-width: 0;
}
.topic__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-3);
}
.topic__pin {
  display: inline-flex;
  align-items: flex-end;
  justify-content: flex-end;
  align-self: center;
  min-width: calc(2.5 * var(--type-code));
  padding: var(--space-1) var(--space-2) 1px;
  border-radius: var(--radius-pill);
  color: var(--color-lcars-ink);
  line-height: 1;
}
.topic__name {
  overflow-wrap: anywhere;
}
</style>
