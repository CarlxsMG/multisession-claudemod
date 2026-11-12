// The rows placed in the conversation while a crew works: a check-in every
// few minutes, the summary of a round, and the line of a message between
// agents.
import { expect } from 'claude-code/testing'
import { notePieces } from '../src/progress/text/note'
import { checkInRows } from '../src/progress/text/rows'
import type { CheckIn, CheckLine } from '../types'
import { DELEGATE, crewCommand, progress, progressCrew, test, workerSend } from './support/crew'

test('the newest check-in follows the round in place, its times once a minute; the rows before it keep what they showed', async ($, on) => {
  const { clock, placed, mainTurn, delegate, lines } = await progressCrew($, on)
  await delegate('Publish the plugin', '/work/api', 'Publicar')
  await progress($, 'agent-1', 0, 9, 'Plan')
  await progress($, 'agent-1', 1, 9, 'Fast-forward main')
  await $.tool.call({ tool: 'Read', file_path: '/work/api/a.ts', agentId: 'agent-1' })
  await clock.advance(180_000)
  expect(placed).toHaveLength(1)
  expect(await lines(placed[0]!)).toEqual(['─ crew · 1 active · round 3m', '  Pip  reading  1/9  3m  Fast-forward main'])

  // A step and a phase later, the same row says so, even while the
  // orchestrator's turn runs; nothing new is placed before the next mark.
  const done = await mainTurn()
  await progress($, 'agent-1', 3, 9, 'Write the docs')
  await $.tool.call({ tool: 'Edit', file_path: '/work/api/a.ts', old_string: 'a', new_string: 'b', agentId: 'agent-1' })
  await clock.advance(1000)
  expect(placed).toHaveLength(1)
  expect(await lines(placed[0]!)).toEqual(['─ crew · 1 active · round 3m', '  Pip  editing  3/9  3m  Write the docs'])
  await done()
  // With nothing else new, its times move on once a minute.
  await clock.advance(59_000)
  expect(await lines(placed[0]!)).toEqual(['─ crew · 1 active · round 3m', '  Pip  editing  3/9  3m  Write the docs'])
  await clock.advance(1000)
  expect(await lines(placed[0]!)).toEqual(['─ crew · 1 active · round 4m', '  Pip  editing  3/9  4m  Write the docs'])

  // The next check-in follows from then on, and the first folds to what it
  // showed when it was placed.
  await clock.advance(120_000)
  expect(placed).toHaveLength(2)
  expect(await lines(placed[1]!)).toEqual(['─ crew · 1 active · round 6m', '  Pip  editing  3/9  6m  Write the docs'])
  expect(await lines(placed[0]!)).toEqual(['─ crew · round 3m · Pip reading 1/9 3m'])
  await progress($, 'agent-1', 4, 9, 'Push')
  await clock.advance(1000)
  expect(await lines(placed[1]!)).toEqual(['─ crew · 1 active · round 6m', '  Pip  editing  4/9  6m  Push'])
  expect(await lines(placed[0]!)).toEqual(['─ crew · round 3m · Pip reading 1/9 3m'])
})

test('the newest check-in follows a new step without writing the rows, which every placed row reads', async ($, on) => {
  let writes = 0
  on('state.set', { plugin: 'crew', key: 'checkins' }, (_, e, next) => {
    writes += 1
    return next(e)
  })
  const { clock, placed, delegate, lines } = await progressCrew($, on)
  await delegate('Publish the plugin', '/work/api', 'Publicar')
  await progress($, 'agent-1', 1, 9, 'Fast-forward main')
  await clock.advance(180_000)
  expect(placed).toHaveLength(1)
  writes = 0

  await progress($, 'agent-1', 2, 9, 'Tag the release')
  await $.tool.call({ tool: 'Edit', file_path: '/work/api/a.ts', old_string: 'a', new_string: 'b', agentId: 'agent-1' })
  await clock.advance(61_000)
  expect(await lines(placed[0]!)).toEqual(['─ crew · 1 active · round 4m', '  Pip  editing  2/9  4m  Tag the release'])
  expect(writes).toBe(0)
})

test('with check-ins off, as the store keeps them from an earlier session, no row comes, nor a summary', async ($, on) => {
  const { clock, placed, delegate, end } = await progressCrew($, on, { progress: 0 })
  await delegate('Run the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  for (let k = 0; k < 4; k++) {
    await $.tool.call({ tool: 'Bash', command: k % 2 === 0 ? 'npm test' : 'ls', agentId: 'agent-1' })
    await clock.advance(180_000)
  }
  await end('agent-2')
  await end('agent-1')
  await clock.advance(5000)
  expect(placed).toHaveLength(0)
})

test('/crew progress 1m or 10m sets how often, in the store, and says so in a row; the reply says nothing', async ($, on) => {
  const { clock, placed, delegate, end, lines } = await progressCrew($, on)
  await delegate('Run the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'agent-1' })
  await clock.advance(30_000)
  await end('agent-2')

  // Asked for, a row says how the crew is doing and the interval at once;
  // the command's reply, which is stored where the model reads it, is empty.
  const reply = await crewCommand($, 'progress 1m')
  expect(reply.text).toBeUndefined()
  expect(reply.context).toBeUndefined()
  expect(placed).toHaveLength(1)
  expect(await lines(placed[0]!)).toEqual([
    '─ crew · 1 active · round 30s · check-in every 1m',
    '  Pip   running  30s  Bash ls',
    '  Bolt  ✓ done   30s  Revisar README',
  ])
  await $.tool.call({ tool: 'Read', file_path: '/work/api/b.ts', agentId: 'agent-1' })
  await clock.advance(59_000)
  expect(placed).toHaveLength(1)
  await clock.advance(1000)
  expect(placed).toHaveLength(2)

  expect((await crewCommand($, 'progress 10m')).text).toBeUndefined()
  expect(placed).toHaveLength(3)
  expect((await lines(placed[2]!))[0]).toMatch(/· check-in every 10m$/)
  await $.tool.call({ tool: 'Edit', file_path: '/work/api/b.ts', old_string: 'a', new_string: 'b', agentId: 'agent-1' })
  await clock.advance(599_000)
  expect(placed).toHaveLength(3)
  await clock.advance(1000)
  expect(placed).toHaveLength(4)

  await end('agent-1')
  await clock.advance(1000)
  expect(placed).toHaveLength(5)
  expect((await lines(placed[4]!))[0]).toBe('─ crew · round over · 11m')
  // Another load reads the interval back from the store. Alone, the command
  // places a check-in now; with nobody at work it says so.
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  expect(await crewCommand($, 'progress')).toEqual({})
  expect(await lines(placed[5]!)).toEqual(['─ crew · nobody working · check-in every 10m'])
  expect((await crewCommand($, 'progress 4m')).text).toBe('Usage: /crew progress [1m|2m|3m|5m|10m|off]')
  expect(placed).toHaveLength(6)
  expect(await crewCommand($, 'progress off')).toEqual({})
  expect(await lines(placed[6]!)).toEqual(['─ crew · nobody working · no check-ins'])
})

// A quarter of an hour of the clock, a progress tick a second: more than the
// default time on a busy machine.
test("a round of two workers, or one longer than the interval, ends in one summary row, after the orchestrator's turn", async ($, on) => {
  const { clock, placed, mainTurn, delegate, end, lines } = await progressCrew($, on)
  // One worker under the interval: nothing.
  await delegate('Quick look', '/work/api', 'Vistazo')
  await clock.advance(30_000)
  await end('agent-1')
  await clock.advance(5000)
  expect(placed).toHaveLength(0)

  // Two: one summary once the last ends, each with how it ended and its time.
  expect(await delegate('Fix the tests', '/work/api', 'Arreglar tests')).toMatch(/^Given to Pip /)
  await delegate('Review the README', '/work/web', 'Revisar README')
  await clock.advance(40_000)
  await end('agent-2', 'error')
  await clock.advance(20_000)
  await end('agent-1')
  await clock.advance(1000)
  expect(placed).toHaveLength(1)
  expect(await lines(placed[0]!)).toEqual(['─ crew · round over · 1m', '  × Bolt    40s  Revisar README', '  ✓ Pip   1m 0s  Arreglar tests'])
  await clock.advance(200_000)
  expect(placed).toHaveLength(1)

  // One worker for longer than the interval: its check-in, then the summary,
  // which waits while the orchestrator's turn runs.
  await delegate('Migrate the schema', '/work/db', 'Migración')
  await clock.advance(200_000)
  expect(placed).toHaveLength(2)
  const done = await mainTurn()
  await end('agent-3')
  await clock.advance(5000)
  expect(placed).toHaveLength(2)
  await done()
  await clock.advance(1000)
  expect(placed).toHaveLength(3)
  expect(await lines(placed[2]!)).toEqual(['─ crew · round over · 3m', '  ✓ Mika  3m 20s  Migración'])
  expect(await lines(placed[0]!)).toEqual(['─ crew · round of 1m · × Bolt 40s · ✓ Pip 1m 0s'])
  await clock.advance(200_000)
  expect(placed).toHaveLength(3)
})

test("a check-in row comes every 3 minutes of work when something changed, and waits for the orchestrator's turn to end", async ($, on) => {
  const { clock, placed, mainTurn, delegate, lines } = await progressCrew($, on)
  await delegate('Run the tests', '/work/api', 'Arreglar tests')
  await $.tool.call({ tool: 'Read', file_path: '/work/api/a.ts', agentId: 'agent-1' })
  // None before three minutes, so a short task never gets one.
  await clock.advance(179_000)
  expect(placed).toHaveLength(0)
  await clock.advance(1000)
  expect(placed).toHaveLength(1)
  expect(await lines(placed[0]!)).toEqual(['─ crew · 1 active · round 3m', '  Pip  reading  3m  Read a.ts'])

  // Three more minutes with nothing new: no row.
  await clock.advance(180_000)
  expect(placed).toHaveLength(1)
  // A phase that changes is news at the next mark.
  await $.tool.call({ tool: 'Edit', file_path: '/work/api/a.ts', old_string: 'a', new_string: 'b', agentId: 'agent-1' })
  await clock.advance(180_000)
  expect(placed).toHaveLength(2)

  // A worker starts while the orchestrator's turn runs: the row waits for
  // the turn to end, and comes right after.
  const done = await mainTurn()
  await $.tool.call({ tool: DELEGATE, task: 'Review the README', title: 'Revisar README', repo: '/work/web' })
  await clock.advance(180_000)
  expect(placed).toHaveLength(2)
  await done()
  await clock.advance(1000)
  expect(placed).toHaveLength(3)
  expect(await lines(placed[2]!)).toEqual(['─ crew · 2 active · round 12m', '  Pip   editing   12m  Edit a.ts', '  Bolt  thinking   3m'])
  // The rows before it fold to one line each, as they were.
  expect(await lines(placed[0]!)).toEqual(['─ crew · round 3m · Pip reading 3m'])
  expect(await lines(placed[1]!)).toEqual(['─ crew · round 9m · Pip editing 9m'])

  // Many more calls are news even in the same phase.
  for (let k = 0; k < 25; k++) await $.tool.call({ tool: 'Edit', file_path: '/work/api/a.ts', old_string: 'a', new_string: 'b', agentId: 'agent-1' })
  await $.tool.call({ tool: 'Read', file_path: '/work/web/README.md', agentId: 'agent-2' })
  await clock.advance(180_000)
  expect(placed).toHaveLength(4)
  await clock.advance(180_000)
  expect(placed).toHaveLength(4)
})

test("a summary's columns are as wide as the lines it shows need, whatever the lines it only counts", () => {
  const line = (name: string, ms: number): CheckLine => ({ id: name, name, phase: 'editing', end: 'done', ms, doing: 'Work', tools: 1 })
  const lines = [...Array.from({ length: 8 }, () => line('Pip', 60_000)), line('Longername', 7_200_000)]
  const row: CheckIn = { id: 'row', kind: 'summary', at: 0, roundMs: 7_200_000, every: 3, isAsked: false, lines }
  const rows = checkInRows(row, 80, true).map(pieces => pieces.map(p => p.text).join(''))
  expect(rows).toHaveLength(10)
  expect(rows[1]).toBe('  ✓ Pip  1m 0s  Work')
  expect(rows[9]).toBe('  +1 more')
})

test("a message's line says who to whom, its gist, and whether it woke the recipient or never got there; the gist gives way first", () => {
  const text = (pieces: { text: string }[]) => pieces.map(p => p.text).join('')
  const note = { fromId: 'agent-2', from: 'Bolt', toId: 'agent-1', to: 'Pip', gist: 'router fixed', wakes: true, isLost: false }
  expect(text(notePieces(note, 80))).toBe('● Bolt → Pip: router fixed · wakes it')
  expect(text(notePieces({ ...note, wakes: false }, 80))).toBe('● Bolt → Pip: router fixed')
  expect(text(notePieces({ ...note, isLost: true, wakes: false }, 80))).toBe('● Bolt → Pip: router fixed · not delivered')
  expect(text(notePieces(note, 36))).toBe('● Bolt → Pip: router fix… · wakes it')
  expect(text(notePieces(note, 30))).toBe('● Bolt → Pip: rout… · wakes it')
  expect(text(notePieces(note, 28))).toBe('● Bolt → Pip · wakes it')
  // Names in their worker's color; one outside the crew, plain.
  const outside = notePieces({ ...note, toId: '', to: 'otra-sesion', wakes: false }, 80)
  expect(outside.map(p => p.role)).toEqual(['head', 'name', 'head', 'phase', 'doing'])
})

test('every message between agents has its line here once the main turn is over; one to the main conversation is its bubble alone', async ($, on) => {
  const { clock, seen, placed, toasts, delegate, end, mainTurn, lines } = await progressCrew($, on)
  await delegate('Build the session bus step', '/work/api', 'Session bus')
  await delegate('Build the remote channel', '/work/web', 'Remote channel')
  const send = async (to: string, message: string, summary?: string) => {
    await $.tool.call({ tool: 'SendMessage', to, message, ...(summary ? { summary } : {}), agentId: 'agent-2' })
    return workerSend($, to, message, 'agent-2')
  }

  // To a busy teammate, while Nova is in its turn: the line waits for its end.
  const done = await mainTurn()
  await send('pip', 'Bolt: are you on router.ts?\nI need the lock.', 'router.ts?')
  await clock.advance(2000)
  expect(placed).toEqual([])
  await done()
  await clock.advance(1000)
  expect(placed).toHaveLength(1)
  expect(await lines(placed[0]!)).toEqual(['● Bolt → Pip: router.ts?'])

  // To a free one, which the crew's message wakes; with no summary, its
  // first line. One to the main conversation is a bubble there, no line.
  await end('agent-1')
  await clock.advance(1000)
  await send('pip', 'Bolt: both fixed\nrun the suite again')
  await send('main', 'Bolt: the channel is up')
  await clock.advance(1000)
  expect(placed).toHaveLength(2)
  expect(await lines(placed[1]!)).toEqual(['● Bolt → Pip: Bolt: both fixed · wakes it'])
  expect(seen.sends[seen.sends.length - 1]).toMatch(/^\[crew\] From Bolt \("bolt"\), passed on by the crew: /)

  // One the crew could not pass on: a line that says so, and a toast.
  await end('agent-1')
  await clock.advance(1000)
  ;(seen as { failSends?: boolean }).failSends = true
  await send('pip', 'Bolt: one more thing')
  await clock.advance(1000)
  expect(await lines(placed[placed.length - 1]!)).toEqual(['● Bolt → Pip: Bolt: one more thing · not delivered'])
  expect(toasts[toasts.length - 1]).toMatch(/^Bolt's message did not reach Pip: /)
})

test("on the desktop a check-in's padded columns are monospaced, so they line up", async ($, on) => {
  const { clock, placed, delegate } = await progressCrew($, on)
  await delegate('Publish the plugin', '/work/api', 'Publicar')
  await delegate('Write the docs', '/work/docs', 'Docs')
  await progress($, 'agent-1', 1, 9, 'Fast-forward main')
  await clock.advance(180_000)
  expect(placed).toHaveLength(1)
  const ui = await $.ui.mount({
    plugin: 'crew',
    surface: 'desktop',
    component: 'Placed',
    requestId: placed[0]!,
    props: { id: placed[0]!, plugin: 'crew' },
    viewport: { columns: 80, rows: 40 },
  })
  // The row's own lines are the Box's children; the runs inside take their face.
  const rows = ((await ui.find({ type: 'Box' }))?.children ?? []) as { props?: Record<string, unknown> }[]
  expect(rows.length).toBeGreaterThanOrEqual(3)
  for (const row of rows) expect(row.props?.mono).toBe(true)
  await ui.unmount()
})
