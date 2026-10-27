<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LcChip from '@renderer/components/LcChip.vue'
import LcPageHead from '@renderer/components/LcPageHead.vue'
import QueryState from '@renderer/components/QueryState.vue'
import { useService } from '@renderer/platform/useService'

import type { PortListener } from '../../contract'
import PortProgram from '../components/PortProgram.vue'
import { usePortsI18n } from '../i18n'

// BELEGTE PORTS: every listening TCP port and bound UDP port with its program, live while the
// page is visible. On a Docker port the container is the headline and the forwarding program
// (com.docker.backend) moves to the line below. The filters live in the query (?proto=,
// ?extern=1, ?docker=1), so going back keeps them.
const REFRESH_MS = 3000
const PROTOCOLS = ['tcp', 'udp'] as const

const { pt } = usePortsI18n()
const route = useRoute()
const router = useRouter()
const ports = useService('ports')
const list = ports.query('list', undefined, { refetchInterval: REFRESH_MS })

const protocol = computed(() => PROTOCOLS.find((item) => item === route.query.proto))
const externalOnly = computed(() => route.query.extern === '1')
const dockerOnly = computed(() => route.query.docker === '1')

const listeners = computed(() =>
  (list.data.value ?? []).filter(
    (item) =>
      (!protocol.value || item.protocol === protocol.value) &&
      (!externalOnly.value || item.scope !== 'loopback') &&
      (!dockerOnly.value || item.docker),
  ),
)

function filter(next: { proto?: string; extern?: boolean; docker?: boolean }) {
  const proto = 'proto' in next ? next.proto : protocol.value
  const extern = next.extern ?? externalOnly.value
  const docker = next.docker ?? dockerOnly.value
  void router.replace({
    query: {
      ...(proto ? { proto } : {}),
      ...(extern ? { extern: '1' } : {}),
      ...(docker ? { docker: '1' } : {}),
    },
  })
}

const pad = (value: number) => String(value).padStart(5, '0')
const key = (item: PortListener) => `${item.protocol}/${item.port}/${item.pid ?? ''}`
const containers = (item: PortListener) => item.docker?.containers ?? []
</script>

<template>
  <div class="ports-page" data-lc-density="log">
    <LcPageHead :kicker="pt('kicker')" :title="pt('title')" :count="listeners.length" />

    <div class="lc-chips" role="group" :aria-label="pt('filter.label')">
      <LcChip
        :label="pt('filter.all')"
        color="inactive"
        :pressed="!protocol"
        @click="filter({ proto: undefined })"
      />
      <LcChip
        v-for="item in PROTOCOLS"
        :key="item"
        :label="pt(`filter.${item}`)"
        color="inactive"
        :pressed="protocol === item"
        @click="filter({ proto: item })"
      />
      <LcChip
        class="ports-page__external"
        :label="pt('filter.external')"
        color="inactive"
        :pressed="externalOnly"
        @click="filter({ extern: !externalOnly })"
      />
      <LcChip
        :label="pt('filter.docker')"
        color="inactive"
        :pressed="dockerOnly"
        @click="filter({ docker: !dockerOnly })"
      />
    </div>

    <QueryState
      :loading="list.isPending.value"
      :error="list.error.value"
      :empty="!listeners.length"
      :empty-title="pt('empty')"
      :empty-hint="pt('emptyHint')"
    >
      <ul class="port-list" :aria-label="pt('list')">
        <li
          v-for="item in listeners"
          :key="key(item)"
          class="port"
          :class="{ 'port--container': containers(item).length }"
        >
          <span class="port__number lc-type-button lc-text-orange lc-tabular">{{
            pad(item.port)
          }}</span>
          <span class="port__protocol lc-type-code lc-text-lavender">{{
            pt(`filter.${item.protocol}`)
          }}</span>
          <span class="port__head">
            <span v-if="item.docker" class="port__marker lc-type-code lc-bg-peach">{{
              pt('docker')
            }}</span>
            <template v-if="containers(item).length">
              <span
                v-for="container in containers(item)"
                :key="container.name"
                class="port__container"
              >
                <span class="port__container-name lc-type-button lc-text-orange lc-verbatim">{{
                  container.name
                }}</span>
                <span class="lc-type-label lc-text-cream lc-tabular"
                  >→ {{ pad(container.port) }}</span
                >
              </span>
            </template>
            <PortProgram v-else :listener="item" />
          </span>
          <span v-if="containers(item).length" class="port__program">
            <PortProgram :listener="item" secondary />
          </span>
          <span class="port__scope lc-type-code lc-text-lavender">{{
            pt(`scope.${item.scope}`)
          }}</span>
          <span class="port__detail lc-type-label lc-text-cream lc-verbatim">
            <span>{{ item.addresses.join(' · ') }}</span>
            <span v-if="item.path" class="port__path">{{ item.path }}</span>
          </span>
        </li>
      </ul>
    </QueryState>
  </div>
</template>

<style scoped>
.ports-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 0;
}
/* The scope filter keeps a little distance from the protocol filters. */
.ports-page__external {
  margin-left: var(--space-5);
}
/* Port, protocol and program line up across rows through the subgrid. Labels sit in the second
   column, everything else in the third; a row with a container has one line more. */
.port-list {
  display: grid;
  grid-template-columns: max-content max-content minmax(0, 1fr);
  gap: var(--space-5) var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.port {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  row-gap: var(--space-1);
  align-items: baseline;
}
.port__number {
  grid-row: span 2;
}
.port--container .port__number {
  grid-row: span 3;
}
.port__protocol,
.port__scope {
  grid-column: 2;
}
.port__head,
.port__program,
.port__detail {
  grid-column: 3;
}
.port__program,
.port__container {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-3);
  min-width: 0;
}
.port__container-name {
  overflow-wrap: anywhere;
}
/* Marker pill: ink on a colored shape, bottom right, like the pin numbers of logbuch. */
.port__marker {
  display: inline-flex;
  align-items: flex-end;
  justify-content: flex-end;
  align-self: center;
  padding: var(--space-1) var(--space-2) 1px;
  border-radius: var(--radius-pill);
  color: var(--color-lcars-ink);
  line-height: 1;
}
.port__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-3);
  min-width: 0;
}
.port__detail {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  min-width: 0;
}
.port__path {
  overflow-wrap: anywhere;
}
</style>
