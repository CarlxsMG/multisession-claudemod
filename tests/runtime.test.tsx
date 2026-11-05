// What a load keeps in memory beside its atoms starts afresh with each
// session: a reload reads again only the modules whose code changed, and
// the others' bookkeeping must not outlive the session it was kept for.
import { expect } from 'claude-code/testing'
import { DELEGATE, SLOW, engine, mountSaid, test } from './support/crew'

test("a session started again in the same load keeps nothing of the earlier one's bookkeeping", SLOW, async ($, on) => {
  const clock = engine(on)
  const logged: string[] = []
  on('ui.log', (_, e) => {
    if (e.to === 'debug' && e.text.startsWith('crew: unrecognized task notification')) logged.push(e.text)
    return { value: undefined }
  })
  // Haiku answers with no lines the crew can read.
  let asked = 0
  on('model.complete', () => {
    asked++
    return { value: { isAnswered: true as const, text: 'Sorry, no lines today.', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  })
  let rows = 0
  const endsTimedOut = async () => {
    const ui = await mountSaid($, `end-${++rows}`, { text: 'Agent "Tarea" finished', origin: { kind: 'task-notification' }, isExpanded: false, task: { id: 'agent-1', status: 'timeout' } })
    await ui.unmount()
  }

  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Haz la tarea', title: 'Tarea', repo: '/work/api' })
  // A personality Haiku could not write for is not asked for again, and a
  // wording the crew does not know is logged once, in this session.
  await clock.advance(60_000)
  await clock.advance(60_000)
  expect(asked).toBe(1)
  await endsTimedOut()
  await endsTimedOut()
  expect(logged).toEqual(['crew: unrecognized task notification status: timeout'])

  // The next session of the load asks again, and logs again.
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await clock.advance(60_000)
  expect(asked).toBe(2)
  await endsTimedOut()
  expect(logged).toEqual(['crew: unrecognized task notification status: timeout', 'crew: unrecognized task notification status: timeout'])
})
