// How a worker's end is seen: its toast, its bubble, its line here when its
// report goes elsewhere, and its card for half a minute.
import { expect } from 'claude-code/testing'
import { declarePlan } from '../src/progress/plan'
import { JUST_ENDED_MS } from '../src/progress/runs'
import { endNotice } from '../src/progress/text/ended'
import { PANE, SLOW, cellText, frameRows, mountSaid, progress, progressCrew, spawnAgent, test, textIn, wokenCrew } from './support/crew'
import type { Said } from './support/crew'

test("a worker's end bubble says how long its run took when the notification does not, and where a stopped run stopped", SLOW, async ($, on) => {
  const { clock, delegate, end } = await progressCrew($, on)
  await delegate('Migrate the schema', '/work/db', 'Migración')
  await progress($, 'agent-1', 2, 4, 'Migrar')
  await clock.advance(372_000)
  await end('agent-1', 'aborted')
  const note = (status: string, durationMs?: number): Said => ({
    text: 'Agent "Migración" finished',
    origin: { kind: 'task-notification' },
    isExpanded: false,
    task: { id: 'agent-1', status, ...(durationMs !== undefined ? { durationMs } : {}) },
  })
  const measured = await mountSaid($, 'end-a', note('killed'))
  expect((await frameRows(measured))[0]).toMatch(/^╭─ Pip → Nova · ■ stopped · step 2\/4 · 6m 12s ─+╮$/)
  await measured.unmount()
  // The notification's own time comes first; a finished run names no step.
  const own = await mountSaid($, 'end-b', note('completed', 4000))
  expect((await frameRows(own))[0]).toMatch(/^╭─ Pip → Nova · ✓ done · 4s ─+╮$/)
  await own.unmount()
})

test("a run's end toast says who, how, the task and the time; a failed or stopped one the step it stopped on", () => {
  expect(endNotice({ id: 'a', name: 'Pip', end: 'done', doing: 'Arreglar tests', plan: declarePlan(undefined, 4, 4, 'x'), ms: 725_000 })).toBe('✓ Pip finished: Arreglar tests · 12m 5s')
  expect(endNotice({ id: 'b', name: 'Bolt', end: 'failed', doing: 'Revisar README', plan: declarePlan(undefined, 2, 4, 'x'), ms: 180_000 })).toBe('× Bolt failed: Revisar README · step 2/4 · 3m 0s')
  expect(endNotice({ id: 'c', name: 'Mika', end: 'stopped', doing: '', ms: 4_000 })).toBe('■ Mika stopped · 4s')
})

test("a worker whose report goes to its parent ends in one line of its own here, once the main turn is over; one reporting here, in its bubble alone", async ($, on) => {
  const { clock, placed, toasts, delegate, end, mainTurn, lines } = await progressCrew($, on)
  await delegate('Investigate the checkout', '/work/shop', 'Checkout')
  await spawnAgent($, { prompt: 'File the tickets', description: 'Tickets', subagentType: 'general-purpose', parentAgentId: 'agent-1' })
  await spawnAgent($, { prompt: 'Fix the cart', description: 'Carrito', subagentType: 'general-purpose', parentAgentId: 'agent-1' })
  await progress($, 'agent-3', 2, 4, 'Probar')
  await clock.advance(65_000)

  // Their reports go to Pip, so their ends wait for Nova's turn to end.
  const done = await mainTurn()
  await end('agent-2')
  await end('agent-3', 'error')
  await clock.advance(3000)
  expect(placed).toEqual([])
  await done()
  await clock.advance(1000)
  expect(placed).toHaveLength(2)
  expect(await lines(placed[0]!)).toEqual(['✓ Bolt finished: Tickets · 1m 5s'])
  expect(await lines(placed[1]!)).toEqual(['× Mika failed: Carrito · step 2/4 · 1m 5s'])

  // Pip's report comes here: its bubble is its line. What is placed is the
  // round's summary, now that nobody works, and no line of Pip's end.
  await end('agent-1')
  await clock.advance(5000)
  const after = await Promise.all(placed.slice(2).map(id => lines(id)))
  expect(after.map(rows => rows[0])).toEqual([expect.stringMatching(/^─ crew · round over · /)])
  expect(toasts).toEqual(['✓ Bolt finished: Tickets · 1m 5s', '× Mika failed: Carrito · step 2/4 · 1m 5s', '✓ Pip finished: Checkout · 1m 9s'])
})

test('an agent its worker woke ends in one line here, its report going to that worker', async ($, on) => {
  const placed: string[] = []
  on('ui.place', (_, e) => {
    placed.push(e.id)
    return { value: { isPlaced: true as const, requestId: e.id } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  const { clock, done } = await wokenCrew($, on)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'm1', reason: 'answer' })
  await clock.advance(30_000)
  // Each of Bolt's reports goes to Pip, the first and the one Pip woke it
  // for; Pip's comes here, in its bubble. Pip's messages to Bolt have their
  // lines among them, in the order they came.
  await done('agent-2')
  await done('agent-1')
  await clock.advance(2000)
  const first = async (id: string) => {
    const ui = await $.ui.mount({ plugin: 'crew', surface: 'terminal', component: 'Placed', requestId: id, props: { id, plugin: 'crew' }, viewport: { columns: 80, rows: 40 } })
    const box = await ui.find({ type: 'Box' })
    await ui.unmount()
    return textIn(box?.children?.[0])
  }
  expect(await Promise.all(placed.map(first))).toEqual([
    '● Pip → Bolt: Pip: are you on router.ts?',
    '✓ Bolt finished: Session bus · 0s',
    '● Pip → Bolt: Pip: both fixed · wakes it',
    '✓ Bolt finished: Session bus · 30s',
    expect.stringMatching(/^─ crew · round over · /),
  ])
})

test("a worker's end is seen at once: a toast, and for half a minute its card's word standing out and its figure cheering", async ($, on) => {
  const { clock, toasts, delegate, end } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await progress($, 'agent-1', 1, 4, 'Leer')
  await progress($, 'agent-2', 2, 4, 'Leer')
  await clock.advance(65_000)
  await end('agent-1')
  await end('agent-2', 'aborted')
  expect(toasts).toEqual(['✓ Pip finished: Arreglar tests · 1m 5s', '■ Bolt stopped: Revisar README · step 2/4 · 1m 5s'])

  // The engine has Pip free since, yet its card keeps the row, its word in
  // a block of its color, and its figure cheers instead of napping.
  await clock.advance(5000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^done$/ }))?.props).toMatchObject({ bold: true, inverse: true, color: 'success' })
  expect((await ui.find({ type: 'Text', text: /^stop$/ }))?.props).toMatchObject({ bold: true, inverse: true, color: 'warning' })
  let marks = ''
  for (let k = 0; k < 4; k++) {
    marks += cellText(String((await ui.find({ type: 'Raster', key: 'w-agent-1' }))?.props.cells))
    await clock.advance(1200)
    await ui.redraw()
  }
  expect(marks).not.toMatch(/z/)

  // Then Pip, asleep for long, leaves the row; Bolt keeps its word as before.
  await clock.advance(JUST_ENDED_MS)
  await ui.redraw()
  expect(await ui.find({ key: 'view-agent-1' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^stop$/ }))?.props.inverse).not.toBe(true)
  await ui.unmount()
  expect(toasts).toHaveLength(2)
})
