import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import {
  Failure,
  installBridge,
  mountApp,
  serviceInfos,
  settle,
  type Handler,
} from '@renderer/__tests__/helpers'

import type { LogbuchEntry } from '../../contract'

let nextId = 1
function entry(overrides: Partial<LogbuchEntry> = {}): LogbuchEntry {
  return {
    id: nextId++,
    ts: '2026-10-21T22:52:00+02:00',
    project: 'tricorder',
    topic: 'Electron-Client',
    kind: 'entry',
    status: 'Gerüst steht',
    nextStep: 'Views bauen',
    openQuestions: null,
    refs: 'docs/plan.md',
    source: 'claude',
    sessionId: null,
    cwd: null,
    ...overrides,
  }
}

const projects = [
  { project: 'tricorder', openTopics: 2, lastTs: '2026-10-21T22:52:00+02:00' },
  { project: 'kompas', openTopics: 1, lastTs: '2026-10-20T10:00:00+02:00' },
  { project: 'alt', openTopics: 0, lastTs: '2026-01-01T10:00:00+01:00' },
]

function bridge(handlers: Record<string, Handler> = {}) {
  return installBridge({
    handlers: {
      'logbuch.projects': () => projects,
      'logbuch.openTopics': () => [],
      'logbuch.topics': () => [],
      'logbuch.history': () => [],
      'logbuch.pins': () => [],
      ...handlers,
    },
  })
}

function button(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((item) => item.text() === text)
  if (!found) throw new Error(`no button "${text}"`)
  return found
}

function calls(mock: ReturnType<typeof installBridge>, method: string) {
  return mock.invoke.mock.calls.filter(([, name]) => name === method).map(([, , args]) => args)
}

describe('WO WAR ICH', () => {
  it('lists open topics with project, topic, time and fields', async () => {
    const mock = bridge({
      'logbuch.openTopics': () => [
        entry({ topic: 'Electron-Client', openQuestions: 'Tray-Icon?' }),
        entry({ project: 'kompas', topic: 'BAT KW43', status: 'Import läuft', refs: null }),
      ],
    })
    const { wrapper } = await mountApp('/logbuch')

    expect(calls(mock, 'openTopics')).toEqual([{ all: true }])
    expect(wrapper.find('.page-head').text()).toContain('Wo war ich')
    expect(wrapper.find('.page-head').text()).toContain('002')

    const topics = wrapper.findAll('.topic')
    expect(topics).toHaveLength(2)
    const first = topics[0]!
    expect(first.find('.topic__project').text()).toBe('tricorder')
    expect(first.find('.topic__name').text()).toBe('Electron-Client')
    expect(first.find('time').text()).toBe('Mi 21.10.2026 · 22:52')
    expect(first.find('.lc-timestamp__stardate').text()).toBe('Sternzeit 2026.805')
    const fields = first.findAll('dt').map((dt) => dt.text())
    expect(fields).toEqual(['Stand', 'Weiter', 'Offen', 'Bezug'])
    expect(first.findAll('dd').map((dd) => dd.text())).toEqual([
      'Gerüst steht',
      'Views bauen',
      'Tray-Icon?',
      'docs/plan.md',
    ])
    expect(topics[1]!.findAll('dt').map((dt) => dt.text())).toEqual(['Stand', 'Weiter'])
  })

  it('reads like a protocol: Spiegelstriche, Weiter indented under Stand', async () => {
    bridge({
      'logbuch.openTopics': () => [
        entry({ status: '- Gerüst steht\n- Tests grün', nextStep: '- Views bauen' }),
      ],
    })
    const { wrapper } = await mountApp('/logbuch')

    expect(wrapper.find('.logbuch-page').attributes('data-lc-density')).toBe('log')
    const rows = wrapper.findAll('.entry-fields__row')
    expect(rows[0]!.findAll('li').map((li) => li.text())).toEqual(['Gerüst steht', 'Tests grün'])
    const indented = wrapper.findAll('.entry-fields__row--indent')
    expect(indented.map((row) => row.find('dt').text())).toEqual(['Weiter'])
    expect(indented[0]!.find('li').text()).toBe('Views bauen')
  })

  it('filters by project with option pills and keeps the filter in the URL', async () => {
    const mock = bridge({ 'logbuch.openTopics': () => [entry()] })
    const { wrapper, router } = await mountApp('/logbuch')

    const filter = () => wrapper.find('[role="group"]').findAll('.lc-chip')
    const pills = filter()
    expect(pills.map((pill) => pill.text())).toEqual(['Alle', 'tricorder', 'kompas'])
    expect(pills[0]!.attributes('aria-pressed')).toBe('true')

    await pills[2]!.trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ project: 'kompas' })
    expect(calls(mock, 'openTopics').at(-1)).toEqual({ project: 'kompas', all: true })
    expect(filter()[2]!.attributes('aria-pressed')).toBe('true')

    await filter()[0]!.trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('opens the history of a topic', async () => {
    bridge({ 'logbuch.openTopics': () => [entry()] })
    const { wrapper, router } = await mountApp('/logbuch')
    await wrapper.find('.topic').trigger('click')
    await settle()
    expect(router.currentRoute.value.name).toBe('logbuch.history')
    expect(router.currentRoute.value.params).toEqual({
      project: 'tricorder',
      topic: 'Electron-Client',
    })
  })

  it('refreshes live when the service reports a change', async () => {
    let rows = [entry()]
    const mock = bridge({ 'logbuch.openTopics': () => rows })
    const { wrapper } = await mountApp('/logbuch')
    expect(wrapper.findAll('.topic')).toHaveLength(1)

    rows = [entry({ topic: 'Neu von der CLI' }), ...rows]
    mock.emit('logbuch', 'changed')
    await settle()
    expect(wrapper.findAll('.topic').map((topic) => topic.find('.topic__name').text())).toEqual([
      'Neu von der CLI',
      'Electron-Client',
    ])
  })

  it('shows an empty state', async () => {
    bridge({ 'logbuch.projects': () => [] })
    const { wrapper } = await mountApp('/logbuch')
    expect(wrapper.text()).toContain('Keine offenen Themen')
    expect(wrapper.find('[role="group"]').exists()).toBe(false)
  })

  it('shows a failed request', async () => {
    bridge({ 'logbuch.openTopics': () => new Failure('failed', 'database is locked') })
    const { wrapper } = await mountApp('/logbuch')
    const alert = wrapper.find('[role="alert"]')
    expect(alert.find('.lc-text-red').text()).toBe(
      'Abfrage fehlgeschlagen · Dienst meldet einen Fehler',
    )
    expect(alert.find('.lc-verbatim').text()).toBe('database is locked')
  })

  it('starts a new entry with the current project filter', async () => {
    bridge()
    const { wrapper, router } = await mountApp('/logbuch?project=kompas')
    await button(wrapper, 'Neuer Eintrag').trigger('click')
    await settle()
    expect(router.currentRoute.value.name).toBe('logbuch.new')
    expect(router.currentRoute.value.query).toEqual({ project: 'kompas' })
  })
})

describe('pins', () => {
  const pins = [
    { position: 1, project: 'tricorder', topic: 'Electron-Client' },
    { position: 3, project: 'kompas', topic: 'BAT KW43' },
  ]

  it('shows the pin row, lists pinned topics first and jumps with Cmd/Ctrl+n', async () => {
    bridge({
      'logbuch.pins': () => pins,
      'logbuch.openTopics': () => [
        entry({ project: 'luna', topic: 'Neu' }),
        entry({ project: 'kompas', topic: 'BAT KW43' }),
        entry({ topic: 'Electron-Client' }),
      ],
    })
    const { wrapper, router } = await mountApp('/logbuch')

    const row = wrapper.find('nav[aria-label="Angeheftete Themen"]')
    expect(row.attributes('aria-label')).toBe('Angeheftete Themen')
    expect(row.findAll('button').map((item) => item.text())).toEqual([
      '1 Electron-Client',
      '3 BAT KW43',
    ])
    expect(wrapper.findAll('.topic__name').map((name) => name.text())).toEqual([
      'Electron-Client',
      'BAT KW43',
      'Neu',
    ])
    expect(wrapper.findAll('.topic__pin').map((badge) => badge.text())).toEqual(['1', '3'])

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', metaKey: true }))
    await settle()
    expect(router.currentRoute.value.params).toEqual({ project: 'kompas', topic: 'BAT KW43' })
    expect(wrapper.find('nav[aria-label="Angeheftete Themen"] [aria-current="page"]').text()).toBe(
      '3 BAT KW43',
    )

    // An empty slot or a key without the modifier does nothing.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
    await settle()
    expect(router.currentRoute.value.params).toEqual({ project: 'kompas', topic: 'BAT KW43' })
  })

  it('pins and unpins from the topic page', async () => {
    let current: typeof pins = []
    const mock = bridge({
      'logbuch.history': () => [entry()],
      'logbuch.pins': () => current,
      'logbuch.pin': () => {
        current = [pins[0]!]
        return pins[0]
      },
      'logbuch.unpin': () => {
        current = []
      },
    })
    const { wrapper } = await mountApp('/logbuch/tricorder/electron-client')
    expect(wrapper.find('nav[aria-label="Angeheftete Themen"]').exists()).toBe(false)

    await button(wrapper, 'Anheften').trigger('click')
    await settle()
    expect(calls(mock, 'pin')).toEqual([{ project: 'tricorder', topic: 'Electron-Client' }])
    expect(wrapper.find('.page-head').text()).toContain('Cmd/Strg + 1')
    expect(wrapper.find('nav[aria-label="Angeheftete Themen"] [aria-current="page"]').text()).toBe(
      '1 Electron-Client',
    )

    await button(wrapper, 'Lösen').trigger('click')
    await settle()
    expect(calls(mock, 'unpin')).toEqual([{ project: 'tricorder', topic: 'Electron-Client' }])
    expect(button(wrapper, 'Anheften').exists()).toBe(true)
  })

  it('says when all four slots are taken instead of calling pin', async () => {
    const full = [1, 2, 3, 4].map((position) => ({ position, project: 'x', topic: `T${position}` }))
    const mock = bridge({ 'logbuch.history': () => [entry()], 'logbuch.pins': () => full })
    const { wrapper } = await mountApp('/logbuch/tricorder/electron-client')
    await button(wrapper, 'Anheften').trigger('click')
    await settle()
    expect(calls(mock, 'pin')).toEqual([])
    expect(wrapper.find('[role="status"]').text()).toBe(
      'Alle 4 Plätze belegt: erst ein Thema lösen',
    )
  })
})

describe('THEMA', () => {
  const rows = [
    entry({ ts: '2026-10-19T09:00:00+02:00', status: 'Angefangen', source: 'manual' }),
    entry({
      ts: '2026-10-20T09:00:00+02:00',
      status: '- Zweiter Schritt\n- mehr',
      source: 'manual',
    }),
    entry({ ts: '2026-10-21T22:52:00+02:00', status: 'Gerüst steht', source: 'session-end' }),
  ]

  it('shows the newest entry in full and older ones as lines, newest first', async () => {
    const mock = bridge({ 'logbuch.history': () => rows })
    const { wrapper } = await mountApp('/logbuch/tricorder/electron-client')

    expect(calls(mock, 'history')).toEqual([{ project: 'tricorder', topic: 'electron-client' }])
    // The heading uses the stored spelling.
    expect(wrapper.find('.page-head').text()).toContain('Electron-Client')
    expect(wrapper.find('.page-head').text()).toContain('003')
    const current = wrapper.find('.current')
    expect(current.find('time').text()).toBe('Mi 21.10.2026 · 22:52')
    expect(current.find('.entry__meta').text()).toContain('Sitzungsende')
    expect(current.findAll('dt').map((dt) => dt.text())).toEqual(['Stand', 'Weiter', 'Bezug'])
    expect(current.find('dd').text()).toBe('Gerüst steht')

    const items = wrapper.findAll('.entry')
    expect(items.map((item) => item.find('time').text())).toEqual([
      'Di 20.10.2026 · 09:00',
      'Mo 19.10.2026 · 09:00',
    ])
    expect(items.map((item) => item.find('.entry__line').text())).toEqual([
      'Zweiter Schritt',
      'Angefangen',
    ])
    expect(items[0]!.find('details').attributes('open')).toBeUndefined()
    expect(items[0]!.find('.entry__body').text()).toContain('Manuell')
    expect(wrapper.find('.entry__done').exists()).toBe(false)
    expect(button(wrapper, 'Abschließen').exists()).toBe(true)
  })

  it('marks a finished topic and offers no second finish', async () => {
    bridge({
      'logbuch.history': () => [
        ...rows,
        entry({ kind: 'done', status: 'Läuft', nextStep: null, refs: null, source: 'manual' }),
      ],
    })
    const { wrapper } = await mountApp('/logbuch/tricorder/Electron-Client')
    const current = wrapper.find('.current')
    expect(current.find('.entry__done').text()).toBe('Abgeschlossen')
    expect(current.findAll('dt').map((dt) => dt.text())).toEqual(['Notiz'])
    expect(wrapper.text()).toContain('Thema abgeschlossen')
    expect(wrapper.findAll('button').some((item) => item.text() === 'Abschließen')).toBe(false)
  })

  it('continues the topic with + Stand and leads to finishing', async () => {
    bridge({ 'logbuch.history': () => rows })
    const { wrapper, router } = await mountApp('/logbuch/tricorder/electron-client')
    await button(wrapper, '+ Stand').trigger('click')
    await settle()
    expect(router.currentRoute.value.name).toBe('logbuch.new')
    expect(router.currentRoute.value.query).toEqual({
      project: 'tricorder',
      topic: 'Electron-Client',
    })

    await router.push('/logbuch/tricorder/electron-client')
    await settle()
    await button(wrapper, 'Abschließen').trigger('click')
    await settle()
    expect(router.currentRoute.value.name).toBe('logbuch.done')
  })

  it('says when a topic does not exist', async () => {
    bridge()
    const { wrapper } = await mountApp('/logbuch/tricorder/gibt-es-nicht')
    expect(wrapper.text()).toContain('Thema nicht gefunden')
  })
})

describe('NEUER EINTRAG', () => {
  const field = (wrapper: VueWrapper, name: string) =>
    wrapper.find<HTMLInputElement>(`[name="${name}"]`)

  it('prefills project and topic from the query', async () => {
    bridge()
    const { wrapper } = await mountApp('/logbuch/neu?project=tricorder&topic=Electron-Client')
    expect(field(wrapper, 'project').element.value).toBe('tricorder')
    expect(field(wrapper, 'topic').element.value).toBe('Electron-Client')
  })

  it('continues a topic: the newest entry prefills the notes', async () => {
    const mock = bridge({
      'logbuch.history': () => [
        entry({ status: '- eins\n- zwei', nextStep: '- drei', openQuestions: null }),
      ],
    })
    const { wrapper } = await mountApp('/logbuch/neu?project=tricorder&topic=Electron-Client')
    await settle()
    expect(calls(mock, 'history')).toEqual([
      { project: 'tricorder', topic: 'Electron-Client', limit: 1 },
    ])
    expect(wrapper.find('.page-head').text()).toContain('Electron-Client')
    expect(field(wrapper, 'status').element.value).toBe('- eins\n- zwei')
    expect(field(wrapper, 'nextStep').element.value).toBe('- drei')
    expect(field(wrapper, 'openQuestions').element.value).toBe('')
    expect(field(wrapper, 'refs').element.value).toBe('docs/plan.md')
  })

  it('does not carry over a finished topic or a blank form', async () => {
    const mock = bridge({ 'logbuch.history': () => [entry({ kind: 'done', status: 'Fertig' })] })
    const { wrapper } = await mountApp('/logbuch/neu?project=tricorder&topic=Electron-Client')
    await settle()
    expect(field(wrapper, 'status').element.value).toBe('')

    const blank = await mountApp('/logbuch/neu?project=tricorder')
    await settle()
    expect(field(blank.wrapper, 'status').element.value).toBe('')
    expect(calls(mock, 'history')).toHaveLength(1)
  })

  it('starts over when a blank form follows a prefilled one', async () => {
    bridge()
    const { wrapper, router } = await mountApp('/logbuch/neu?project=luna&topic=X')
    await field(wrapper, 'status').setValue('halb getippt')
    await router.push('/logbuch/neu')
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/logbuch/neu')
    for (const name of ['project', 'topic', 'status']) {
      expect(field(wrapper, name).element.value).toBe('')
    }
    await button(wrapper, 'Abbrechen').trigger('click')
    await settle()
    expect(router.currentRoute.value.name).toBe('logbuch')
  })

  it('takes over a new prefill when only the query changes', async () => {
    bridge()
    const { wrapper, router } = await mountApp('/logbuch/neu?project=a&topic=x')
    await router.push('/logbuch/neu?project=b&topic=y')
    await settle()
    expect(field(wrapper, 'project').element.value).toBe('b')
    expect(field(wrapper, 'topic').element.value).toBe('y')
    await button(wrapper, 'Abbrechen').trigger('click')
    await settle()
    expect(router.currentRoute.value.path).toBe('/logbuch/b/y')
  })

  it('suggests projects and the topics of a known project', async () => {
    const mock = bridge({
      'logbuch.topics': () => [
        { topic: 'Electron-Client', open: true, lastTs: 'x' },
        { topic: 'Logbuch-CLI', open: false, lastTs: 'y' },
      ],
    })
    const { wrapper } = await mountApp('/logbuch/neu')
    const project = field(wrapper, 'project')
    await project.trigger('focus')
    await project.setValue('k')
    expect(wrapper.findAll('[role="option"]').map((option) => option.text())).toEqual(['kompas'])

    await project.setValue('tricorder')
    await settle()
    expect(calls(mock, 'topics')).toEqual([{ project: 'tricorder' }])
    const topic = field(wrapper, 'topic')
    await topic.trigger('focus')
    expect(wrapper.findAll('[role="option"]').map((option) => option.text())).toEqual([
      'Electron-Client',
      'Logbuch-CLI',
    ])
  })

  it('validates with the contract schema and shows errors in the fields', async () => {
    const mock = bridge()
    const { wrapper } = await mountApp('/logbuch/neu')
    await field(wrapper, 'topic').setValue('   ')
    await button(wrapper, 'Speichern').trigger('click')
    await settle()

    for (const name of ['project', 'topic', 'status']) {
      const control = field(wrapper, name)
      expect(control.attributes('aria-invalid')).toBe('true')
      const describedBy = control.attributes('aria-describedby')!.split(' ')
      const texts = describedBy.map((id) => wrapper.find(`[id="${id}"]`).text())
      expect(texts).toContain('Pflichtfeld')
    }
    expect(field(wrapper, 'nextStep').attributes('aria-invalid')).toBe('false')
    expect(calls(mock, 'addEntry')).toEqual([])
    expect(document.activeElement).toBe(field(wrapper, 'project').element)

    await field(wrapper, 'project').setValue('tricorder')
    expect(field(wrapper, 'project').attributes('aria-invalid')).toBe('false')
  })

  it('saves and opens the history in the stored spelling', async () => {
    const saved = entry({ topic: 'Electron-Client', source: 'manual' })
    const mock = bridge({
      'logbuch.addEntry': () => ({ project: 'tricorder', topic: 'Electron-Client', entry: saved }),
      'logbuch.history': () => [saved],
    })
    const { wrapper, router } = await mountApp('/logbuch/neu')
    await field(wrapper, 'project').setValue(' tricorder ')
    await field(wrapper, 'topic').setValue('electron-client')
    await field(wrapper, 'status').setValue('Views fertig')
    await field(wrapper, 'nextStep').setValue('  ')
    await field(wrapper, 'refs').setValue('PR #1')
    await button(wrapper, 'Speichern').trigger('click')
    await settle()

    expect(calls(mock, 'addEntry')).toEqual([
      { project: 'tricorder', topic: 'electron-client', status: 'Views fertig', refs: 'PR #1' },
    ])
    expect(router.currentRoute.value.name).toBe('logbuch.history')
    expect(router.currentRoute.value.params).toEqual({
      project: 'tricorder',
      topic: 'Electron-Client',
    })
  })

  it('saves with Cmd+Enter from the status field', async () => {
    const mock = bridge({
      'logbuch.addEntry': () => ({ project: 'p', topic: 't', entry: entry() }),
    })
    const { wrapper } = await mountApp('/logbuch/neu?project=p&topic=t')
    await field(wrapper, 'status').setValue('x')
    await field(wrapper, 'status').trigger('keydown', { key: 'Enter', metaKey: true })
    await settle()
    expect(calls(mock, 'addEntry')).toHaveLength(1)
  })

  it('shows a failed save and stays on the form', async () => {
    bridge({ 'logbuch.addEntry': () => new Failure('failed', 'database is locked') })
    const { wrapper, router } = await mountApp('/logbuch/neu?project=p&topic=t')
    await field(wrapper, 'status').setValue('x')
    await button(wrapper, 'Speichern').trigger('click')
    await settle()
    expect(wrapper.find('[role="alert"]').text()).toContain('database is locked')
    expect(router.currentRoute.value.name).toBe('logbuch.new')
  })

  it('cancels back to the topic, or to the list without one', async () => {
    bridge()
    const prefilled = await mountApp('/logbuch/neu?project=p&topic=t')
    await button(prefilled.wrapper, 'Abbrechen').trigger('click')
    await settle()
    expect(prefilled.router.currentRoute.value.path).toBe('/logbuch/p/t')
    prefilled.wrapper.unmount()

    const blank = await mountApp('/logbuch/neu')
    await button(blank.wrapper, 'Abbrechen').trigger('click')
    await settle()
    expect(blank.router.currentRoute.value.name).toBe('logbuch')
  })
})

describe('ABSCHLIESSEN', () => {
  const done = () => ({
    project: 'tricorder',
    topic: 'Electron-Client',
    entry: entry({ kind: 'done' }),
  })

  it('needs two taps: armed, then confirmed', async () => {
    const mock = bridge({ 'logbuch.history': () => [entry()], 'logbuch.done': done })
    const { wrapper, router } = await mountApp('/logbuch/tricorder/Electron-Client/abschliessen')
    expect(wrapper.text()).toContain('Letzter Stand')
    await wrapper.find('textarea[name="note"]').setValue('Läuft')

    const tile = () => wrapper.findAll('.lc-tile')[0]!
    expect(tile().attributes('data-armed')).toBe('false')
    await tile().trigger('click')
    expect(tile().attributes('data-armed')).toBe('true')
    expect(tile().text()).toContain('Bestätigen?')
    expect(calls(mock, 'done')).toEqual([])

    await tile().trigger('click')
    await settle()
    expect(calls(mock, 'done')).toEqual([
      { project: 'tricorder', topic: 'Electron-Client', note: 'Läuft' },
    ])
    expect(router.currentRoute.value.name).toBe('logbuch')
  })

  it('disarms by itself when the second tap does not come', async () => {
    const mock = bridge({ 'logbuch.done': done })
    const { wrapper } = await mountApp('/logbuch/tricorder/Electron-Client/abschliessen')
    vi.useFakeTimers()
    try {
      await wrapper.findAll('.lc-tile')[0]!.trigger('click')
      expect(wrapper.findAll('.lc-tile')[0]!.attributes('data-armed')).toBe('true')
      await vi.advanceTimersByTimeAsync(5000)
      expect(wrapper.findAll('.lc-tile')[0]!.attributes('data-armed')).toBe('false')
      expect(calls(mock, 'done')).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels back to the history', async () => {
    bridge()
    const { wrapper, router } = await mountApp('/logbuch/tricorder/Electron-Client/abschliessen')
    await wrapper.findAll('.lc-tile')[1]!.trigger('click')
    await settle()
    expect(router.currentRoute.value.name).toBe('logbuch.history')
  })
})

describe('unconfigured logbuch', () => {
  it('shows the looked-up path and saves a new one in the settings', async () => {
    const mock = installBridge({
      services: serviceInfos('unconfigured', { code: 'dbMissing', detail: '/x.db' }),
      handlers: {
        'logbuch.dbInfo': () => ({
          path: 'C:\\Users\\patrick\\.logbuch\\logbuch.db',
          pathSource: 'default',
          exists: false,
          entries: 0,
        }),
      },
    })
    const { wrapper } = await mountApp('/logbuch')
    expect(wrapper.find('.lc-panel').classes()).toContain('lc-yellow-alert')
    expect(wrapper.find('.lc-notice__title').text()).toBe('Logbuch nicht gefunden')
    expect(wrapper.text()).toContain('Gesuchter Pfad · Standardpfad')
    expect(wrapper.text()).toContain('C:\\Users\\patrick\\.logbuch\\logbuch.db')

    const input = wrapper.find('input')
    await input.setValue('  /Volumes/data/logbuch.db ')
    await button(wrapper, 'Pfad speichern').trigger('click')
    await settle()
    expect(mock.settingsSet).toHaveBeenCalledWith('logbuch', { dbPath: '/Volumes/data/logbuch.db' })

    await button(wrapper, 'Standardpfad').trigger('click')
    await settle()
    expect(mock.settingsSet).toHaveBeenLastCalledWith('logbuch', { dbPath: null })
  })

  it('points at LOGBUCH_DB when the env variable decides the path', async () => {
    installBridge({
      services: serviceInfos('unconfigured'),
      handlers: {
        'logbuch.dbInfo': () => ({
          path: '/tmp/x.db',
          pathSource: 'env',
          exists: false,
          entries: 0,
        }),
      },
    })
    const { wrapper } = await mountApp('/logbuch')
    expect(wrapper.text()).toContain('LOGBUCH_DB zeigt auf eine fehlende Datei')
  })

  it('shows a rejected path', async () => {
    const mock = installBridge({
      services: serviceInfos('unconfigured'),
      handlers: {
        'logbuch.dbInfo': () => ({
          path: '/x.db',
          pathSource: 'default',
          exists: false,
          entries: 0,
        }),
      },
    })
    mock.settingsSet.mockResolvedValueOnce({
      ok: false,
      error: { code: 'invalid-input', message: 'dbPath: too short' },
    })
    const { wrapper } = await mountApp('/logbuch')
    await button(wrapper, 'Pfad speichern').trigger('click')
    await settle()
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Pfad nicht gespeichert: Absoluten Pfad oder ~/… angeben')
  })
})
