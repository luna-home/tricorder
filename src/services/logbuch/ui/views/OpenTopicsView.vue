<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LcTimestamp from '@renderer/components/LcTimestamp.vue'
import QueryState from '@renderer/components/QueryState.vue'
import { LcControlRow, LcOptionPill } from '@renderer/design/luna-console/vue'
import { useService } from '@renderer/platform/useService'

import EntryFields from '../components/EntryFields.vue'
import PageHead from '../components/PageHead.vue'
import { useLogbuchI18n } from '../i18n'

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
const entries = computed(() => topics.data.value ?? [])

function select(name?: string) {
  void router.replace({ query: name ? { project: name } : {} })
}

function newEntry() {
  void router.push({ name: 'logbuch.new', query: project.value ? { project: project.value } : {} })
}
</script>

<template>
  <div class="logbuch-page">
    <PageHead :kicker="lt('open.kicker')" :title="lt('open.title')" :count="entries.length" />

    <LcControlRow
      :buttons="[{ id: 'new', label: lt('actions.new'), color: 'peach' }]"
      @press="newEntry"
    />

    <div
      v-if="filterProjects.length"
      class="lc-options"
      role="group"
      :aria-label="lt('open.filter')"
    >
      <LcOptionPill :label="lt('open.all')" :selected="!project" @select="select()" />
      <LcOptionPill
        v-for="name in filterProjects"
        :key="name"
        :label="name"
        :selected="name === project"
        @select="select(name)"
      />
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
              <span class="topic__project lc-type-label lc-text-lavender">{{ entry.project }}</span>
              <span class="topic__name lc-type-button lc-text-orange">{{ entry.topic }}</span>
              <LcTimestamp :value="entry.ts" />
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
.topic__name {
  overflow-wrap: anywhere;
}
</style>
