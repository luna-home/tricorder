<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 0-100. */
    value: number
    segments?: number
    /** Index from which lit segments turn red (luna-monitor volume: 20). */
    dangerFrom?: number
    muted?: boolean
    label?: string
  }>(),
  { segments: 25, dangerFrom: undefined, muted: false, label: 'Level' },
)

const emit = defineEmits<{
  /** Pointer down or moved while pressed: the value under the pointer. */
  drag: [value: number]
  /** Pointer released, cancelled or arrow key: the final value. */
  release: [value: number]
}>()

const bar = useTemplateRef<HTMLDivElement>('bar')
const pressed = ref(false)

const lit = computed(() => Math.round((props.value / 100) * props.segments))

function segmentClass(i: number): string {
  if (i >= lit.value) return ''
  return props.dangerFrom !== undefined && i >= props.dangerFrom ? 'is-danger' : 'is-lit'
}

function valueAt(event: PointerEvent): number {
  const rect = bar.value!.getBoundingClientRect()
  return Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * 100)
}

function onDown(event: PointerEvent) {
  bar.value!.setPointerCapture?.(event.pointerId)
  pressed.value = true
  emit('drag', valueAt(event))
}

function onMove(event: PointerEvent) {
  if (pressed.value) emit('drag', valueAt(event))
}

function onUp(event: PointerEvent) {
  if (!pressed.value) return
  pressed.value = false
  emit('release', valueAt(event))
}

function onCancel() {
  if (!pressed.value) return
  pressed.value = false
  emit('release', props.value)
}

function onKey(event: KeyboardEvent) {
  const step = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 4 : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -4 : 0
  if (!step) return
  event.preventDefault()
  emit('release', Math.min(100, Math.max(0, props.value + step)))
}
</script>

<template>
  <div
    ref="bar"
    class="lc-segments"
    role="slider"
    tabindex="0"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="value"
    :aria-label="label"
    :data-muted="muted ? 'true' : 'false'"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onCancel"
    @keydown="onKey"
  >
    <i v-for="i in segments" :key="i" :class="segmentClass(i - 1)" />
  </div>
</template>
