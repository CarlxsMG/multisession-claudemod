// A worker's plan: its step, the share of the steps done, the guess at the
// rest, and each surface that shows them.
import { expect } from 'claude-code/testing'
import { declarePlan, hasGrown, stepBar, stepShare, stepsLeft, todoPlan } from '../src/progress/plan'
import { progress, progressCrew, teamTexts, test } from './support/crew'

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

test("a worker's plan shows as its step in the status line, the team view, the check-ins and the summary", async ($, on) => {
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
  for (const text of [
    'Escribir tests',
    'step 3/5 · editing · 3m',
    '██░░░ 40 % of the steps',
    '≈4m more (estimated)',
    'step 1/4 · reading · 3m',
    '░░░░ 0 % of the steps',
  ]) {
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
  expect(await lines(placed[2]!)).toEqual(['─ crew · round over · 6m', '  ✓ Pip   6m 0s  5/5  Arreglar tests', '  × Bolt  6m 0s  2/4  Revisar README'])
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

test('without a plan there is no step, no share and no guess: the phase as before', async ($, on) => {
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

test('a worker that declared its plan and said no step more ends with it whole; a stopped one gives where it stopped', async ($, on) => {
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
