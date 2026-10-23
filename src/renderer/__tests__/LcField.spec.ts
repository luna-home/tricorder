import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, ref } from 'vue'

import LcField from '../components/LcField.vue'
import LcFieldArea from '../components/LcFieldArea.vue'
import { createAppI18n } from '../i18n'
import './helpers'

const global = { plugins: [createAppI18n('de')] }

function mountField(props: Record<string, unknown> = {}) {
  const value = ref('')
  const Host = defineComponent({
    components: { LcField },
    setup: () => ({ value, props }),
    template: '<LcField v-model="value" label="Projekt" v-bind="props" />',
  })
  const wrapper = mount(Host, { global, attachTo: document.body })
  return { wrapper, value, input: wrapper.find('input') }
}

describe('LcField', () => {
  it('binds the label to the input and supports v-model both ways', async () => {
    const { wrapper, value, input } = mountField()
    const label = wrapper.find('label')
    expect(label.text()).toBe('Projekt')
    expect(label.attributes('for')).toBe(input.attributes('id'))

    await input.setValue('tricorder')
    expect(value.value).toBe('tricorder')

    value.value = 'luna'
    await wrapper.vm.$nextTick()
    expect(input.element.value).toBe('luna')
  })

  it('marks required fields and announces errors', () => {
    const { wrapper, input } = mountField({ required: true, error: 'Pflichtfeld' })
    expect(wrapper.find('.lc-field__required').text()).toBe('Pflicht')
    expect(input.attributes('required')).toBeDefined()
    expect(input.attributes('aria-required')).toBe('true')
    expect(input.attributes('aria-invalid')).toBe('true')
    const error = wrapper.find('.lc-field__error')
    expect(error.text()).toBe('Pflichtfeld')
    expect(input.attributes('aria-describedby')).toBe(error.attributes('id'))
  })

  it('is valid and undescribed without an error', () => {
    const { wrapper, input } = mountField()
    expect(input.attributes('aria-invalid')).toBe('false')
    expect(input.attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.find('.lc-field__required').exists()).toBe(false)
  })

  it('describes the input with hint and error together', () => {
    const { wrapper, input } = mountField({ hint: 'Hinweis', error: 'Falsch' })
    const ids = [wrapper.find('.lc-field__error'), wrapper.find('.lc-field__hint')].map((el) =>
      el.attributes('id'),
    )
    expect(input.attributes('aria-describedby')?.split(' ').sort()).toEqual(ids.sort())
  })

  it('can be disabled', () => {
    const { input } = mountField({ disabled: true, placeholder: 'Projektname' })
    expect(input.attributes('disabled')).toBeDefined()
    expect(input.attributes('placeholder')).toBe('Projektname')
  })

  describe('with suggestions', () => {
    const suggestions = ['tricorder', 'luna-monitor', 'luna-design-system', 'kompas']

    it('is a combobox that filters while typing', async () => {
      const { wrapper, input } = mountField({ suggestions })
      expect(input.attributes('role')).toBe('combobox')
      expect(input.attributes('aria-expanded')).toBe('false')

      await input.trigger('focus')
      await input.setValue('LUNA')
      const options = wrapper.findAll('[role="option"]')
      expect(options.map((option) => option.text())).toEqual(['luna-monitor', 'luna-design-system'])
      expect(input.attributes('aria-expanded')).toBe('true')
      expect(wrapper.find('[role="listbox"]').attributes('id')).toBe(
        input.attributes('aria-controls'),
      )
    })

    it('moves with the arrow keys and takes the active option with Enter', async () => {
      const { wrapper, value, input } = mountField({ suggestions })
      await input.trigger('focus')
      await input.setValue('luna')

      await input.trigger('keydown', { key: 'ArrowDown' })
      await input.trigger('keydown', { key: 'ArrowDown' })
      const options = wrapper.findAll('[role="option"]')
      expect(options[1]?.attributes('aria-selected')).toBe('true')
      expect(input.attributes('aria-activedescendant')).toBe(options[1]?.attributes('id'))

      await input.trigger('keydown', { key: 'ArrowDown' })
      expect(wrapper.findAll('[role="option"]')[0]?.attributes('aria-selected')).toBe('true')
      await input.trigger('keydown', { key: 'ArrowUp' })
      expect(wrapper.findAll('[role="option"]')[1]?.attributes('aria-selected')).toBe('true')

      await input.trigger('keydown', { key: 'Enter' })
      expect(value.value).toBe('luna-design-system')
      expect(input.attributes('aria-expanded')).toBe('false')
    })

    it('closes with Escape and keeps free text', async () => {
      const { value, input } = mountField({ suggestions })
      await input.trigger('focus')
      await input.setValue('neues-projekt')
      expect(input.attributes('aria-expanded')).toBe('false')

      await input.setValue('k')
      expect(input.attributes('aria-expanded')).toBe('true')
      await input.trigger('keydown', { key: 'Escape' })
      expect(input.attributes('aria-expanded')).toBe('false')
      expect(value.value).toBe('k')
    })

    it('takes an option on pointer press and hides an exact match', async () => {
      const { wrapper, value, input } = mountField({ suggestions })
      await input.trigger('focus')
      await input.setValue('kom')
      await wrapper.find('[role="option"]').trigger('mousedown')
      expect(value.value).toBe('kompas')
      await input.trigger('focus')
      expect(wrapper.findAll('[role="option"]')).toHaveLength(0)
    })

    it('closes on blur', async () => {
      const { input } = mountField({ suggestions })
      await input.trigger('focus')
      expect(input.attributes('aria-expanded')).toBe('true')
      await input.trigger('blur')
      expect(input.attributes('aria-expanded')).toBe('false')
    })
  })
})

describe('LcFieldArea', () => {
  function mountArea(props: Record<string, unknown> = {}) {
    const value = ref('')
    const submitted = ref(0)
    const Host = defineComponent({
      components: { LcFieldArea },
      setup: () => ({ value, props, submitted }),
      template:
        '<LcFieldArea v-model="value" label="Stand" v-bind="props" @submit="submitted++" />',
    })
    const wrapper = mount(Host, { global })
    return { wrapper, value, submitted, area: wrapper.find('textarea') }
  }

  it('binds label, value and errors like LcField', async () => {
    const { wrapper, value, area } = mountArea({ required: true, error: 'Pflichtfeld', rows: 4 })
    expect(wrapper.find('label').attributes('for')).toBe(area.attributes('id'))
    expect(area.attributes('rows')).toBe('4')
    expect(area.attributes('aria-invalid')).toBe('true')
    expect(area.attributes('aria-describedby')).toBe(
      wrapper.find('.lc-field__error').attributes('id'),
    )
    await area.setValue('zeile 1\nzeile 2')
    expect(value.value).toBe('zeile 1\nzeile 2')
  })

  it('emits submit on Cmd/Ctrl+Enter only', async () => {
    const { submitted, area } = mountArea()
    await area.trigger('keydown', { key: 'Enter' })
    expect(submitted.value).toBe(0)
    await area.trigger('keydown', { key: 'Enter', metaKey: true })
    await area.trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(submitted.value).toBe(2)
  })
})
