<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteUpdate, useRoute, useRouter, type LocationQuery } from 'vue-router'

import LcField from '@renderer/components/LcField.vue'
import LcFieldArea from '@renderer/components/LcFieldArea.vue'
import { LcControlRow } from '@renderer/design/luna-console/vue'
import { useService } from '@renderer/platform/useService'

import { logbuchContract } from '../../contract'
import PageHead from '../components/PageHead.vue'
import { useLogbuchI18n } from '../i18n'

// NEUER EINTRAG: ?project=&topic= prefill. Validated with the contract's input schema before it
// is sent; the host validates again. The router reuses this view when only the query changes
// (rail "Neu" from a prefilled form), so the form starts over on every route update.
type FieldKey = 'project' | 'topic' | 'status' | 'nextStep' | 'openQuestions' | 'refs'

const { lt } = useLogbuchI18n()
const route = useRoute()
const router = useRouter()
const logbuch = useService('logbuch')

const queryText = (value: unknown) => (typeof value === 'string' ? value : '')
const prefillOf = (query: LocationQuery) => ({
  project: queryText(query.project),
  topic: queryText(query.topic),
})
const emptyForm = (query: LocationQuery): Record<FieldKey, string> => ({
  ...prefillOf(query),
  status: '',
  nextStep: '',
  openQuestions: '',
  refs: '',
})

let prefill = prefillOf(route.query)
const form = reactive(emptyForm(route.query))
const errors = ref<Partial<Record<FieldKey, string>>>({})
const submitError = ref<string>()

onBeforeRouteUpdate((to) => {
  prefill = prefillOf(to.query)
  Object.assign(form, emptyForm(to.query))
  errors.value = {}
  submitError.value = undefined
})

const projects = logbuch.query('projects')
const projectNames = computed(() => (projects.data.value ?? []).map((item) => item.project))
const knownProject = computed(() => projectNames.value.includes(form.project.trim()))
const topics = logbuch.query('topics', () => ({ project: form.project.trim() }), {
  enabled: knownProject,
})
const topicNames = computed(() =>
  knownProject.value ? (topics.data.value ?? []).map((item) => item.topic) : [],
)

const save = logbuch.mutation('addEntry')

// Editing a field clears its error.
watch(
  () => ({ ...form }),
  (next, previous) => {
    for (const key of Object.keys(next) as FieldKey[]) {
      if (next[key] !== previous[key]) delete errors.value[key]
    }
  },
)

const fieldRefs: Partial<Record<FieldKey, { focus(): void } | null>> = {}
const setRef = (key: FieldKey) => (el: unknown) => {
  fieldRefs[key] = el as { focus(): void } | null
}

async function submit() {
  if (save.isPending.value) return
  submitError.value = undefined
  const parsed = logbuchContract.methods.addEntry.input.safeParse(form)
  if (!parsed.success) {
    const next: Partial<Record<FieldKey, string>> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as FieldKey
      next[key] ??= lt(
        issue.code === 'too_small' || issue.code === 'invalid_type'
          ? 'form.errors.required'
          : 'form.errors.invalid',
      )
    }
    errors.value = next
    const order: FieldKey[] = ['project', 'topic', 'status', 'nextStep', 'openQuestions', 'refs']
    const first = order.find((key) => next[key])
    if (first) fieldRefs[first]?.focus()
    return
  }
  try {
    const result = await save.mutateAsync(parsed.data)
    await router.push({
      name: 'logbuch.history',
      params: { project: result.project, topic: result.topic },
    })
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : String(error)
  }
}

function cancel() {
  if (prefill.project && prefill.topic) {
    void router.push({ name: 'logbuch.history', params: prefill })
  } else {
    void router.push({ name: 'logbuch' })
  }
}

function press(id: string) {
  if (id === 'save') void submit()
  else cancel()
}
</script>

<template>
  <form class="entry-form" novalidate @submit.prevent="submit">
    <PageHead :kicker="lt('form.kicker')" :title="lt('form.title')" />

    <div class="entry-form__grid">
      <div class="entry-form__col">
        <LcField
          :ref="setRef('project')"
          v-model="form.project"
          name="project"
          :label="lt('fields.project')"
          :placeholder="lt('form.placeholders.project')"
          :suggestions="projectNames"
          :error="errors.project"
          required
        />
        <LcField
          :ref="setRef('topic')"
          v-model="form.topic"
          name="topic"
          :label="lt('fields.topic')"
          :placeholder="lt('form.placeholders.topic')"
          :suggestions="topicNames"
          :error="errors.topic"
          required
        />
        <LcField
          :ref="setRef('nextStep')"
          v-model="form.nextStep"
          name="nextStep"
          :label="lt('fields.nextStep')"
          :placeholder="lt('form.placeholders.nextStep')"
          :error="errors.nextStep"
        />
        <LcField
          :ref="setRef('refs')"
          v-model="form.refs"
          name="refs"
          :label="lt('fields.refs')"
          :placeholder="lt('form.placeholders.refs')"
          :error="errors.refs"
        />
      </div>
      <div class="entry-form__col">
        <LcFieldArea
          :ref="setRef('status')"
          v-model="form.status"
          name="status"
          :label="lt('fields.status')"
          :placeholder="lt('form.placeholders.status')"
          :error="errors.status"
          :hint="lt('form.shortcut')"
          :rows="4"
          required
          @submit="submit"
        />
        <LcFieldArea
          :ref="setRef('openQuestions')"
          v-model="form.openQuestions"
          name="openQuestions"
          :label="lt('fields.openQuestions')"
          :placeholder="lt('form.placeholders.openQuestions')"
          :error="errors.openQuestions"
          @submit="submit"
        />
      </div>
    </div>

    <p v-if="save.isPending.value" class="lc-type-status lc-text-lavender" aria-live="polite">
      {{ lt('form.saving') }}
    </p>
    <p v-if="submitError" class="lc-type-status" role="alert">
      <span class="lc-text-red">{{ lt('form.failed') }}</span>
      <span class="lc-text-cream lc-verbatim"> {{ submitError }}</span>
    </p>

    <LcControlRow
      :buttons="[
        { id: 'save', label: lt('actions.save'), color: 'orange' },
        { id: 'cancel', label: lt('actions.cancel'), color: 'lavender' },
      ]"
      @press="press"
    />
  </form>
</template>

<style scoped>
.entry-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 0;
}
.entry-form > p {
  margin: 0;
}
.entry-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: var(--space-5) var(--space-8);
}
.entry-form__col {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 0;
}
</style>
