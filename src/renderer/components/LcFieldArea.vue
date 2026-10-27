<script setup lang="ts">
import { computed, nextTick, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { continueList } from './note'

// Multi-line text field, same look and contract as LcField. Cmd/Ctrl+Enter emits `submit`;
// Enter in a Spiegelstrich line (`- `) continues the list, Enter on an empty item ends it.
const props = withDefaults(
  defineProps<{
    label: string
    required?: boolean
    error?: string
    hint?: string
    disabled?: boolean
    placeholder?: string
    rows?: number
    name?: string
  }>(),
  {
    required: false,
    error: undefined,
    hint: undefined,
    disabled: false,
    placeholder: undefined,
    rows: 3,
    name: undefined,
  },
)

const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ submit: [] }>()
const { t } = useI18n()

const id = useId()
const errorId = `${id}-error`
const hintId = `${id}-hint`
const area = useTemplateRef<HTMLTextAreaElement>('area')

const describedBy = computed(
  () =>
    [props.error ? errorId : undefined, props.hint ? hintId : undefined]
      .filter(Boolean)
      .join(' ') || undefined,
)

function onEnter(event: KeyboardEvent) {
  const el = area.value
  if (!el || event.isComposing) return
  const next = continueList(model.value, el.selectionStart, el.selectionEnd)
  if (!next) return
  event.preventDefault()
  model.value = next.value
  void nextTick(() => el.setSelectionRange(next.caret, next.caret))
}

defineExpose({ focus: () => area.value?.focus() })
</script>

<template>
  <div class="lc-field">
    <label :for="id" class="lc-field__label lc-type-label">
      <span>{{ label }}</span>
      <span v-if="required" class="lc-field__required lc-type-code" aria-hidden="true">
        {{ t('field.required') }}
      </span>
    </label>
    <textarea
      :id="id"
      ref="area"
      v-model="model"
      class="lc-field__control lc-type-label"
      :name="name"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :aria-required="required ? 'true' : undefined"
      :aria-invalid="error ? 'true' : 'false'"
      :aria-describedby="describedBy"
      @keydown.enter.exact="onEnter"
      @keydown.meta.enter.prevent="emit('submit')"
      @keydown.ctrl.enter.prevent="emit('submit')"
    />
    <p v-if="hint" :id="hintId" class="lc-field__hint lc-type-status">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="lc-field__error lc-type-status" aria-live="polite">
      {{ error }}
    </p>
  </div>
</template>

<style src="./field.css"></style>
