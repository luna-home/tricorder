import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LcNoteText from '../components/LcNoteText.vue'
import { continueList, parseNote } from '../components/note'

describe('parseNote', () => {
  it('turns "- " lines into lists and other lines into paragraphs', () => {
    expect(parseNote('Kopfzeile\n- eins\n* zwei\n\n• drei\nSchluss')).toEqual([
      { kind: 'paragraph', text: 'Kopfzeile' },
      { kind: 'list', items: ['eins', 'zwei', 'drei'] },
      { kind: 'paragraph', text: 'Schluss' },
    ])
  })

  it('keeps plain one-line entries as they were', () => {
    expect(parseNote('Gerüst steht')).toEqual([{ kind: 'paragraph', text: 'Gerüst steht' }])
    expect(parseNote('-5 Grad, kein Strich')).toEqual([
      { kind: 'paragraph', text: '-5 Grad, kein Strich' },
    ])
  })

  it('drops empty items and blank lines', () => {
    expect(parseNote('- \n\r\n- a\r\n')).toEqual([{ kind: 'list', items: ['a'] }])
  })
})

describe('continueList', () => {
  it('continues with the same indent and marker', () => {
    const value = '  * a'
    expect(continueList(value, value.length, value.length)).toEqual({
      value: '  * a\n  * ',
      caret: 10,
    })
  })

  it('splits an item at the caret', () => {
    expect(continueList('- abcd', 4, 4)).toEqual({ value: '- ab\n- cd', caret: 7 })
  })

  it('ends the list on an empty item', () => {
    expect(continueList('- a\n- ', 6, 6)).toEqual({ value: '- a\n', caret: 4 })
  })

  it('leaves plain lines alone', () => {
    expect(continueList('Absatz', 6, 6)).toBeUndefined()
    expect(continueList('- a\nAbsatz', 10, 10)).toBeUndefined()
  })
})

describe('LcNoteText', () => {
  it('renders lists and paragraphs in their own case', () => {
    const wrapper = mount(LcNoteText, { props: { text: 'Vorab\n- Erster Punkt\n- zweiter' } })
    expect(wrapper.find('.lc-note').classes()).toContain('lc-verbatim')
    expect(wrapper.find('p').text()).toBe('Vorab')
    expect(wrapper.findAll('li').map((li) => li.text())).toEqual(['Erster Punkt', 'zweiter'])
  })
})
