<script setup lang="ts">
import { computed, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

// Single-line text field. With `suggestions` it becomes a combobox: the list filters while
// typing, arrow keys move, Enter takes the active suggestion, Escape closes. Free text stays
// allowed.
const props = withDefaults(
  defineProps<{
    label: string
    required?: boolean
    error?: string
    hint?: string
    disabled?: boolean
    placeholder?: string
    suggestions?: readonly string[]
    maxSuggestions?: number
    name?: string
  }>(),
  {
    required: false,
    error: undefined,
    hint: undefined,
    disabled: false,
    placeholder: undefined,
    suggestions: () => [],
    maxSuggestions: 6,
    name: undefined,
  },
)

const model = defineModel<string>({ default: '' })
const { t } = useI18n()

const id = useId()
const errorId = `${id}-error`
const hintId = `${id}-hint`
const listId = `${id}-list`
const input = useTemplateRef<HTMLInputElement>('input')

const describedBy = computed(
  () =>
    [props.error ? errorId : undefined, props.hint ? hintId : undefined]
      .filter(Boolean)
      .join(' ') || undefined,
)

const open = ref(false)
const active = ref(-1)

const filtered = computed(() => {
  const query = model.value.trim().toLowerCase()
  return props.suggestions
    .filter((item) => {
      const lower = item.toLowerCase()
      return lower !== query && lower.includes(query)
    })
    .slice(0, props.maxSuggestions)
})
const expanded = computed(() => open.value && !props.disabled && filtered.value.length > 0)
const optionId = (index: number) => `${listId}-${index}`

function onInput(event: Event) {
  model.value = (event.target as HTMLInputElement).value
  open.value = true
  active.value = -1
}

function close() {
  open.value = false
  active.value = -1
}

function choose(value: string) {
  model.value = value
  close()
}

function onKeydown(event: KeyboardEvent) {
  const count = filtered.value.length
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!count) return
    event.preventDefault()
    if (!expanded.value) open.value = true
    const step = event.key === 'ArrowDown' ? 1 : -1
    active.value = active.value < 0 && step < 0 ? count - 1 : (active.value + step + count) % count
  } else if (event.key === 'Enter' && expanded.value && active.value >= 0) {
    event.preventDefault()
    choose(filtered.value[active.value] ?? model.value)
  } else if (event.key === 'Escape' && expanded.value) {
    event.preventDefault()
    event.stopPropagation()
    close()
  }
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="lc-field">
    <label :for="id" class="lc-field__label lc-type-label">
      <span>{{ label }}</span>
      <span v-if="required" class="lc-field__required lc-type-code" aria-hidden="true">
        {{ t('field.required') }}
      </span>
    </label>
    <input
      :id="id"
      ref="input"
      class="lc-field__control lc-type-label"
      type="text"
      autocomplete="off"
      :name="name"
      :value="model"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :aria-required="required ? 'true' : undefined"
      :aria-invalid="error ? 'true' : 'false'"
      :aria-describedby="describedBy"
      :role="suggestions.length ? 'combobox' : undefined"
      :aria-autocomplete="suggestions.length ? 'list' : undefined"
      :aria-expanded="suggestions.length ? (expanded ? 'true' : 'false') : undefined"
      :aria-controls="suggestions.length ? listId : undefined"
      :aria-activedescendant="expanded && active >= 0 ? optionId(active) : undefined"
      @input="onInput"
      @keydown="onKeydown"
      @focus="open = true"
      @blur="close"
    />
    <ul
      v-show="expanded"
      :id="listId"
      class="lc-field__options lc-type-nav"
      role="listbox"
      :aria-label="t('field.suggestions')"
    >
      <li
        v-for="(item, index) in filtered"
        :id="optionId(index)"
        :key="item"
        class="lc-field__option lc-verbatim"
        role="option"
        :aria-selected="index === active ? 'true' : 'false'"
        @mousedown.prevent="choose(item)"
      >
        {{ item }}
      </li>
    </ul>
    <p v-if="hint" :id="hintId" class="lc-field__hint lc-type-status">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="lc-field__error lc-type-status" aria-live="polite">
      {{ error }}
    </p>
  </div>
</template>

<style src="./field.css"></style>
