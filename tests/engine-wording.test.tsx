// The engine's texts and answers the crew reads: each shape it knows logs
// nothing, and one it does not know is a line in the debug log, once.
import { expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { DELEGATE, NO_VERDICT, PANE, engine, frameRows, mountSaid, test, usageReply } from './support/crew'
import type { Seen } from './support/crew'

// The debug log's lines that say the crew did not recognize what the engine
// said, of the kinds named `kind` or starting with it.
function unrecognizedLines(on: On, kind: string) {
  const lines: string[] = []
  on('ui.log', (_, e) => {
    if (e.to === 'debug' && e.text.startsWith(`crew: unrecognized ${kind}`)) lines.push(e.text)
    return { value: undefined }
  })
  return lines
}

test('a usage probe answer without the model windows is logged once, and the answer the crew reads is not', async ($, on) => {
  let answer = usageReply(30)
  const clock = engine(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 12 }], probe: () => answer })
  const logged = unrecognizedLines(on, 'usage probe answer')
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const fable = async () => {
    await ui.redraw()
    return (await ui.find({ type: 'Text', text: /^fable\s+\d+%$/ }))?.text.replace(/\s+/g, ' ')
  }
  expect(await fable()).toBe('fable 30%')
  expect(logged).toEqual([])

  // The next probe finds Fable's week under a name the crew does not read.
  // The pane, shown, draws itself again while the clock moves.
  const measure = async (ms: number) => {
    await clock.advance(ms)
    await ui.redraw()
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 13 }], changed: ['rateLimits'] })
  }
  answer = renamedReply
  await measure(3 * 60_000)
  expect(await fable()).toBeUndefined()
  // An answer with no window the crew reads doubles the wait for the next probe.
  answer = ''
  await measure(6 * 60_000)
  await fable()
  expect(logged).toEqual(['crew: unrecognized usage probe answer: get_usage answered rate_limits without model_scoped'])
  await ui.unmount()
})

test("a spawn refusal in auto mode's words the crew does not know is said as it came, and logged once", async ($, on) => {
  const seen: Seen = { prompts: [], sends: [], refuse: 'A hook refused this Agent call.' }
  engine(on, { seen })
  const logged = unrecognizedLines(on, 'auto-mode spawn refusal')
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const delegate = async (repo: string) => String((await $.tool.call({ tool: DELEGATE, task: 'Clean up', repo })).result)

  // A refusal in other words than auto mode's missing verdict is said as it is.
  expect(await delegate('/work/api')).toBe('crew: could not start a worker: A hook refused this Agent call.')
  expect(logged).toEqual([])

  const reworded = 'Auto mode could not review this Agent call: no request asked for its verdict.'
  seen.refuse = reworded
  expect(await delegate('/work/api')).toBe(`crew: could not start a worker: ${reworded}`)
  seen.refuse = 'Auto mode blocked this action: it deletes the repository.'
  await delegate('/work/web')
  expect(logged).toEqual([`crew: unrecognized auto-mode spawn refusal: ${reworded}`])

  // The missing verdict hands the start on, and logs nothing.
  seen.refuse = NO_VERDICT
  expect(await delegate('/work/api')).toMatch(/^crew: nothing started: auto mode reviews only calls you write/)
  expect(logged).toEqual([`crew: unrecognized auto-mode spawn refusal: ${reworded}`])
})

// A get_usage answer whose model windows are under another name.
const renamedReply = JSON.stringify({
  type: 'control_response',
  response: {
    subtype: 'success',
    request_id: 'crew-usage',
    response: { rate_limits: { five_hour: null, model_windows: [{ display_name: 'Fable', utilization: 30 }] } },
  },
})

test("a worker's end with a status its bubble does not mark, or under another kind, is logged once", async ($, on) => {
  engine(on)
  const logged = unrecognizedLines(on, 'task notification')
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Haz la tarea', title: 'Tarea', repo: '/work/api' })
  let rows = 0
  const ended = async (status?: string, kind: 'task-notification' | 'unclassified' = 'task-notification') => {
    const ui = await mountSaid($, `end-${++rows}`, {
      text: 'Agent "Tarea" finished',
      origin: { kind },
      isExpanded: false,
      task: { id: 'agent-1', ...(status !== undefined ? { status } : {}) },
    })
    const drawn = await ui.drawn()
    const top = (await frameRows(ui))[0]
    await ui.unmount()
    return { type: drawn.type, top }
  }

  for (const status of ['completed', 'failed', 'killed', undefined]) await ended(status)
  expect(logged).toEqual([])

  // Another word is drawn as it came.
  expect((await ended('timeout')).top).toMatch(/^╭─ Pip → Nova · timeout ─+╮$/)
  await ended('expired')
  expect(logged).toEqual(['crew: unrecognized task notification status: timeout'])

  // A notification under another kind is the engine's row.
  expect((await ended('completed', 'unclassified')).type).toBe('engine')
  await ended('completed', 'unclassified')
  expect(logged).toEqual(['crew: unrecognized task notification status: timeout', 'crew: unrecognized task notification origin: unclassified'])
})
