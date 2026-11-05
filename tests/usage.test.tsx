import { expect } from 'claude-code/testing'
import { PANE, SLOW, engine, test, usageReply } from './support/crew'

test('where claude is not on the PATH, the usage asks the executable of the session', async ($, on) => {
  const probes: string[] = []
  const exe = 'C:\\Users\\ana\\.local\\bin\\claude.exe'
  engine(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 12 }], probe: argv => {
    probes.push(argv[0]!)
    if (argv[0] === 'claude') throw new Error('not found')
    return usageReply(30)
  }, stored: {}, host: { cwd: 'C:\\work\\main', env: { CLAUDE_CODE_EXECPATH: exe } } })
  await $.session.start({ cwd: 'C:\\work\\main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.redraw()
  expect(probes).toEqual(['claude', exe])
  expect((await ui.find({ type: 'Text', text: /^fable\s+30%$/ }))).toBeDefined()
  await ui.unmount()
})

test("the desktop app's session asks for the usage once the app attaches, of the app's own claude", async ($, on) => {
  const probes: string[] = []
  const exe = 'C:\\Users\\ana\\AppData\\Roaming\\Claude\\claude-code\\2.1.317\\a33aa5518497\\claude.exe'
  engine(on, { rateLimits: [{ kind: 'seven_day', percentUsed: 61 }], probe: argv => {
    probes.push(argv[0]!)
    if (argv[0] === 'claude') throw new Error('not found')
    return usageReply(30)
  }, stored: {}, host: { cwd: 'C:\\work\\main', env: { CLAUDE_CODE_EXECPATH: exe } } })
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

test('the account\'s usage sits beside the delegation switch and follows each measure', SLOW, async ($, on) => {
  const probes: { argv: readonly string[]; stdin: string }[] = []
  const clock = engine(
    on,
    { rateLimits: [
      { kind: 'seven_day', percentUsed: 41.4 },
      { kind: 'five_hour', percentUsed: 12.5 },
    ], probe: (argv, stdin) => (probes.push({ argv, stdin }), usageReply(7.4 + probes.length)) },
  )
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const shown = async () =>
    (await ui.findAll({ type: 'Text', text: /^(5h|week|fable)\s+\d+%$/ })).map(t => t.text.replace(/\s+/g, ' '))
  // The session's window first, then the week's, then Fable's week below.
  await ui.redraw()
  expect(await shown()).toEqual(['5h 13%', 'week 41%', 'fable 8%'])
  // Fable's comes from a headless claude asked for /usage, which loads no plugins.
  expect(probes).toHaveLength(1)
  expect(probes[0]!.argv.join(' ')).toMatch(/^claude -p --setting-sources local .*--no-session-persistence/)
  expect(probes[0]!.stdin).toMatch(/"subtype":"get_usage"/)

  const measure = (rateLimits: { kind: string; percentUsed: number }[]) =>
    $.session.measure({ context: { window: 200_000 }, rateLimits, changed: ['rateLimits'] })
  await measure([{ kind: 'five_hour', percentUsed: 86 }, { kind: 'seven_day', percentUsed: 42 }])
  await ui.redraw()
  expect(await shown()).toEqual(['5h 86%', 'week 42%', 'fable 8%'])
  expect((await ui.find({ type: 'Text', text: /^\s*86%$/ }))?.props.color).toBe('error')
  // It asks again only once a few minutes have passed.
  expect(probes).toHaveLength(1)
  await clock.advance(3 * 60_000)
  await measure([{ kind: 'five_hour', percentUsed: 87 }, { kind: 'seven_day', percentUsed: 42 }])
  await ui.redraw()
  expect(probes).toHaveLength(2)
  expect(await shown()).toEqual(['5h 87%', 'week 42%', 'fable 9%'])
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
