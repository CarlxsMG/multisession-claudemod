import { expect } from 'claude-code/testing'
import type { AgentInfo, On, TurnCompleteInput } from 'claude-code'
import { NAME_COLORS, W } from '../src/figure/catalog'
import { DIAMOND_ROWS, DIAMOND_W } from '../src/figure/diamond'
import { DEFAULT_LOOK, defaultLook } from '../src/figure/look'
import { enVibes as VIBES_EN } from '../src/i18n/en-vibes'
import { VIBES, vibeOf } from '../src/persona/vibes'
import { JUST_ENDED_MS } from '../src/progress/runs'
import { AWAY_MS, DELEGATE, PANE, cellText, crewCommand, doneCrew, engine, freeCrew, napCrew, switchTo, test, workerSend } from './support/crew'

test(
  'a worker that left the row at its napAfter is still in the team view and the roster, and comes back when woken',
  { options: { napAfter: '30s' } },
  async ($, on) => {
    const { clock, states, roster, ui, card } = await freeCrew($, on)
    await clock.advance(30_000)
    expect(await card('agent-1')).toBeUndefined()
    expect(await roster()).toMatch(/^- Pip: address "pip", idle, /m)
    await crewCommand($, 'team')
    expect(await card('agent-1')).toBeDefined()
    await ui.press({ key: 'crew-back' })

    const given = await $.tool.call({ tool: DELEGATE, task: 'Fix the flaky test', repo: '/work/r1' })
    expect(String(given.result)).toMatch(/^Given to Pip /)
    states.set('agent-1', 'running')
    expect(await card('agent-1')).toBeDefined()
    await ui.unmount()
  },
)

test('the figures are cells on the terminal and SVG on the desktop, the editor and the phone', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Run the tests', repo: '/work/api' })

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await terminal.find({ type: 'Raster', key: 'orch' })).toBeDefined()
  expect(await terminal.find({ type: 'Raster', key: 'w-agent-1' })).toBeDefined()
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  await terminal.unmount()

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const figures = await ui.findAll({ type: 'Svg' })
    expect(figures).toHaveLength(2)
    expect(String(figures[0]?.props.source)).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(figures.map(f => f.props.alt)).toEqual(['Nova, the orchestrator', 'Pip: starting'])
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    await ui.unmount()
  }
})

test('the top line names the model the main session runs, and follows it when it changes', async ($, on) => {
  let model = 'claude-opus-5-5[1m]'
  engine(on, { rateLimits: [], stored: {}, host: { model: () => model } })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('classic.PostModelSwitch', () => ({}))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 46 } })
  const top = async () => (await ui.find({ type: 'Text', text: /^Nova · / }))?.text
  try {
    expect(await top()).toBe('Nova · Cheerful · Opus 5.5')
    // /model: the switch names the model it went to.
    model = 'claude-sonnet-5-5'
    await $.classic.PostModelSwitch(switchTo(model))
    expect(await top()).toBe('Nova · Cheerful · Sonnet 5.5')
    // The settings changed it: the next turn of the main session reads it.
    model = 'claude-fable-5-1'
    await $.turn.start({ text: 'hola', turnId: 't1' })
    expect(await top()).toBe('Nova · Cheerful · Fable 5.1')
    // A worker's turn does not ask.
    model = 'claude-haiku-4-5'
    await $.turn.start({ text: 'go', turnId: 't2', agentId: 'agent-9' })
    expect(await top()).toBe('Nova · Cheerful · Fable 5.1')
    // A cloud's ids, an older one, and one that does not read as a model's.
    for (const [id, shown] of [
      ['us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'Sonnet 4.5'],
      ['claude-haiku-4-5@20251001', 'Haiku 4.5'],
      ['claude-3-5-sonnet-20241022', 'Sonnet 3.5'],
      ['claude-sonnet-4-20250514', 'Sonnet 4'],
      ['my-gateway/large', 'my-gateway/large'],
    ] as const) {
      await $.classic.PostModelSwitch(switchTo(id))
      expect(await top()).toBe(`Nova · Cheerful · ${shown}`)
    }
  } finally {
    await ui.unmount()
  }
})

test('the top line fits its width: the model is cut first, then left out, and the name stays whole', async ($, on) => {
  const name = 'Maximiliana Rosa'
  const label = (vibe: string) => vibeOf({ vibe }).label
  const vibe = Object.keys(VIBES).reduce((a, b) => (label(b).length > label(a).length ? b : a))
  const persona = label(vibe)
  engine(on, { rateLimits: [], stored: { look: { ...DEFAULT_LOOK, name, vibe } } })
  on('classic.PostModelSwitch', () => ({}))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const head = `${name} · ${persona}`
  for (const id of ['claude-sonnet-5-5', 'an-unknown-gateway-model-with-a-long-name']) {
    await $.classic.PostModelSwitch(switchTo(id))
    // Down to the name and personality alone, the narrowest they show whole.
    for (const bodyColumns of [56, 46, 40, 34, 30, head.length]) {
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns } })
      const text = (await ui.find({ type: 'Text', text: new RegExp(`^${name} · `) }))?.text ?? ''
      await ui.unmount()
      expect(text.length).toBeLessThanOrEqual(bodyColumns)
      expect(text.startsWith(head)).toBe(true)
      const shown = text.slice(head.length)
      if (id === 'claude-sonnet-5-5' && bodyColumns >= 46) expect(shown).toBe(' · Sonnet 5.5')
      if (shown !== '') expect(shown).toMatch(/^ · /)
      if (shown.endsWith('…')) expect(text.length).toBe(bodyColumns)
    }
  }
  // In the dock's 46 columns the long one is cut to what is left.
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 46 } })
  expect((await ui.find({ type: 'Text', text: new RegExp(`^${name} · `) }))?.text).toBe(`${head} · an-unknown-gate…`)
  await ui.unmount()
})

test('a long command takes two lines beside the orchestrator', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'Bash',
    command: 'cd /work/api && npm run test -- --coverage --reporter=verbose --bail --watch=false',
  })
  await clock.advance(400)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const first = await ui.find({ type: 'Text', text: /^Bash cd \/work\/api/ })
  expect(first).toBeDefined()
  expect(first!.text.length).toBeLessThanOrEqual(PANE.props.bodyColumns - W - 2)
  expect(await ui.find({ type: 'Text', text: /^--coverage|--reporter/ })).toBeDefined()
  await ui.unmount()
})

test('a worker card draws the small figure', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Run the tests', repo: '/work/api' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 46 } })
  const raster = await ui.find({ type: 'Raster', key: 'w-agent-1' })
  expect(raster?.props).toMatchObject({ columns: DIAMOND_W, rows: DIAMOND_ROWS })
  expect(cellText(String(raster?.props.cells)).replace(/[^╱╲]/g, '')).toBe('╱╲╲╱')
  const orch = await ui.find({ type: 'Raster', key: 'orch' })
  expect(orch?.props).toMatchObject({ columns: 8, rows: 6 })
  expect(await ui.find({ type: 'Text', text: /^api$/ })).toBeUndefined()
  await ui.unmount()
})

test("on the desktop a card's name and line are monospaced, regular weight, with two spare cells, so four letters show whole", async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Run the tests', repo: '/work/api' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 46 } })
  const cards = (await ui.findAll({ type: 'Box', text: /^Pipinit$/ })).filter(x => x.props.width === DIAMOND_W + 2)
  expect(cards).toHaveLength(1)
  const name = await ui.find({ type: 'Text', text: /^Pip$/ })
  expect(name?.props.mono).toBe(true)
  expect(name?.props.bold).toBe(false)
  const line = await ui.find({ type: 'Text', text: /^init$/ })
  expect(line?.props.mono).toBe(true)
  await ui.unmount()
})

test("on the desktop a card's name is plain text, with no button chrome to cut it, and the team view's opens the transcript", async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: true })
  for (let i = 1; i <= 11; i++) await $.tool.call({ tool: 'mcp__crew__delegate', task: `Task ${i}`, repo: `/work/r${i}` })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 46 } })
  expect(await ui.find({ key: 'view-agent-1' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Button' })).some(b => b.text === 'Pip')).toBe(false)
  const name = await ui.find({ type: 'Text', text: /^Pip$/ })
  expect(name?.props).toMatchObject({ mono: true, bold: false })
  // Six places of seven cells and a frame of eight in 46 columns: five
  // cards, and the count of the other six with room for the button's chrome.
  const more = await ui.find({ key: 'crew-all' })
  expect(more?.text).toBe('+6')
  expect(more?.props.label).toBe('+6')
  expect((await ui.find({ key: 'crew-all-frame' }))?.props.width).toBe(8)

  await ui.press({ key: 'crew-all' })
  expect((await ui.find({ key: 'view-agent-1' }))?.text).toBe('Pip')
  await ui.unmount()
})

test('the crew takes one row, and the rest wait in the team view', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= 11; i++) {
    await $.tool.call({ tool: 'mcp__crew__delegate', task: `Task ${i}`, repo: `/work/r${i}` })
  }
  await $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })

  // Nine places in 46 columns: eight figures and the ninth, the rest.
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 46 } })
  const figures = async () => (await ui.findAll({ type: 'Raster' })).filter(r => r.key?.startsWith('w-'))
  expect(await figures()).toHaveLength(8)
  const more = await ui.find({ key: 'crew-all' })
  expect(more?.text).toBe('+3')
  expect(more?.props.label).toBe('+3')

  await ui.press({ key: 'crew-all' })
  expect((await ui.findAll({ type: 'Button' }))[0]?.key).toBe('crew-back')
  expect(await figures()).toHaveLength(11)
  expect(await ui.find({ type: 'Text', text: /^Crew · 11 workers · 10 active$/ })).toBeDefined()
  await ui.press({ key: 'crew-clear' })
  expect(await figures()).toHaveLength(10)
  expect(await ui.find({ key: 'crew-clear' })).toBeUndefined()

  await ui.press({ key: 'crew-back' })
  expect(await ui.find({ key: 'edit' })).toBeDefined()
  expect(await ui.find({ key: 'crew-back' })).toBeUndefined()
  await ui.unmount()
})

test('the orchestrator cheers when its turn ends, idles, and naps after three minutes, as before its first turn', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const lines = VIBES_EN.cheerful.lines
  // A pane drawn afresh: the mood is read off the clock when it draws.
  const says = async (pool: readonly string[]) => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const isSaid = (await ui.findAll({ type: 'Text' })).some(t => pool.includes(t.text))
    await ui.unmount()
    return isSaid
  }
  await $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(1000)
  expect(await says(lines.happy)).toBe(true)
  await clock.advance(60_000)
  expect(await says(lines.happy)).toBe(false)
  expect(await says(lines.sleep)).toBe(false)
  await clock.advance(130_000)
  expect(await says(lines.sleep)).toBe(true)
})

test('the orchestrator is awake when the session starts, and naps after three minutes of it', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const lines = VIBES_EN.cheerful.lines
  const says = async (pool: readonly string[]) => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const isSaid = (await ui.findAll({ type: 'Text' })).some(t => pool.includes(t.text))
    await ui.unmount()
    return isSaid
  }
  // Idle, it says its catchphrase most.
  expect(await says([...lines.idle, defaultLook().phrase])).toBe(true)
  expect(await says(lines.sleep)).toBe(false)
  await clock.advance(179_000)
  expect(await says(lines.sleep)).toBe(false)
  await clock.advance(2000)
  expect(await says(lines.sleep)).toBe(true)
})

test('the orchestrator does not cheer for a turn that was stopped or failed', async ($, on) => {
  const clock = engine(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const lines = VIBES_EN.cheerful.lines
  const says = async (pool: readonly string[]) => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const isSaid = (await ui.findAll({ type: 'Text' })).some(t => pool.includes(t.text))
    await ui.unmount()
    return isSaid
  }
  const ends: TurnCompleteInput[] = [
    { answer: '', durationMs: 1000, turnId: 't1', isAborted: true, reason: 'aborted' },
    { answer: '', durationMs: 1000, turnId: 't2', isAborted: false, reason: 'error' },
    { answer: '', durationMs: 1000, turnId: 't3', isAborted: false, reason: 'refusal', refusal: { category: null, explanation: null } },
  ]
  for (const end of ends) {
    await $.turn.start({ text: 'Fix it', turnId: end.turnId })
    await $.turn.complete(end)
    await clock.advance(1000)
    expect(await says(lines.happy)).toBe(false)
    expect(await says([...lines.idle, defaultLook().phrase])).toBe(true)
  }
})

test("the orchestrator's line holds while its mood does, whatever tools it calls", async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const working = VIBES_EN.cheerful.lines.working
  const said = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const line = (await ui.findAll({ type: 'Text' })).find(t => working.includes(t.text))?.text
    await ui.unmount()
    return line
  }
  // What each call says the orchestrator does shows from the pane's next frame.
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(400)
  const first = await said()
  expect(first).toBeDefined()
  for (const command of ['git status', 'npm test', 'git log', 'npm run build']) {
    await clock.advance(3000)
    await $.tool.call({ tool: 'Bash', command })
    await clock.advance(400)
    expect(await said()).toBe(first)
  }
})

// The orchestrator's mood and activity as each write of them lands.
const orchWrites = (on: On) => {
  const written: { mood: string; activity: string }[] = []
  on('state.set', { plugin: 'crew', key: 'orch' }, (_, e, next) => {
    written.push({ mood: e.value.value.mood, activity: e.value.value.activity })
    return next(e)
  })
  return written
}

test("the main conversation's calls within one frame write what the orchestrator does once, as the last one says it", async ($, on) => {
  const written = orchWrites(on)
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await clock.advance(400)
  written.length = 0
  for (const file of ['a.ts', 'b.ts', 'c.ts']) await $.tool.call({ tool: 'Read', file_path: `/work/api/${file}` })
  expect(written).toEqual([])
  await clock.advance(400)
  expect(written).toEqual([{ mood: 'working', activity: 'Read c.ts' }])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Read c\.ts/ })).toBeDefined()
  await ui.unmount()
})

test("a turn's end before the pane's next frame stands: the call held for that frame is let go", async ($, on) => {
  const written = orchWrites(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: '', turnId: 'm1' })
  await $.tool.call({ tool: 'Read', file_path: '/work/api/a.ts' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'm1', reason: 'answer' })
  written.length = 0
  await clock.advance(800)
  expect(written).toEqual([])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Read a\.ts/ })).toBeUndefined()
  await ui.unmount()
})

test('a free worker naps, and its card says nothing more', async ($, on) => {
  let status: AgentInfo['status'] = 'running'
  const clock = engine(on, { agents: () => [{ id: 'agent-1', name: 'pip', description: 'Arreglar tests', type: 'general-purpose', status }] })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Run the tests', title: 'Arreglar tests', repo: '/work/api' })
  status = 'idle'
  await $.tool.call({ tool: 'mcp__crew__roster' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^Pip$/ }))?.text).toBe('Pip')
  expect(await ui.find({ type: 'Text', text: /^free$/ })).toBeUndefined()
  // Its figure sleeps: a zZ comes and goes over its head.
  let marks = ''
  for (let k = 0; k < 4; k++) {
    marks += cellText(String((await ui.find({ type: 'Raster', key: 'w-agent-1' }))?.props.cells))
    await clock.advance(1200)
    await ui.redraw()
  }
  expect(marks).toMatch(/z/)
  await ui.unmount()
})

test('a worker that finishes and naps leaves the row once its end stops standing out, and stays in the crew', async ($, on) => {
  const { clock, states, roster, nap, ui, card } = await napCrew($, on, 1)
  await $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  expect(await nap('agent-1')).toMatch(/^- Pip: address "pip", idle, /m)

  // Asleep five seconds, but its end stands out for half a minute.
  await clock.advance(JUST_ENDED_MS - 100)
  expect(await card('agent-1')).toBeDefined()
  await clock.advance(100)
  expect(await card('agent-1')).toBeUndefined()
  // With nobody left to show the row takes no room at all; the count above
  // is the whole crew's.
  expect(await ui.find({ key: 'view-agent-1' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^1 worker · 0 active$/ })).toBeDefined()

  // Still in the crew: the roster has it, and the team view shows it asleep.
  expect(await roster()).toMatch(/^- Pip: address "pip", idle, /m)
  await crewCommand($, 'team')
  let marks = ''
  for (let k = 0; k < 4; k++) {
    marks += cellText(String((await card('agent-1'))?.props.cells))
    await clock.advance(1200)
  }
  expect(marks).toMatch(/z/)
  expect(await ui.find({ type: 'Text', text: /^free$/ })).toBeDefined()
  await ui.press({ key: 'crew-back' })

  // A new task goes to it, and it is back in the row at once.
  const given = await $.tool.call({ tool: DELEGATE, task: 'Fix the flaky test', repo: '/work/r1' })
  expect(String(given.result)).toMatch(/^Given to Pip /)
  states.set('agent-1', 'running')
  expect(await card('agent-1')).toBeDefined()
  await ui.unmount()
})

test('a napping worker comes back to the row when a teammate wakes it', async ($, on) => {
  const { clock, states, nap, ui, card } = await napCrew($, on, 2)
  await nap('agent-1')
  await clock.advance(AWAY_MS)
  expect(await card('agent-1')).toBeUndefined()
  expect(await card('agent-2')).toBeDefined()

  // Bolt's message goes on from here at the next tick, and wakes Pip.
  await workerSend($, 'pip', 'Bolt: one more thing', 'agent-2')
  await clock.advance(400)
  states.set('agent-1', 'running')
  expect(await card('agent-1')).toBeDefined()
  await ui.unmount()
})

test('a worker that ends done, failed or stopped leaves the row once its end stops standing out, and stays in the crew', async ($, on) => {
  const { clock, states, roster, ui, card } = await napCrew($, on, 3)
  await $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  await $.turn.complete({ answer: 'No pude', durationMs: 1000, isAborted: false, turnId: 't2', agentId: 'agent-2', reason: 'error' })
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: true, turnId: 't3', agentId: 'agent-3', reason: 'aborted' })
  states.set('agent-1', 'completed')
  states.set('agent-2', 'failed')
  states.set('agent-3', 'killed')
  const ended = await roster()
  for (const row of [/^- Pip: address "pip", done, /m, /^- Bolt: address "bolt", failed, /m, /^- \S+: address "\S+", stopped, /m]) expect(ended).toMatch(row)

  // Each end stands out for half a minute, then the row lets them go.
  await clock.advance(JUST_ENDED_MS - 100)
  for (const id of ['agent-1', 'agent-2', 'agent-3']) expect(await card(id)).toBeDefined()
  await clock.advance(100)
  for (const id of ['agent-1', 'agent-2', 'agent-3']) expect(await card(id)).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^3 workers · 0 active$/ })).toBeDefined()

  // Still in the crew: the roster and the team view have them as they ended.
  expect(await roster()).toMatch(/^- Bolt: address "bolt", failed, /m)
  await crewCommand($, 'team')
  for (const id of ['agent-1', 'agent-2', 'agent-3']) expect(await card(id)).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^failed$/ })).toBeDefined()
  await ui.unmount()
})

test('the row and its +N count only the workers that have not napped away', async ($, on) => {
  const { clock, nap, ui, figures } = await napCrew($, on, 12)
  await nap('agent-1', 'agent-2')
  await clock.advance(AWAY_MS)
  await ui.redraw()
  // Ten left for nine places: eight figures and the ninth, the other two.
  expect(await figures()).toHaveLength(8)
  const more = await ui.find({ key: 'crew-all' })
  expect(more?.text).toBe('+2')
  expect((await ui.find({ key: 'crew-all-frame' }))?.props.width).toBe(4)
  expect(await ui.find({ type: 'Text', text: /^12 workers · 10 active$/ })).toBeDefined()

  // One more naps away: the nine left fit, and no place is spent on the rest.
  await nap('agent-3')
  await clock.advance(AWAY_MS)
  await ui.redraw()
  expect(await figures()).toHaveLength(9)
  expect(await ui.find({ key: 'crew-all' })).toBeUndefined()

  // The team view has all twelve.
  await crewCommand($, 'team')
  await ui.redraw()
  expect(await figures()).toHaveLength(12)
  await ui.unmount()
})

for (const [name, options, ms] of [
  ['no napAfter set', {}, 5000],
  ['napAfter 5s', { napAfter: '5s' }, 5000],
  ['napAfter 30s', { napAfter: '30s' }, 30_000],
  ['napAfter 2m', { napAfter: '2m' }, 120_000],
] as const) {
  test(`with ${name}, a free worker leaves the row ${ms / 1000} s after it went free`, { options }, async ($, on) => {
    const { clock, ui, card } = await freeCrew($, on)
    await clock.advance(ms - 100)
    expect(await card('agent-1')).toBeDefined()
    await clock.advance(100)
    expect(await card('agent-1')).toBeUndefined()
    await ui.unmount()
  })

  // However short its time, a finished worker stays while its end stands out.
  const away = Math.max(ms, JUST_ENDED_MS)
  test(`with ${name}, a finished worker leaves the row ${away / 1000} s after it ended`, { options }, async ($, on) => {
    const { clock, ui, card } = await doneCrew($, on)
    await clock.advance(away - 100)
    expect(await card('agent-1')).toBeDefined()
    await clock.advance(100)
    expect(await card('agent-1')).toBeUndefined()
    await ui.unmount()
  })
}

test(
  'with napAfter never, free and finished workers stay in the row long after their ends stopped standing out',
  { options: { napAfter: 'never' } },
  async ($, on) => {
    const { clock, states, nap, ui, card } = await napCrew($, on, 2)
    await $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
    states.set('agent-1', 'completed')
    await nap('agent-2')
    await clock.advance(5 * 60_000)
    expect(await card('agent-1')).toBeDefined()
    expect(await card('agent-2')).toBeDefined()
    const word = await ui.find({ type: 'Text', text: /^done$/ })
    expect(word).toBeDefined()
    expect(word?.props.inverse).not.toBe(true)
    await ui.unmount()
  },
)

test('a longer napAfter moves the redraw that takes a worker off the row with it', { options: { napAfter: '30s' } }, async ($, on) => {
  const { clock, ui, card } = await freeCrew($, on)
  await clock.advance(30_000 - 100)
  expect(await card('agent-1')).toBeDefined()
  // No redraw from the test: the pane's timer draws it away by itself.
  await clock.advance(400)
  expect(await ui.find({ type: 'Raster', key: 'w-agent-1' })).toBeUndefined()
  await ui.unmount()
})

test("no worker wears the color of the orchestrator's name", async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= 10; i++) {
    await $.tool.call({ tool: 'mcp__crew__delegate', task: `Task ${i}`, repo: `/work/r${i}` })
  }
  const names = ['Pip', 'Bolt', 'Mika', 'Tito', 'Luna', 'Rex', 'Kiko', 'Nube', 'Chip', 'Coco']

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 46 } })
  for (let k = 1; k < NAME_COLORS.length; k++) {
    await ui.press({ key: 'edit' })
    await ui.press({ key: 'next-nameColor' })
    await ui.press({ key: 'look-done' })
    await ui.press({ key: 'crew-all' })
    const colors = (await ui.findAll({ type: 'Text' })).filter(t => names.includes(t.text)).map(t => t.props.color)
    expect(colors).toHaveLength(10)
    expect(colors).not.toContain(NAME_COLORS[k]![1])
    await ui.press({ key: 'crew-back' })
  }
  await ui.unmount()
})

test('a session with no surface opens the pane once one attaches, and only then', async ($, on) => {
  const seen = { prompts: [], sends: [], opens: [] as string[] }
  engine(on, { seen })
  let surfaces: ('terminal' | 'desktop')[] = []
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  await $.session.start({ cwd: '/work/main', surface: null, isInteractive: false })
  expect(seen.opens).toEqual([])
  surfaces = ['desktop']
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  expect(seen.opens).toEqual([PANE.requestId])
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:second' })
  expect(seen.opens).toEqual([PANE.requestId])
})

test('once the last app leaves, the pane is no longer drawn again for its page', async ($, on) => {
  const clock = engine(on)
  let surfaces: ('terminal' | 'desktop')[] = ['desktop']
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.detach', (_, e) => ({ clientId: e.clientId }))
  let redraws = 0
  on('state.set', { plugin: 'crew', key: 'beat' }, (_, e, next) => {
    redraws += 1
    return next(e)
  })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await clock.advance(10_000)
  expect(redraws).toBeGreaterThan(0)

  surfaces = []
  await $.session.detach({ surface: 'desktop', clientId: 'desktop:default', reason: 'detach' })
  redraws = 0
  await clock.advance(30_000)
  expect(redraws).toBe(0)
  await ui.unmount()
})

test('a session started on a surface opens the pane at once, and not again when another attaches', async ($, on) => {
  const seen = { prompts: [], sends: [], opens: [] as string[] }
  engine(on, { seen })
  let surfaces: ('terminal' | 'desktop')[] = ['terminal']
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  expect(seen.opens).toEqual([PANE.requestId])
  surfaces = ['terminal', 'desktop']
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  expect(seen.opens).toEqual([PANE.requestId])
})
