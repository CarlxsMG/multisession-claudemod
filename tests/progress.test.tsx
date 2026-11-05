import { expect, mock } from 'claude-code/testing'
import { DIAMOND_W } from '../src/figure/diamond'
import { parseEvery } from '../src/progress/check-in'
import { STICK_MS, isTestRun, nextPhase, phaseLabel, phaseOf } from '../src/progress/phase'
import { declarePlan, hasGrown, stepBar, stepShare, stepsLeft, todoPlan } from '../src/progress/plan'
import { JUST_ENDED_MS } from '../src/progress/runs'
import { cardLine, cardText } from '../src/progress/text/card'
import { CARD_LABEL } from '../src/ui/labels'
import { endNotice } from '../src/progress/text/ended'
import { notePieces } from '../src/progress/text/note'
import { statusText } from '../src/progress/text/status-line'
import { COMPOSER, DELEGATE, PANE, SAME_EVERYWHERE, SLOW, cardLines, cellText, crewCommand, engine, frameRows, mountSaid, progress, progressCrew, spawnAgent, teamTexts, test, textIn, wokenCrew, workerSend } from './support/crew'
import type { Said } from './support/crew'

// ---- progress ----

test("a worker's phase comes from the kinds of its calls, and reading between edits is still editing", () => {
  expect(phaseOf({ tool: 'Read', file_path: '/a.ts' })).toBe('reading')
  for (const tool of ['Grep', 'Glob']) expect(phaseOf({ tool })).toBe('reading')
  for (const tool of ['Edit', 'Write', 'NotebookEdit']) expect(phaseOf({ tool })).toBe('editing')
  expect(phaseOf({ tool: 'Bash', command: 'git status' })).toBe('running')
  expect(phaseOf({ tool: 'PowerShell', command: 'Get-ChildItem' })).toBe('running')
  for (const command of [
    'npm test',
    'npm run test -- --watch=false',
    'pnpm test',
    'npx vitest run',
    'pytest -q tests/',
    'python -m pytest',
    'cd api && go test ./...',
    'cargo test',
    'claude plugin test .',
    './gradlew :app:test',
    'dotnet test',
  ]) {
    expect([command, phaseOf({ tool: 'Bash', command })]).toEqual([command, 'testing'])
  }
  for (const command of ['npm install', 'echo test', 'git commit -m "add a test"', 'cat tests/a.test.ts', 'npm run build']) {
    expect([command, isTestRun(command)]).toEqual([command, false])
  }
  expect(phaseOf({ tool: 'Bash', command: 'sleep 30' })).toBe('waiting')
  for (const tool of ['WebSearch', 'WebFetch', 'mcp__plugin_playwright_playwright__browser_click']) expect(phaseOf({ tool })).toBe('web')
  for (const tool of ['Agent', 'SendMessage', 'TaskStop']) expect(phaseOf({ tool })).toBe('delegating')
  expect(phaseOf({ tool: 'Monitor' })).toBe('waiting')
  for (const tool of ['TodoWrite', 'Skill', 'mcp__github__get_issue']) expect(phaseOf({ tool })).toBeUndefined()

  // A look at a file while editing is part of the edit, until the edits stop.
  const editing = { phase: 'editing' as const, phaseAt: 0 }
  expect(nextPhase(editing, 'reading', STICK_MS - 1)).toEqual(editing)
  expect(nextPhase(editing, 'reading', STICK_MS)).toEqual({ phase: 'reading', phaseAt: STICK_MS })
  expect(nextPhase(editing, 'testing', 5)).toEqual({ phase: 'testing', phaseAt: 5 })
  expect(nextPhase({ phase: 'reading', phaseAt: 0 }, 'editing', 1)).toEqual({ phase: 'editing', phaseAt: 1 })
  expect(nextPhase(editing, undefined, 99_999)).toEqual(editing)
  expect((['thinking', 'reading', 'editing', 'running', 'testing', 'web', 'delegating', 'waiting'] as const).map(phaseLabel)).toEqual(['thinking', 'reading', 'editing', 'running', 'testing', 'browsing', 'delegating', 'waiting'])

  for (const [text, minutes] of [['1m', 1], ['2', 2], ['3min', 3], ['5m', 5], ['10m', 10], ['off', 0]] as const) expect(parseEvery(text)).toBe(minutes)
  for (const text of ['4m', '15m', 'soon', '']) expect(parseEvery(text)).toBeUndefined()
})

test('the status line names each active worker, its phase, its run time and its task, then each end for half a minute, and clears when none is', SLOW, async ($, on) => {
  const { clock, status, delegate, end } = await progressCrew($, on)
  await clock.advance(1000)
  expect(status()).toBeUndefined()

  expect(await delegate('Run the tests', '/work/api', 'Arreglar tests')).toMatch(/^Started Pip /)
  await clock.advance(1000)
  expect(status()).toBe('crew · Pip thinking 1s Arreglar tests')
  await $.tool.call({ tool: 'Read', file_path: '/work/api/a.ts', agentId: 'agent-1' })
  await clock.advance(60_000)
  expect(status()).toBe('crew · Pip reading 1m Arreglar tests')

  expect(await delegate('Review the README', '/work/web', 'Revisar README')).toMatch(/^Started Bolt /)
  await $.tool.call({ tool: 'Edit', file_path: '/work/web/README.md', old_string: 'a', new_string: 'b', agentId: 'agent-2' })
  await clock.advance(120_000)
  expect(status()).toBe('crew · Pip reading 3m Arreglar tests · Bolt editing 2m Revisar README')

  // Each end is marked after those at work, in the order they came.
  await end('agent-1')
  await clock.advance(1000)
  expect(status()).toBe('crew · Bolt editing 2m Revisar README · ✓ Pip done')
  await end('agent-2', 'error')
  await clock.advance(1000)
  expect(status()).toBe('crew · ✓ Pip done · × Bolt failed')
  await clock.advance(JUST_ENDED_MS - 2000)
  expect(status()).toBe('crew · × Bolt failed')
  await clock.advance(1000)
  expect(status()).toBeUndefined()

  // A reused worker's time is its new run's, from nothing.
  expect(await delegate('Now the login', '/work/api', 'Login')).toMatch(/^Given to Pip /)
  await clock.advance(1000)
  expect(status()).toBe('crew · Pip thinking 1s Login')
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'agent-1' })
  await clock.advance(120_000)
  expect(status()).toBe('crew · Pip testing 2m Login')
})

test('the status line gives up the titles first, then the ends, then the workers that do not fit', () => {
  const pip = { name: 'Pip', phase: 'editing' as const, ms: 360_000, title: 'Arreglar tests' }
  const bolt = { name: 'Bolt', phase: 'reading' as const, ms: 240_000, title: 'Revisar README', plan: declarePlan(undefined, 1, 4, 'Leer') }
  const ended = [{ name: 'Nube', end: 'done' as const }]
  const whole = 'crew · Pip editing 6m Arreglar tests · Bolt 1/4 4m Revisar README · ✓ Nube done'
  expect(statusText([pip, bolt], 200, ended)).toBe(whole)
  expect(statusText([pip, bolt], whole.length - 1, ended)).toBe('crew · Pip editing 6m · Bolt 1/4 4m · ✓ Nube done')
  expect(statusText([pip, bolt], 40, ended)).toBe('crew · Pip editing 6m · Bolt 1/4 4m')
  expect(statusText([pip, bolt], 30, ended)).toBe('crew · Pip editing 6m · +1')
  expect(statusText([], 80, ended)).toBe('crew · ✓ Nube done')
  expect(statusText([], 80)).toBe('')
  // A long title is cut to its room.
  expect(statusText([{ ...pip, title: 'Una tarea con un título bastante largo' }], 200)).toBe('crew · Pip editing 6m Una tarea con un título…')
})

test("a check-in row comes every 3 minutes of work when something changed, and waits for the orchestrator's turn to end", SLOW, async ($, on) => {
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
  expect(await lines(placed[2]!)).toEqual([
    '─ crew · 2 active · round 12m',
    '  Pip   editing   12m  Edit a.ts',
    '  Bolt  thinking   3m',
  ])
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

test('the newest check-in follows the round in place, its times once a minute; the rows before it keep what they showed', SLOW, async ($, on) => {
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

test('with check-ins off, as the store keeps them from an earlier session, no row comes, nor a summary', SLOW, async ($, on) => {
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

test('/crew progress 1m or 10m sets how often, in the store, and says so in a row; the reply says nothing', SLOW, async ($, on) => {
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
test("a round of two workers, or one longer than the interval, ends in one summary row, after the orchestrator's turn", SLOW, async ($, on) => {
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
  expect(await lines(placed[0]!)).toEqual([
    '─ crew · round over · 1m',
    '  × Bolt    40s  Revisar README',
    '  ✓ Pip   1m 0s  Arreglar tests',
  ])
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

test("the team view gives each worker its phase, and its run's calls and time or its last run's", SLOW, async ($, on) => {
  const { clock, delegate, end } = await progressCrew($, on)
  await delegate('Run the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'agent-1' })
  await $.tool.call({ tool: 'Read', file_path: '/work/web/README.md', agentId: 'agent-2' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/web/README.md', old_string: 'a', new_string: 'b', agentId: 'agent-2' })
  await clock.advance(372_000)
  await end('agent-2')
  await clock.advance(4000)
  await crewCommand($, 'team')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^testing$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^6m · 1 call$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^last 6m 12s · 2 calls$/ })).toBeDefined()
  // The cards of the main view stay as they were.
  await ui.press({ key: 'crew-back' })
  expect(await ui.find({ type: 'Text', text: /\d calls?\b/ })).toBeUndefined()
  await ui.unmount()
})

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

// In Spanish, so that no word of the UI's reads as the English the models
// are given: the check looks for the UI's words in what a model reads.
test('progress reaches no model: no prompt section, no message context, no message, no stored row', { ...SLOW, options: { language: 'es' } }, async ($, on) => {
  const session = mock.session(on)
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)
    return { text: e.text }
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))
  let invalidated = 0
  on('ui.invalidate', () => {
    invalidated++
    return { value: undefined }
  })
  const { clock, seen, statuses, placed, delegate, end } = await progressCrew($, on)
  await delegate('Run the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await $.tool.call({ tool: 'Edit', file_path: '/work/web/README.md', old_string: 'a', new_string: 'b', agentId: 'agent-2' })
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'agent-1' })
  expect(await progress($, 'agent-1', 2, 3, 'Probar el login')).toBe('ok; next: step 3 of 3, as you start it.')
  await clock.advance(200_000)
  // The roster is read when the orchestrator calls it: an active worker's
  // step, and nothing more of its progress.
  const roster = String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  expect(roster.match(/step \d+\/\d+/g)).toEqual(['step 2/3'])
  const reply = await crewCommand($, 'progreso')
  await end('agent-1')
  await end('agent-2')
  await clock.advance(2000)
  // Everything showed: the status line, a check-in, the asked one, the summary.
  expect(statuses.some(x => x !== undefined && /^crew · Pip 2\/3 /.test(x))).toBe(true)
  expect(placed).toHaveLength(3)

  const shown = /crew ·|ronda|activos?\b|aviso|llamadas?\b|pensando|leyendo|editando|ejecutando|probando|navegando|esperando|✓ listo|× falló|paso|% de los pasos|≈|más \(estimado\)|el plan creció|Probar el login|\d+\/\d+/
  const composed = await $.prompt.compose({
    model: 'test-model',
    promptModel: 'test-model',
    surfaces: ['terminal'],
    tools: ['mcp__crew__delegate'],
    outputStyle: null,
    traits: [],
  })
  expect(composed.sections.length).toBeGreaterThan(1)
  for (const s of composed.sections) expect(s.text).not.toMatch(shown)
  await $.prompt.submit({ text: 'Sigue', wait: false, origin: COMPOSER })
  expect(contexts).toEqual([undefined])
  expect(reply).toEqual({})
  expect(seen.sends).toEqual([])
  expect(session.appended()).toEqual([])
  expect(invalidated).toBe(0)
  expect(roster.replace(', step 2/3,', ',')).not.toMatch(shown)
  expect(String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)).not.toMatch(shown)
})

// The words the width tests look for, in each language they run in.
const WIDTH_WORDS = {
  en: { team: 'team', calls: /\bcalls?\b/, step: /^step /, share: /% of the steps$/, running: 'running' },
  es: { team: 'equipo', calls: /llamada/, step: /^paso /, share: /% de los pasos$/, running: 'ejecutando' },
}

for (const [columns, language] of [[48, 'en'], [34, 'en'], [48, 'es'], [34, 'es']] as const) {
  const words = WIDTH_WORDS[language]
  test(`progress fits ${columns} columns in ${language}: the status line, the placed rows and the team view`, { ...SLOW, options: { language } }, async ($, on) => {
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

test('a plan is its step, the share of the steps done and, once one is, a guess at the rest', () => {
  const declared = declarePlan(undefined, 0, 5, 'Plan')
  expect(declared).toEqual({ step: 0, total: 5, done: 0, first: 5, doing: 'Plan', from: 'tool' })
  // Starting the third step, two are done.
  const third = declarePlan(declared, 3, 5, '  Escribir\n tests ')
  expect(third).toMatchObject({ step: 3, total: 5, done: 2, first: 5, doing: 'Escribir tests' })
  expect(stepBar(third)).toBe('██░░░')
  expect(stepShare(third)).toBe('40 % of the steps')
  expect(stepsLeft(third, 360_000)).toBe('≈9m more (estimated)')
  // Nothing is guessed before a step is done, nor once all are.
  expect(stepsLeft(declarePlan(declared, 1, 5, 'x'), 360_000)).toBeUndefined()
  expect(stepsLeft({ done: 5, total: 5 }, 360_000)).toBeUndefined()
  // A plan that grows keeps the total it first gave; a step past the total
  // stretches it.
  const grown = declarePlan(third, 3, 7, 'x')
  expect([grown.total, grown.first, hasGrown(grown)]).toEqual([7, 5, true])
  expect(declarePlan(grown, 9, 7, 'x')).toMatchObject({ step: 9, total: 9 })
  expect(stepBar({ done: 10, total: 20 })).toBe('█████░░░░░')

  const todos = [
    { status: 'completed', text: 'Reading the code' },
    { status: 'in_progress', text: 'Writing tests' },
    { status: 'pending', text: 'Fixing' },
    { status: 'pending', text: 'Committing' },
  ]
  expect(todoPlan(undefined, todos)).toEqual({ step: 2, total: 4, done: 1, first: 4, doing: 'Writing tests', from: 'todos' })
  expect(todoPlan(undefined, [])).toBeUndefined()
  expect(todoPlan(third, todos)).toBe(third)
})

test("a worker's plan shows as its step in the status line, the team view, the check-ins and the summary", SLOW, async ($, on) => {
  const { clock, status, placed, delegate, end, lines } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  expect(await progress($, 'agent-1', 0, 5, 'Plan')).toBe('ok; next: step 1 of 5, as you start it.')
  await clock.advance(1000)
  expect(status()).toBe('crew · Pip 0/5 1s Arreglar tests · Bolt thinking 1s Revisar README')

  await clock.advance(119_000)
  await progress($, 'agent-1', 3, 5, 'Escribir tests')
  await $.tool.call({ tool: 'Edit', file_path: '/work/api/a.ts', old_string: 'a', new_string: 'b', agentId: 'agent-1' })
  await progress($, 'agent-2', 1, 4, 'Leer el README')
  await $.tool.call({ tool: 'Read', file_path: '/work/web/README.md', agentId: 'agent-2' })
  await clock.advance(60_000)
  expect(status()).toBe('crew · Pip 3/5 3m Arreglar tests · Bolt 1/4 3m Revisar README')
  expect(placed).toHaveLength(1)
  expect(await lines(placed[0]!)).toEqual([
    '─ crew · 2 active · round 3m',
    '  Pip   editing  3/5  3m  Escribir tests',
    '  Bolt  reading  1/4  3m  Leer el README',
  ])
  // Three of five is two done: the bar and the share count those, and the
  // rest is guessed at their pace. Nothing is guessed for Bolt yet.
  const texts = await teamTexts($)
  for (const text of ['Escribir tests', 'step 3/5 · editing · 3m', '██░░░ 40 % of the steps', '≈4m more (estimated)', 'step 1/4 · reading · 3m', '░░░░ 0 % of the steps']) {
    expect(texts).toContain(text)
  }
  expect(texts.filter(t => t.startsWith('≈'))).toHaveLength(1)

  // A new step is news at the next mark. In the summary a worker that ended
  // done did its whole plan, though it never said its last steps, and one
  // that failed gives the step it stopped on.
  await progress($, 'agent-2', 2, 4, 'Corregir enlaces')
  await clock.advance(180_000)
  expect(placed).toHaveLength(2)
  expect(await lines(placed[1]!)).toEqual([
    '─ crew · 2 active · round 6m',
    '  Pip   editing  3/5  6m  Escribir tests',
    '  Bolt  reading  2/4  6m  Corregir enlaces',
  ])
  expect(await lines(placed[0]!)).toEqual(['─ crew · round 3m · Pip editing 3/5 3m · Bolt reading 1/4 3m'])
  await end('agent-1')
  await end('agent-2', 'error')
  await clock.advance(1000)
  expect(placed).toHaveLength(3)
  expect(await lines(placed[2]!)).toEqual([
    '─ crew · round over · 6m',
    '  ✓ Pip   6m 0s  5/5  Arreglar tests',
    '  × Bolt  6m 0s  2/4  Revisar README',
  ])
  const after = await teamTexts($)
  expect(after).toContain('last 6m 0s · 1 call · 5/5 steps')
  expect(after).toContain('last 6m 0s · 1 call · 2/4 steps')
})

test("the orchestrator's progress call is turned down and changes nothing; a worker's that makes no sense too", async ($, on) => {
  const { clock, status, delegate } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  await clock.advance(1000)
  expect(status()).toBe('crew · Pip thinking 1s Arreglar tests')
  expect(await progress($, undefined, 2, 4, 'Coordinar')).toBe('crew: progress is for workers; nothing changed.')
  expect(await progress($, 'agent-1', -1, 0, 'Nada')).toBe('crew: step is 0 or more and total 1 or more.')
  await clock.advance(1000)
  expect(status()).toBe('crew · Pip thinking 2s Arreglar tests')
  expect(String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)).not.toMatch(/step/)
  expect((await teamTexts($)).some(t => /step|%|≈/.test(t))).toBe(false)
})

test('a plan that grows says so, and the time left is guessed only once a step is done, marked ≈', async ($, on) => {
  const { clock, status, delegate } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  await $.tool.call({ tool: 'Read', file_path: '/work/api/a.ts', agentId: 'agent-1' })
  await progress($, 'agent-1', 1, 4, 'Leer')
  await clock.advance(120_000)
  let texts = await teamTexts($)
  expect(texts).toContain('step 1/4 · reading · 2m')
  expect(texts.some(t => /≈|more|grew/.test(t))).toBe(false)

  // One done in 2m, three left.
  await progress($, 'agent-1', 2, 4, 'Arreglar')
  texts = await teamTexts($)
  expect(texts).toContain('≈6m more (estimated)')

  await progress($, 'agent-1', 3, 6, 'Más tests')
  await clock.advance(1000)
  expect(status()).toBe('crew · Pip 3/6 2m Arreglar tests')
  texts = await teamTexts($)
  expect(texts).toContain('step 3/6 · the plan grew · reading · 2m')
  expect(texts).toContain('██░░░░ 33 % of the steps')
  expect(texts).toContain('≈4m more (estimated)')
})

test('without a plan there is no step, no share and no guess: the phase as before', SLOW, async ($, on) => {
  const { clock, status, placed, delegate, lines } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'agent-1' })
  await clock.advance(180_000)
  expect(status()).toBe('crew · Pip testing 3m Arreglar tests')
  expect(await lines(placed[0]!)).toEqual(['─ crew · 1 active · round 3m', '  Pip  testing  3m  Bash npm test'])
  const texts = await teamTexts($)
  expect(texts).toContain('3m · 1 call')
  expect(texts.some(t => /step|%|≈|█|░/.test(t))).toBe(false)
})

// In Spanish, as the test above: the roster's own step is English, the UI's
// is not.
test("the roster gives an active worker's step, the one part of progress a model reads", { options: { language: 'es' } }, async ($, on) => {
  const { delegate, end } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await progress($, 'agent-1', 3, 5, 'Escribir tests')
  const roster = async () => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  const listed = await roster()
  expect(listed).toMatch(/^- Pip: address "pip", \w+, step 3\/5, repo \/work\/api, /m)
  expect(listed).toMatch(/^- Bolt: address "bolt", \w+, repo \/work\/web, /m)
  expect(listed).not.toMatch(/Escribir tests|paso|%|≈/)
  await end('agent-1')
  expect(await roster()).not.toMatch(/step/)
})

test('workers hear when to call progress, and forks do not', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Investigate the checkout', repo: '/work/shop' })
  expect(seen.prompts[0]).toMatch(
    /\n- 3\+ steps: declare your plan with mcp__crew__progress, step 0 of N \(the N steps you will actually take\), then call it as you start each step, 1 to N, in the same message as that step's first tool call\.\n- In a git repository/,
  )
  await spawnAgent($, { prompt: 'Do the frontend', description: 'Frontend', subagentType: 'fork', fork: true, parentAgentId: 'agent-1' })
  await spawnAgent($, { prompt: 'Draft the plan', description: 'Plan', subagentType: 'fork', fork: true })
  expect(seen.prompts).toHaveLength(3)
  for (const prompt of seen.prompts.slice(1)) expect(prompt).not.toMatch(/progress/)
})

test('the progress tool answers a worker with the step it owes next, through the last', async ($, on) => {
  const { delegate } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  expect(await progress($, 'agent-1', 0, 3, 'Plan')).toBe('ok; next: step 1 of 3, as you start it.')
  expect(await progress($, 'agent-1', 1, 3, 'Leer')).toBe('ok; next: step 2 of 3, as you start it.')
  expect(await progress($, 'agent-1', 3, 3, 'Publicar')).toBe('ok; last step.')
  // A step past the total stretches the plan to it: it is the last.
  expect(await progress($, 'agent-1', 5, 4, 'Uno más')).toBe('ok; last step.')
})

test('a worker that declared its plan and said no step more ends with it whole; a stopped one gives where it stopped', SLOW, async ($, on) => {
  const { clock, placed, delegate, end, lines } = await progressCrew($, on)
  await delegate('Map the code', '/work/hive', 'Map code for beehives task')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await delegate('Build the app', '/work/app', 'Compilar')
  await progress($, 'agent-1', 0, 4, 'Plan')
  await progress($, 'agent-2', 2, 4, 'Leer')
  await $.tool.call({ tool: 'Read', file_path: '/work/app/a.ts', agentId: 'agent-3' })
  await clock.advance(180_000)
  expect(placed).toHaveLength(1)

  await end('agent-1')
  await end('agent-2', 'aborted')
  await $.tool.call({ tool: 'Bash', command: 'npm run build', agentId: 'agent-3' })
  await clock.advance(180_000)
  expect(placed).toHaveLength(2)
  const rows = await lines(placed[1]!, 100)
  expect(rows).toContainEqual(expect.stringMatching(/^  Pip +✓ done +4\/4 +3m +Map code for beehives task$/))
  expect(rows).toContainEqual(expect.stringMatching(/^  Bolt +■ stopped +2\/4 +3m +Revisar README$/))
  const texts = await teamTexts($)
  expect(texts).toContain('last 3m 0s · 0 calls · 4/4 steps')
  expect(texts).toContain('last 3m 0s · 0 calls · 2/4 steps')
})

test("a new task for a free worker whose run's end was missed starts afresh: no plan, no time, no todo items of the last", async ($, on) => {
  const { clock, status, states, toasts, delegate } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  for (const subject of ['Leer', 'Corregir']) await $.tool.call({ tool: 'TaskCreate', subject, description: subject, agentId: 'agent-1' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed', agentId: 'agent-1' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress', agentId: 'agent-1' })
  await clock.advance(60_000)
  expect(status()).toBe('crew · Pip 2/2 1m Arreglar tests')

  // The engine has it free, but the end of its turn never reached the crew,
  // and the tick has not yet closed its run when the next task comes.
  states.set('agent-1', 'idle')
  await $.tool.call({ tool: 'mcp__crew__roster' })
  expect(await delegate('Now the login', '/work/api', 'Login')).toMatch(/^Given to Pip /)
  await clock.advance(1000)
  expect(status()).toBe('crew · Pip thinking 1s Login')
  // Its old run ended unseen a while ago: no toast for it now.
  expect(toasts).toEqual([])
  await $.tool.call({ tool: 'TaskCreate', subject: 'Login', description: 'Login', agentId: 'agent-1' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '3', status: 'in_progress', agentId: 'agent-1' })
  await clock.advance(1000)
  expect(status()).toBe('crew · Pip 1/1 2s Login')
})

test("a worker's own todo list stands in for a plan it did not declare, and a declared one wins", async ($, on) => {
  const { clock, status, delegate } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  await delegate('Review the README', '/work/web', 'Revisar README')
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Read the code', status: 'completed', activeForm: 'Reading the code' },
      { content: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' },
      { content: 'Fix', status: 'pending', activeForm: 'Fixing' },
      { content: 'Commit', status: 'pending', activeForm: 'Committing' },
    ],
    agentId: 'agent-1',
  })
  for (const subject of ['Leer', 'Corregir', 'Publicar']) await $.tool.call({ tool: 'TaskCreate', subject, description: subject, agentId: 'agent-2' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed', agentId: 'agent-2' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress', activeForm: 'Corrigiendo enlaces', agentId: 'agent-2' })
  await clock.advance(1000)
  expect(status()).toBe('crew · Pip 2/4 1s Arreglar tests · Bolt 2/3 1s Revisar README')
  const texts = await teamTexts($)
  expect(texts).toContain('Writing tests')
  expect(texts).toContain('Corrigiendo enlaces')
  expect(texts).toContain('█░░░ 25 % of the steps')

  // Declared with the tool, the plan is the worker's word: a later list
  // leaves it be.
  await progress($, 'agent-1', 1, 3, 'Otra cosa')
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'All', status: 'completed', activeForm: 'All' }], agentId: 'agent-1' })
  await clock.advance(1000)
  expect(status()).toBe('crew · Pip 1/3 2s Arreglar tests · Bolt 2/3 2s Revisar README')
})

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
  for (const word of Object.values(CARD_LABEL)) expect(word.length).toBeLessThanOrEqual(DIAMOND_W)
})

for (const columns of [48, 34]) {
  test(`in a pane ${columns} wide each card's line is its step, time or a four-letter word, and the team view keeps the pane's words`, SLOW, async ($, on) => {
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

test('what a worker does stays whole in the team view and the check-ins', SLOW, async ($, on) => {
  const { clock, placed, delegate, lines } = await progressCrew($, on)
  await delegate('Build the app', '/work/app', 'Compilar')
  await $.tool.call({ tool: 'Bash', command: 'npm run build -- --verbose', agentId: 'agent-1' })
  await clock.advance(180_000)
  expect((await cardLines($)).map(c => c.text)).toEqual(['3m'])
  expect(await lines(placed[0]!)).toEqual(['─ crew · 1 active · round 3m', '  Pip  running  3m  Bash npm run build -- --verbose'])
  expect(await teamTexts($)).toContain('Bash npm run build -- --verbose')
})

// ---- ends ----

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

// ---- messages between agents ----

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
