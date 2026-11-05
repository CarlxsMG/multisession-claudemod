import { expect } from 'claude-code/testing'
import { DEFAULT_LOOK } from '../src/figure/look'
import { lookCode } from '../src/figure/share-code'
import { COMPOSER, NOVA_OFF, NOVA_ON, PANE, composeBrief, crewCommand, engine, startTold, test } from './support/crew'

test('switching the mode or the name leaves the brief and the delegate tool as they were', async ($, on) => {
  const seen = { prompts: [] as string[], sends: [] as string[], tools: [] as string[] }
  engine(on, { seen })
  on('prompt.compose', () => ({ sections: [] }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const before = (await composeBrief($))?.text
  expect(before).toMatch(/\nCrew: delegation was ON when this brief was written/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'mode' })
  expect((await composeBrief($))?.text).toBe(before)
  await ui.press({ key: 'mode' })
  await ui.unmount()
  await crewCommand($, 'mode off')
  await crewCommand($, `import ${lookCode({ ...DEFAULT_LOOK, name: 'Luna' })}`)
  expect((await composeBrief($))?.text).toBe(before)
  expect(seen.tools).toHaveLength(1)
})

test('the next message carries one "[crew]" note with the latest state, and the one after none', async ($, on) => {
  engine(on)
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)
    return { text: e.text }
  })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const submit = (text: string) => $.prompt.submit({ text, wait: false, origin: COMPOSER })

  await submit('Hola')
  expect(contexts[0]).toBeUndefined()
  await crewCommand($, 'mode off')
  await crewCommand($, `import ${lookCode({ ...DEFAULT_LOOK, name: 'Luna', vibe: 'pirate' })}`)
  expect((await submit('Arregla el login')).text).toBe('Arregla el login')
  expect(contexts[1]).toHaveLength(1)
  expect(contexts[1]![0]).toBe(
    '[crew] The user changed the crew settings. Delegation is OFF: do the work yourself; use the crew only when the user asks. ' +
      'You are Luna. Persona: Luna is a jolly pirate captain (a light "arr" now and then, never in code or technical text). ' +
      'Let it color greetings and short status lines only; technical content stays precise and plain.',
  )
  await submit('Y los tests')
  expect(contexts[2]).toBeUndefined()

  // A switch to the mode it already has says nothing; back on, it does.
  await crewCommand($, 'mode off')
  await submit('Sigue')
  expect(contexts[3]).toBeUndefined()
  await crewCommand($, 'mode on')
  await submit('Reparte')
  expect(contexts[4]![0]).toMatch(/^\[crew\] The user changed the crew settings\. Delegation is ON: you orchestrate, per the crew brief\. You are Luna\./)
})

test('settings changed after the last note went out are told with the first message of the next load', async ($, on) => {
  const { contexts, submit } = await startTold($, on, { 'sess-1': NOVA_ON }, false)
  await submit('Hola')
  await submit('Sigue')
  expect(contexts[0]).toHaveLength(1)
  expect(contexts[0]![0]).toMatch(/^\[crew\] The user changed the crew settings\. Delegation is OFF: do the work yourself; .* You are Nova\./)
  expect(contexts[1]).toBeUndefined()
  // The note sent is now the last one told: another load says nothing.
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await submit('Otra vez')
  expect(contexts[2]).toBeUndefined()
})

test('settings that match the last note sent are not told again', async ($, on) => {
  const { contexts, submit } = await startTold($, on, { 'sess-1': NOVA_ON }, true)
  await submit('Hola')
  expect(contexts).toEqual([undefined])
})

test('each conversation is told against its own last note', async ($, on) => {
  // A got OFF last, then B got ON: back in A, ON is news.
  const id = { now: 'sess-A' }
  const { contexts, submit } = await startTold($, on, { 'sess-A': NOVA_OFF, 'sess-B': NOVA_ON }, true, id)
  await submit('Hola')
  expect(contexts[0]![0]).toMatch(/^\[crew\] The user changed the crew settings\. Delegation is ON/)
  // A new conversation reads a brief that already says ON: no note.
  id.now = 'sess-C'
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await submit('Empezamos')
  expect(contexts[1]).toBeUndefined()
  // After a /clear (another id, no new load) the brief still says ON: OFF is news.
  await crewCommand($, 'mode off')
  await submit('Sin equipo')
  expect(contexts[2]![0]).toMatch(/Delegation is OFF/)
  id.now = 'sess-D'
  await submit('Otra conversación')
  expect(contexts[3]![0]).toMatch(/Delegation is OFF/)
  await submit('Sigue')
  expect(contexts[4]).toBeUndefined()
})
