import { expect } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'
import { NAME_COLORS, W } from '../src/figure/catalog'
import { DIAMOND_ROWS, DIAMOND_W } from '../src/figure/diamond'
import { DEFAULT_LOOK } from '../src/figure/look'
import { esVibes as VIBES_ES } from '../src/i18n/es-vibes'
import { VIBES, vibeOf } from '../src/persona/vibes'
import { JUST_ENDED_MS } from '../src/progress/runs'
import { AWAY_MS, DELEGATE, PANE, SLOW, cellText, crewCommand, engine, napCrew, switchTo, test, workerSend } from './support/crew'

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
    expect(figures.map(f => f.props.alt)).toEqual(['Nova, el orquestador', 'Pip: arrancando'])
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
    expect(await top()).toBe('Nova · Alegre · Opus 5.5')
    // /model: the switch names the model it went to.
    model = 'claude-sonnet-5-5'
    await $.classic.PostModelSwitch(switchTo(model))
    expect(await top()).toBe('Nova · Alegre · Sonnet 5.5')
    // The settings changed it: the next turn of the main session reads it.
    model = 'claude-fable-5-1'
    await $.turn.start({ text: 'hola', turnId: 't1' })
    expect(await top()).toBe('Nova · Alegre · Fable 5.1')
    // A worker's turn does not ask.
    model = 'claude-haiku-4-5'
    await $.turn.start({ text: 'go', turnId: 't2', agentId: 'agent-9' })
    expect(await top()).toBe('Nova · Alegre · Fable 5.1')
    // A cloud's ids, an older one, and one that does not read as a model's.
    for (const [id, shown] of [
      ['us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'Sonnet 4.5'],
      ['claude-haiku-4-5@20251001', 'Haiku 4.5'],
      ['claude-3-5-sonnet-20241022', 'Sonnet 3.5'],
      ['claude-sonnet-4-20250514', 'Sonnet 4'],
      ['my-gateway/large', 'my-gateway/large'],
    ] as const) {
      await $.classic.PostModelSwitch(switchTo(id))
      expect(await top()).toBe(`Nova · Alegre · ${shown}`)
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
    for (const bodyColumns of [56, 46, 40, 34, 30, 26]) {
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
  expect((await ui.find({ type: 'Text', text: new RegExp(`^${name} · `) }))?.text).toBe(`${head} · an-unknown-gatewa…`)
  await ui.unmount()
})

test('a long command takes two lines beside the orchestrator', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'Bash',
    command: 'cd /work/api && npm run test -- --coverage --reporter=verbose --bail --watch=false',
  })

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
  expect(more?.props.label).toBe('Ver todos (3 más)')

  await ui.press({ key: 'crew-all' })
  expect((await ui.findAll({ type: 'Button' }))[0]?.key).toBe('crew-back')
  expect(await figures()).toHaveLength(11)
  expect(await ui.find({ type: 'Text', text: /^Equipo · 11 workers · 10 activos$/ })).toBeDefined()
  await ui.press({ key: 'crew-clear' })
  expect(await figures()).toHaveLength(10)
  expect(await ui.find({ key: 'crew-clear' })).toBeUndefined()

  await ui.press({ key: 'crew-back' })
  expect(await ui.find({ key: 'edit' })).toBeDefined()
  expect(await ui.find({ key: 'crew-back' })).toBeUndefined()
  await ui.unmount()
})

test('the orchestrator cheers when its turn ends, idles, and naps after three minutes, as before its first turn', SLOW, async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const lines = VIBES_ES.cheerful.lines
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

test("the orchestrator's line holds while its mood does, whatever tools it calls", async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const working = VIBES_ES.cheerful.lines.working
  const said = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const line = (await ui.findAll({ type: 'Text' })).find(t => working.includes(t.text))?.text
    await ui.unmount()
    return line
  }
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const first = await said()
  expect(first).toBeDefined()
  for (const command of ['git status', 'npm test', 'git log', 'npm run build']) {
    await clock.advance(3000)
    await $.tool.call({ tool: 'Bash', command })
    expect(await said()).toBe(first)
  }
})

test('a free worker naps, and its card says nothing more', async ($, on) => {
  let status: AgentInfo['status'] = 'running'
  const clock = engine(on, { agents: () => [
    { id: 'agent-1', name: 'pip', description: 'Arreglar tests', type: 'general-purpose', status },
  ] })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Run the tests', title: 'Arreglar tests', repo: '/work/api' })
  status = 'idle'
  await $.tool.call({ tool: 'mcp__crew__roster' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^Pip$/ }))?.text).toBe('Pip')
  expect(await ui.find({ type: 'Text', text: /^libre$/ })).toBeUndefined()
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
  expect(await ui.find({ type: 'Text', text: /^1 worker · 0 activos$/ })).toBeDefined()

  // Still in the crew: the roster has it, and the team view shows it asleep.
  expect(await roster()).toMatch(/^- Pip: address "pip", idle, /m)
  await crewCommand($, 'equipo')
  let marks = ''
  for (let k = 0; k < 4; k++) {
    marks += cellText(String((await card('agent-1'))?.props.cells))
    await clock.advance(1200)
  }
  expect(marks).toMatch(/z/)
  expect(await ui.find({ type: 'Text', text: /^libre$/ })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /^3 workers · 0 activos$/ })).toBeDefined()

  // Still in the crew: the roster and the team view have them as they ended.
  expect(await roster()).toMatch(/^- Bolt: address "bolt", failed, /m)
  await crewCommand($, 'equipo')
  for (const id of ['agent-1', 'agent-2', 'agent-3']) expect(await card(id)).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^falló$/ })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /^12 workers · 10 activos$/ })).toBeDefined()

  // One more naps away: the nine left fit, and no place is spent on the rest.
  await nap('agent-3')
  await clock.advance(AWAY_MS)
  await ui.redraw()
  expect(await figures()).toHaveLength(9)
  expect(await ui.find({ key: 'crew-all' })).toBeUndefined()

  // The team view has all twelve.
  await crewCommand($, 'equipo')
  await ui.redraw()
  expect(await figures()).toHaveLength(12)
  await ui.unmount()
})

test('no worker wears the color of the orchestrator\'s name', async ($, on) => {
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
    const colors = (await ui.findAll({ type: 'Text' }))
      .filter(t => names.includes(t.text))
      .map(t => t.props.color)
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
