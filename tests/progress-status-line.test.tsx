// What each worker is doing, as the status line says it: its phase, the line
// itself and what it gives up in a narrow terminal.
import { expect } from 'claude-code/testing'
import { parseEvery } from '../src/progress/check-in'
import { STICK_MS, isTestRun, nextPhase, phaseLabel, phaseOf } from '../src/progress/phase'
import { declarePlan } from '../src/progress/plan'
import { JUST_ENDED_MS } from '../src/progress/runs'
import { statusText } from '../src/progress/text/status-line'
import { progressCrew, test } from './support/crew'

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
  expect((['thinking', 'reading', 'editing', 'running', 'testing', 'web', 'delegating', 'waiting'] as const).map(phaseLabel)).toEqual([
    'thinking',
    'reading',
    'editing',
    'running',
    'testing',
    'browsing',
    'delegating',
    'waiting',
  ])

  for (const [text, minutes] of [
    ['1m', 1],
    ['2', 2],
    ['3min', 3],
    ['5m', 5],
    ['10m', 10],
    ['off', 0],
  ] as const)
    expect(parseEvery(text)).toBe(minutes)
  for (const text of ['4m', '15m', 'soon', '']) expect(parseEvery(text)).toBeUndefined()
})

test('the status line names each active worker, its phase, its run time and its task, then each end for half a minute, and clears when none is', async ($, on) => {
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
  expect(await delegate('Now the login', '/work/api', 'Login', 'pip')).toMatch(/^Given to Pip /)
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

test('an idle progress tick writes nothing when no line waits', async ($, on) => {
  let writes = 0
  on('state.set', { plugin: 'crew', key: 'due' }, (_, e, next) => {
    writes += 1
    return next(e)
  })
  const { clock } = await progressCrew($, on)
  await clock.advance(10_000)
  expect(writes).toBe(0)
})

test('a progress tick reads the runs once, and the jobs only while a run is under way', async ($, on) => {
  const reads = { runs: 0, jobs: 0 }
  on('state.get', { plugin: 'crew', key: 'runs' }, (_, e, next) => {
    reads.runs += 1
    return next(e)
  })
  on('state.get', { plugin: 'crew', key: 'jobs' }, (_, e, next) => {
    reads.jobs += 1
    return next(e)
  })
  const { clock, delegate } = await progressCrew($, on)
  await clock.advance(10_000)
  expect(reads).toEqual({ runs: 10, jobs: 0 })

  await delegate('Fix the login', '/work/api', 'Login')
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/login.ts', agentId: 'agent-1' })
  await clock.advance(1000)
  reads.runs = 0
  reads.jobs = 0
  await clock.advance(10_000)
  expect(reads.jobs).toBe(10)
  expect(reads.runs).toBe(10)
})
