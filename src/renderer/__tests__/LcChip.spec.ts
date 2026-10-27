import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LcChip from '../components/LcChip.vue'

/** jsdom has no layout: give the label the widths a browser would measure. */
function size(el: Element, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth })
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth })
}

describe('LcChip', () => {
  it('shows the full label as tooltip only when it is cut', async () => {
    const wrapper = mount(LcChip, {
      props: { label: 'Ein sehr langes Thema', hint: 'Cmd/Strg + 1' },
    })
    const label = wrapper.find('.lc-chip__label').element

    size(label, 80, 80)
    await wrapper.trigger('pointerenter')
    expect(wrapper.attributes('title')).toBe('Cmd/Strg + 1')

    size(label, 200, 120)
    await wrapper.trigger('focus')
    expect(wrapper.attributes('title')).toBe('Ein sehr langes Thema · Cmd/Strg + 1')
  })

  it('has no tooltip for a label that fits and no hint', async () => {
    const wrapper = mount(LcChip, { props: { label: 'Luna' } })
    size(wrapper.find('.lc-chip__label').element, 30, 30)
    await wrapper.trigger('pointerenter')
    expect(wrapper.attributes('title')).toBeUndefined()
  })

  it('is a toggle only with `pressed`, and marks the current page', () => {
    expect(mount(LcChip, { props: { label: 'A' } }).attributes('aria-pressed')).toBeUndefined()
    const toggle = mount(LcChip, { props: { label: 'A', color: 'inactive', pressed: false } })
    expect(toggle.attributes('aria-pressed')).toBe('false')
    expect(toggle.classes()).toContain('lc-bg-inactive')
    const current = mount(LcChip, { props: { label: 'A', current: true } })
    expect(current.attributes('aria-current')).toBe('page')
  })
})
