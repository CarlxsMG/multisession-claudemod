import { expect } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { DEFAULT_LOOK } from '../src/figure/look'
import { PANE, SLOW, WRITTEN, crewCommand, engine, test } from './support/crew'

// The orchestrator's figure as a screen reader hears it: the shortest word
// of the pane's that tells its language.
async function orchAlt($: Parameters<TestBody>[0]) {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const alt = (await ui.findAll({ type: 'Svg' }))[0]?.props.alt
  await ui.unmount()
  return alt
}

test('Haiku writes the mood lines in the language the crew speaks, and again in another', { ...SLOW, options: { language: 'auto' } }, async ($, on) => {
  const clock = engine(on, { stored: { look: { ...DEFAULT_LOOK, phrase: 'Ship it' } } })
  let language = 'english'
  on('settings.read', () => ({ value: { language } }))
  const prompts: string[] = []
  on('model.complete', (_, e) => {
    prompts.push(e.prompt)
    return {
      value: {
        isAnswered: true as const,
        text: WRITTEN,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await clock.advance(60_000)
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toMatch(/^Write short status lines in English for Nova, /)

  // The batch kept is the English one: a session in Spanish asks anew,
  // the same look as before.
  language = 'spanish'
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await clock.advance(60_000)
  expect(prompts).toHaveLength(2)
  expect(prompts[1]).toBe(prompts[0]!.replace(' in English ', ' in Spanish '))
})

test('with `auto` and no language set in Claude Code the crew speaks English', { options: { language: 'auto' } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: true })
  expect(await orchAlt($)).toBe('Nova, the orchestrator')
})

test('with `auto` the crew speaks the language Claude Code is set to', { options: { language: 'auto' } }, async ($, on) => {
  engine(on)
  on('settings.read', () => ({ value: { language: 'Español' } }))
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: true })
  expect(await orchAlt($)).toBe('Nova, el orquestador')
})

test("the crew's own `language` option wins over Claude Code's", { options: { language: 'en' } }, async ($, on) => {
  engine(on)
  on('settings.read', () => ({ value: { language: 'spanish' } }))
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: true })
  expect(await orchAlt($)).toBe('Nova, the orchestrator')
})

test('the pane and the editor in English', { options: { language: 'en' } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Run the tests', repo: '/work/api' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /^Nova · Cheerful · / })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^1 worker · 1 active$/ })).toBeDefined()
  expect((await ui.find({ key: 'mode' }))?.props.label).toBe('Delegate: ON')
  expect((await ui.find({ key: 'edit' }))?.text).toBe(' Edit ')
  expect((await ui.find({ key: 'view-agent-1' }))?.props.label).toBe('View Pip')

  await ui.press({ key: 'edit' })
  // A new orchestrator's catchphrase is the language's own.
  expect(await ui.find({ type: 'Text', text: /^Let’s go!$/ })).toBeDefined()
  const tabs = await Promise.all(['persona', 'face', 'hair', 'clothes', 'extras', 'share'].map(id => ui.find({ key: `tab-${id}` })))
  expect(tabs.map(tab => tab?.props.label)).toEqual(['Character', 'Face', 'Head', 'Body', 'Extras', 'Share'])
  await ui.press({ key: 'tab-hair' })
  await ui.press({ key: 'next-hair' })
  expect(await ui.find({ type: 'Text', text: /^Tuft\s*$/ })).toBeDefined()
  expect((await ui.find({ key: 'next-hair' }))?.props.label).toBe('Shape: next')
  await ui.press({ key: 'hairColor-3' })
  expect(await ui.find({ type: 'Text', text: /^Ginger$/ })).toBeDefined()
  const done = await ui.find({ key: 'look-done' })
  expect([done?.props.label, done?.props.hotkey]).toEqual(['Done', 'd'])

  await ui.unmount()
})

test('/crew answers in English and takes the verbs of either language', { options: { language: 'en' } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  expect((await crewCommand($, 'help')).text).toMatch(/^\/crew {18}opens the pane\n\/crew team {13}every worker, one to a row\n/)
  expect((await crewCommand($, 'team')).text).toBe("Nova's crew is open.")
  expect((await crewCommand($, 'equipo')).text).toBe("Nova's crew is open.")
  expect((await crewCommand($, 'msg Pip')).text).toBe('Usage: /crew msg <worker> <text>')
  expect((await crewCommand($, 'mode off')).text).toBe('Nova will work without delegating.')
})
