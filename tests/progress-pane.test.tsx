// What the pane shows of a crew at work: the team view and the line under
// each name on the cards, and how progress keeps to a narrow terminal on
// every surface.
import { expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { DIAMOND_W } from '../src/figure/diamond'
import { declarePlan } from '../src/progress/plan'
import { cardLine, cardText } from '../src/progress/text/card'
import { en } from '../src/i18n/en'
import { es } from '../src/i18n/es'
import { COMPOSER, PANE, SAME_EVERYWHERE, cardLines, crewCommand, progress, progressCrew, teamTexts, test } from './support/crew'

test("the team view gives each worker its phase, and its run's calls and time or its last run's", async ($, on) => {
  const { clock, delegate, end } = await progressCrew($, on)
  await delegate('Run the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'agent-1' })
  await $.tool.call({ tool: 'Read', file_path: '/work/web/README.md', agentId: 'agent-2' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/web/README.md', old_string: 'a', new_string: 'b', agentId: 'agent-2' })
  await clock.advance(72_000)
  await end('agent-2')
  await clock.advance(4000)
  await crewCommand($, 'team')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^testing$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^1m · 1 call$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^last 1m 12s · 2 calls$/ })).toBeDefined()
  // The cards of the main view stay as they were.
  await ui.press({ key: 'crew-back' })
  expect(await ui.find({ type: 'Text', text: /\d calls?\b/ })).toBeUndefined()
  await ui.unmount()
})

test('what a worker does stays whole in the team view and the check-ins', async ($, on) => {
  const { clock, placed, delegate, lines } = await progressCrew($, on)
  await delegate('Build the app', '/work/app', 'Compilar')
  await $.tool.call({ tool: 'Bash', command: 'npm run build -- --verbose', agentId: 'agent-1' })
  await clock.advance(180_000)
  expect((await cardLines($)).map(c => c.text)).toEqual(['3m'])
  expect(await lines(placed[0]!)).toEqual(['─ crew · 1 active · round 3m', '  Pip  running  3m  Bash npm run build -- --verbose'])
  expect(await teamTexts($)).toContain('Bash npm run build -- --verbose')
})

// The words the width tests look for, in each language they run in.
const WIDTH_WORDS = {
  en: { team: 'team', calls: /\bcalls?\b/, step: /^step /, share: /% of the steps$/, running: 'running' },
  es: { team: 'equipo', calls: /llamada/, step: /^paso /, share: /% de los pasos$/, running: 'ejecutando' },
}

for (const [columns, language] of [
  [48, 'en'],
  [34, 'en'],
  [48, 'es'],
  [34, 'es'],
] as const) {
  const words = WIDTH_WORDS[language]
  test(`progress fits ${columns} columns in ${language}: the status line, the placed rows and the team view`, { options: { language } }, async ($, on) => {
    const { clock, status, placed, delegate, end, lines } = await progressCrew($, on)
    const step = 'Un paso con un nombre bastante largo para cualquier columna'
    for (let i = 1; i <= 5; i++) {
      await delegate(`Task ${i}`, `/work/r${i}`, `Una tarea con un título bastante largo, la número ${i}`)
      await $.tool.call({ tool: 'Bash', command: `npm run build -- --project packages/app-${i} --verbose`, agentId: `agent-${i}` })
    }
    // Bolt three of five, Mika a plan that grew, Rex one of ten; Pip and the
    // fifth have none.
    await progress($, 'agent-2', 3, 5, step)
    await progress($, 'agent-3', 0, 4, step)
    await progress($, 'agent-3', 2, 12, step)
    await progress($, 'agent-4', 1, 10, step)
    await $.command.run({ command: 'crew', args: words.team, origin: COMPOSER, presentation: { isFullscreen: false, columns } })
    await clock.advance(200_000)
    const line = status()!
    expect(line.length).toBeLessThanOrEqual(columns - 2)
    expect(line).toMatch(new RegExp(`^crew · Pip ${words.running} 3m · .*\\+\\d$`))
    expect(line).toMatch(SAME_EVERYWHERE)

    const team = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: columns } })
    const planLines = await team.findAll({ type: 'Text', text: new RegExp(`${words.calls.source}|${words.step.source}|${words.share.source}|≈`) })
    // Three planned runs give their step and share, two of them a guess;
    // the other two their time and calls.
    const kinds = (re: RegExp) => planLines.filter(t => re.test(t.text)).length
    expect([kinds(words.step), kinds(words.share), kinds(/^≈/), kinds(words.calls)]).toEqual([3, 3, 2, 2])
    for (const t of planLines) {
      expect(t.text.length).toBeLessThanOrEqual(columns - DIAMOND_W - 1)
      expect(t.text).toMatch(SAME_EVERYWHERE)
    }
    await team.unmount()

    // A whole check-in, then folded under the summary, which is whole.
    expect(placed).toHaveLength(1)
    const whole = await lines(placed[0]!, columns)
    expect(whole).toHaveLength(6)
    for (let i = 1; i <= 5; i++) await end(`agent-${i}`, i === 3 ? 'error' : 'answer')
    await clock.advance(1000)
    expect(placed).toHaveLength(2)
    const folded = await lines(placed[0]!, columns)
    expect(folded).toHaveLength(1)
    const summary = await lines(placed[1]!, columns)
    expect(summary).toHaveLength(6)
    for (const row of [...whole, ...folded, ...summary]) {
      expect(row.length).toBeLessThanOrEqual(columns - 6)
      expect(row).toMatch(SAME_EVERYWHERE)
    }
    expect(summary[3]).toMatch(/^  × Mika/)

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: columns } })
    const runLines = await ui.findAll({ type: 'Text', text: words.calls })
    expect(runLines).toHaveLength(5)
    for (const t of runLines) expect(t.text.length).toBeLessThanOrEqual(columns - DIAMOND_W - 1)
    await ui.unmount()
  })
}

test("a card's line is the step and total, the step and a cut total, or the run's time, in four columns", () => {
  const run = { id: 'a', startedAt: 0, endedAt: 0, end: '' as const, tools: 0, phase: 'thinking' as const, phaseAt: 0, touchedAt: 0 }
  expect([40_000, 372_000, 99 * 60_000, 125 * 60_000].map(ms => cardLine(run, ms, DIAMOND_W))).toEqual(['40s', '6m', '99m', '2h'])
  const at = (step: number, total: number) => cardLine({ ...run, plan: declarePlan(undefined, step, total, 'x') }, 0, DIAMOND_W)
  // Too wide, the step stays and the total is cut: the status line and the
  // team view give it whole.
  expect([at(0, 6), at(3, 5), at(9, 12), at(10, 12), at(12, 12), at(100, 120)]).toEqual(['0/6', '3/5', '9/12', '10/…', '12/…', '100'])
})

test("a card gives its worker's step under the name: 0/6 once the plan is declared, then 3/5", async ($, on) => {
  const { clock, delegate } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  await $.tool.call({ tool: 'Read', file_path: '/work/api/a.ts', agentId: 'agent-1' })
  await clock.advance(42_000)
  expect((await cardLines($)).map(c => c.text)).toEqual(['42s'])
  await progress($, 'agent-1', 0, 6, 'Plan')
  expect((await cardLines($)).map(c => c.text)).toEqual(['0/6'])
  await progress($, 'agent-1', 3, 5, 'Escribir tests')
  expect((await cardLines($)).map(c => c.text)).toEqual(['3/5'])
})

test("a card's word for a status fits its four columns: wait, done, fail, stop, init, and nothing for a free worker", () => {
  const run = { id: 'a', startedAt: 0, endedAt: 0, end: '' as const, tools: 0, phase: 'thinking' as const, phaseAt: 0, touchedAt: 0 }
  const planned = { ...run, plan: declarePlan(undefined, 3, 5, 'x') }
  const ended = { ...run, endedAt: 1000, end: 'done' as const }
  const at = (status: Parameters<typeof cardText>[0], r: Parameters<typeof cardText>[1] = run) => cardText(status, r, 372_000, DIAMOND_W)
  expect([at('working'), at('working', planned), cardText('working', undefined, 0, DIAMOND_W), at('working', ended)]).toEqual(['6m', '3/5', 'work', 'work'])
  // Waiting is all a waiting worker's card says, plan or not.
  expect([at('waiting'), at('waiting', planned)]).toEqual(['wait', 'wait'])
  // A worker starting says so until it declares a plan.
  expect([at('starting'), at('starting', { ...run, plan: declarePlan(undefined, 0, 6, 'x') })]).toEqual(['init', '0/6'])
  expect([at('done', ended), at('failed', ended), at('stopped', ended), at('idle', ended)]).toEqual(['done', 'fail', 'stop', ''])
  for (const words of [en, es]) for (const word of Object.values(words.pane.card)) expect(word.length).toBeLessThanOrEqual(DIAMOND_W)
})

for (const columns of [48, 34]) {
  test(`in a pane ${columns} wide each card's line is its step, time or a four-letter word, and the team view keeps the pane's words`, async ($, on) => {
    const { clock, states, delegate, end } = await progressCrew($, on)
    for (let i = 1; i <= 7; i++) await delegate(`Task ${i}`, `/work/r${i}`, `Una tarea larga, la número ${i}`)
    // Pip on a step, Bolt with no plan, Mika waiting, the fourth failed, the
    // fifth stopped, the sixth still starting and the seventh done.
    await $.tool.call({ tool: 'Read', file_path: '/work/r1/a.ts', agentId: 'agent-1' })
    await progress($, 'agent-1', 3, 5, 'Escribir tests')
    await $.tool.call({ tool: 'Bash', command: 'npm run build -- --project packages/app --verbose', agentId: 'agent-2' })
    await progress($, 'agent-3', 2, 4, 'Esperar la revisión')
    states.set('agent-3', 'waiting')
    states.set('agent-6', 'pending')
    await clock.advance(180_000)
    await end('agent-4', 'error')
    await end('agent-5', 'aborted')
    await end('agent-7')
    states.set('agent-7', 'completed')
    await clock.advance(1000)
    const cards = await cardLines($, columns)
    expect(cards.map(c => c.text).sort()).toEqual(['3/5', '3m', 'done', 'fail', 'init', 'stop', 'wait'])
    for (const c of cards) {
      expect(c.text.length).toBeLessThanOrEqual(DIAMOND_W)
      expect(c.text).toMatch(SAME_EVERYWHERE)
    }
    const texts = await teamTexts($)
    for (const word of ['waiting', 'failed', 'stopped', 'starting', 'done']) expect(texts).toContain(word)
  })
}

// The atoms the pane draws a worker from: each write of either draws it whole.
const countWrites = (on: On) => {
  const writes = { workers: 0, runs: 0 }
  on('state.set', { plugin: 'crew', key: 'workers' }, (_, e, next) => {
    writes.workers += 1
    return next(e)
  })
  on('state.set', { plugin: 'crew', key: 'runs' }, (_, e, next) => {
    writes.runs += 1
    return next(e)
  })
  return writes
}

const read = (agentId: string, i: number) => ({ tool: 'Read', file_path: `/work/api/src/f${i}.ts`, agentId }) as const

test("a busy worker's calls between two of the pane's frames are written once, at the next, and each one counts", async ($, on) => {
  const writes = countWrites(on)
  const { clock, delegate } = await progressCrew($, on)
  await delegate('Read the session bus', '/work/api', 'Session bus')
  await $.tool.call(read('agent-1', 0))
  await clock.advance(400)
  writes.workers = 0
  writes.runs = 0

  for (let i = 1; i <= 20; i++) await $.tool.call(read('agent-1', i))
  expect(writes).toEqual({ workers: 0, runs: 0 })

  await clock.advance(400)
  expect(writes).toEqual({ workers: 1, runs: 1 })
  const roster = String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  expect(roster).toMatch(/^- Pip: address "[^"]+", working \(Read f20\.ts\), .*, 21 tool calls, /m)
  expect(await teamTexts($)).toContainEqual(expect.stringMatching(/^\d+s · 21 calls$/))
})

test('a run that ends before the next frame counts every call, and its worker ends doing nothing', async ($, on) => {
  const { clock, delegate, end } = await progressCrew($, on)
  await delegate('Read the session bus', '/work/api', 'Session bus')
  for (let i = 0; i < 5; i++) await $.tool.call(read('agent-1', i))
  await end('agent-1')
  const roster = async () => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  expect(await roster()).toMatch(/^- Pip: address "pip", idle, repo /m)
  expect(await teamTexts($)).toContainEqual(expect.stringMatching(/^last \d+s · 5 calls$/))

  // The next frame has nothing left to write.
  await clock.advance(400)
  expect(await roster()).toMatch(/^- Pip: address "pip", idle, repo /m)
  expect(await teamTexts($)).toContainEqual(expect.stringMatching(/^last \d+s · 5 calls$/))
})
