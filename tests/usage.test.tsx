import { expect } from 'claude-code/testing'
import { PANE, engine, test, usageReply } from './support/crew'

test("the account's usage sits beside the delegation switch and follows each measure", async ($, on) => {
  const probes: { argv: readonly string[]; stdin: string }[] = []
  const clock = engine(on, {
    rateLimits: [
      { kind: 'seven_day', percentUsed: 41.4 },
      { kind: 'five_hour', percentUsed: 12.5 },
    ],
    probe: (argv, stdin) => (probes.push({ argv, stdin }), usageReply(7.4 + probes.length)),
  })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const shown = async () => (await ui.findAll({ type: 'Text', text: /^(5h|week|fable)\s+\d+%$/ })).map(t => t.text.replace(/\s+/g, ' '))
  // The session's window first, then the week's, then Fable's week below.
  await ui.redraw()
  expect(await shown()).toEqual(['5h 13%', 'week 41%', 'fable 8%'])
  // Fable's comes from a headless claude asked for /usage, which loads no plugins.
  expect(probes).toHaveLength(1)
  expect(probes[0]!.argv.join(' ')).toMatch(/^claude -p --setting-sources local .*--no-session-persistence/)
  expect(probes[0]!.stdin).toMatch(/"subtype":"get_usage"/)

  const measure = (rateLimits: { kind: string; percentUsed: number }[]) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits, changed: ['rateLimits'] })
  await measure([
    { kind: 'five_hour', percentUsed: 86 },
    { kind: 'seven_day', percentUsed: 42 },
  ])
  await ui.redraw()
  expect(await shown()).toEqual(['5h 86%', 'week 42%', 'fable 8%'])
  expect((await ui.find({ type: 'Text', text: /^\s*86%$/ }))?.props.color).toBe('error')
  // It asks again only once a few minutes have passed.
  expect(probes).toHaveLength(1)
  await clock.advance(3 * 60_000)
  // The pane, shown, has drawn itself again meanwhile.
  await ui.redraw()
  await measure([
    { kind: 'five_hour', percentUsed: 87 },
    { kind: 'seven_day', percentUsed: 42 },
  ])
  await ui.redraw()
  expect(probes).toHaveLength(2)
  expect(await shown()).toEqual(['5h 87%', 'week 42%', 'fable 9%'])
  await ui.unmount()
})

test('where claude is not on the PATH, the usage asks the executable of the session', async ($, on) => {
  const probes: string[] = []
  const exe = 'C:\\Users\\ana\\.local\\bin\\claude.exe'
  engine(on, {
    rateLimits: [{ kind: 'five_hour', percentUsed: 12 }],
    probe: argv => {
      probes.push(argv[0]!)
      if (argv[0] === 'claude') throw new Error('not found')
      return usageReply(30)
    },
    stored: {},
    host: { cwd: 'C:\\work\\main', env: { CLAUDE_CODE_EXECPATH: exe } },
  })
  await $.session.start({ cwd: 'C:\\work\\main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.redraw()
  expect(probes).toEqual(['claude', exe])
  expect(await ui.find({ type: 'Text', text: /^fable\s+30%$/ })).toBeDefined()
  await ui.unmount()
})

test("the desktop app's session asks for the usage once the app attaches, of the app's own claude", async ($, on) => {
  const probes: string[] = []
  const exe = 'C:\\Users\\ana\\AppData\\Roaming\\Claude\\claude-code\\2.1.317\\a33aa5518497\\claude.exe'
  engine(on, {
    rateLimits: [{ kind: 'seven_day', percentUsed: 61 }],
    probe: argv => {
      probes.push(argv[0]!)
      if (argv[0] === 'claude') throw new Error('not found')
      return usageReply(30)
    },
    stored: {},
    host: { cwd: 'C:\\work\\main', env: { CLAUDE_CODE_EXECPATH: exe } },
  })
  let surfaces: ('terminal' | 'desktop')[] = []
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  // The app runs its session as the SDK, and attaches once it is up.
  await $.session.start({ cwd: 'C:\\work\\main', surface: null, isInteractive: false })
  expect(probes).toEqual([])
  surfaces = ['desktop']
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.redraw()
  expect(probes).toEqual(['claude', exe])
  expect(await ui.find({ type: 'Text', text: /^week\s+61%$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^fable\s+30%$/ })).toBeDefined()
  await ui.unmount()
})

test('a session started with the app already attached asks for the usage at once', async ($, on) => {
  let probes = 0
  engine(on, { rateLimits: [], probe: () => (probes++, usageReply(5)) })
  on('session.surfaces', () => ({ value: ['desktop'] }))
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.redraw()
  expect(probes).toBe(1)
  expect(await ui.find({ type: 'Text', text: /^fable\s+5%$/ })).toBeDefined()
  await ui.unmount()
})

test("with the usage probe off, no session asks for the usage and the pane shows the engine's windows", { options: { usageProbe: 'off' } }, async ($, on) => {
  let probes = 0
  engine(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 12 }], probe: () => (probes++, usageReply(30)) })
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  // Interactive, then measured, then with the app attached: each would ask.
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 13 }], changed: ['rateLimits'] })
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.redraw()
  expect(probes).toBe(0)
  expect(await ui.find({ type: 'Text', text: /^5h\s+13%$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^fable\s+\d+%$/ })).toBeUndefined()
  await ui.unmount()
})

test('off a subscription the usage says nothing, and a headless session never asks', async ($, on) => {
  let probes = 0
  engine(on, { rateLimits: [], probe: () => (probes++, '') })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: false })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['rateLimits'] })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^(5h|week|fable)\s+\d+%$/ })).toBeUndefined()
  expect(probes).toBe(0)
  await ui.unmount()
})

test("on the desktop the usage's padded rows and the switch's padded word are monospaced, so they line up", async ($, on) => {
  engine(on, {
    rateLimits: [
      { kind: 'five_hour', percentUsed: 7 },
      { kind: 'seven_day', percentUsed: 41.4 },
    ],
  })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.redraw()
  const rows = await ui.findAll({ type: 'Text', text: /^(5h|week|fable)\s+\d+%$/ })
  expect(rows.map(x => x.text)).toEqual(['5h     7%', 'week  41%'])
  for (const row of rows) expect(row.props.mono).toBe(true)
  const said = await ui.find({ type: 'Text', text: /^(ON |OFF)$/ })
  expect(said?.props.mono).toBe(true)
  await ui.unmount()
})

// What a headless claude answers to get_usage for an account with no model window.
const noWindowReply = [
  JSON.stringify({ type: 'system', subtype: 'init' }),
  JSON.stringify({
    type: 'control_response',
    response: { subtype: 'success', request_id: 'crew-usage', response: { rate_limits: { five_hour: { utilization: 12 }, model_scoped: [] } } },
  }),
].join('\n')

const MIN = 60_000

test('after a reply with no model window the usage probe waits twice as long each time', async ($, on) => {
  const at: number[] = []
  const clock = engine(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 1 }], probe: () => (at.push(clock.now()), noWindowReply) })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.redraw()
  const start = clock.now()
  // The person works with the pane in sight: a window moves a point every minute.
  for (let minute = 1; minute <= 20; minute++) {
    await clock.advance(MIN)
    await ui.redraw()
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 1 + minute }], changed: ['rateLimits'] })
  }
  expect(at.map(t => (t - start) / MIN)).toEqual([0, 6, 18])
  await ui.unmount()
})

test("a reply with a model window, or a change in the engine's windows, sets the probe's wait back to three minutes", async ($, on) => {
  const at: number[] = []
  const clock = engine(on, {
    rateLimits: [{ kind: 'five_hour', percentUsed: 1 }],
    probe: () => (at.push(clock.now()), at.length <= 2 ? noWindowReply : usageReply(20)),
  })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.redraw()
  const start = clock.now()
  for (let minute = 1; minute <= 13; minute++) {
    await clock.advance(MIN)
    await ui.redraw()
    // At minute 9 the account gains a weekly window: its plan changed.
    const rateLimits = [{ kind: 'five_hour', percentUsed: 1 + minute }, ...(minute >= 9 ? [{ kind: 'seven_day', percentUsed: 3 }] : [])]
    await $.session.measure({ context: { window: 200_000 }, rateLimits, changed: ['rateLimits'] })
  }
  expect(at.map(t => (t - start) / MIN)).toEqual([0, 6, 9, 12])
  expect(await ui.find({ type: 'Text', text: /^fable\s+20%$/ })).toBeDefined()
  await ui.unmount()
})

test('while nothing shows the limits the usage probe waits, and asks once the pane shows them again', async ($, on) => {
  let probes = 0
  const clock = engine(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 1 }], probe: () => (probes++, usageReply(20)) })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.redraw()
  expect(probes).toBe(1)
  // The editor shows no limits.
  await ui.press({ key: 'edit' })
  for (let minute = 1; minute <= 5; minute++) {
    await clock.advance(MIN)
    await ui.redraw()
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 1 + minute }], changed: ['rateLimits'] })
  }
  expect(probes).toBe(1)
  await ui.press({ key: 'look-done' })
  await ui.redraw()
  await clock.advance(400)
  expect(probes).toBe(2)
  await ui.unmount()
})
