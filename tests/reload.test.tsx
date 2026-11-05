// What calls under way leave for the hooks that follow them survives a
// reload of the plugin's code. A reload starts the load's runtime state
// afresh at its session start and keeps the atoms: a second session start
// in one test is that reload.
import { expect } from 'claude-code/testing'
import type { AgentSpawnInput } from 'claude-code'
import { DELEGATE, NO_VERDICT, engine, frameRows, mountSaid, progressCrew, spawnAgent, test, workerSend } from './support/crew'
import type { Seen } from './support/crew'

const TERMINAL = { cwd: '/work/main', surface: 'terminal', isInteractive: true } as const

test('an agent the orchestrator starts for delegate after a reload is still taken as its worker', async ($, on) => {
  const seen: Seen = { prompts: [], sends: [], spawns: [], refuse: NO_VERDICT }
  engine(on, { seen })
  const start = () => $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  await start()
  expect(String((await $.tool.call({ tool: DELEGATE, task: 'Run the tests', title: 'Tests', repo: '/work/api' })).result)).toMatch(/Start Pip yourself now/)

  await start()
  await spawnAgent($, { prompt: 'Run the tests', description: 'Tests', subagentType: 'general-purpose', name: 'pip', tool_use_id: 'toolu_1', background: false })
  expect((seen.spawns as AgentSpawnInput[]).map(s => [s.cwd, s.background])).toEqual([['/work/api', true]])
  expect(seen.prompts[0]).toMatch(/^\[crew\] You are Pip, a worker in Nova's crew\./)
  expect(seen.prompts[0]).toMatch(/Your repository is \/work\/api\./)
})

test('an Agent call that asked for a worktree before a reload spawns its agent there after it', async ($, on) => {
  const seen: Seen = { prompts: [], sends: [] }
  engine(on, { nextId: () => 'agent-9', seen })
  await $.session.start(TERMINAL)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_1', isolation: 'worktree', prompt: 'Fix it', description: 'Fix' })

  await $.session.start(TERMINAL)
  await spawnAgent($, { prompt: 'Fix it', description: 'Fix', subagentType: 'general-purpose', tool_use_id: 'toolu_1' })
  expect(seen.prompts[0]).toMatch(/You work in your own git worktree of \/work\/main, where your shell starts: stay in it/)
})

test("a worker's TaskCreate list stays its plan across a reload", async ($, on) => {
  const { clock, status, delegate } = await progressCrew($, on)
  await delegate('Fix the tests', '/work/api', 'Arreglar tests')
  for (const subject of ['Leer', 'Corregir', 'Publicar']) await $.tool.call({ tool: 'TaskCreate', subject, description: subject, agentId: 'agent-1' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed', agentId: 'agent-1' })

  // After it, an update names one item: the list is still the three.
  await $.session.start(TERMINAL)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress', agentId: 'agent-1' })
  await clock.advance(1000)
  expect(status()).toMatch(/^crew · Pip 2\/3 /)
})

test("a worker's message sent after a reload is told by the summary its SendMessage gave before it", async ($, on) => {
  const { clock, placed, delegate, lines } = await progressCrew($, on)
  await delegate('Build the session bus step', '/work/api', 'Session bus')
  await delegate('Build the remote channel', '/work/web', 'Remote channel')
  await $.tool.call({ tool: 'SendMessage', to: 'pip', summary: 'router.ts?', message: 'Bolt: are you on router.ts?\nI need the lock.', agentId: 'agent-2' })

  await $.session.start(TERMINAL)
  await workerSend($, 'pip', 'Bolt: are you on router.ts?\nI need the lock.', 'agent-2')
  await clock.advance(1000)
  expect(await lines(placed[placed.length - 1]!)).toEqual(['● Bolt → Pip: router.ts?'])
})

test("a worker's end drawn before a reload keeps its task and time when drawn again after it", async ($, on) => {
  let spawned = 0
  const clock = engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start(TERMINAL)
  const ended = { text: 'Agent "Primera tarea" finished', origin: { kind: 'task-notification' }, isExpanded: false, task: { id: 'agent-1', status: 'completed' } } as const
  await $.tool.call({ tool: DELEGATE, task: 'Haz la primera tarea', title: 'Primera tarea', repo: '/work/api' })
  await clock.advance(4000)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  const row = await mountSaid($, 'end-1', ended)
  const drawn = await frameRows(row)
  expect(drawn.slice(0, 2)).toEqual([expect.stringMatching(/^╭─ Pip → Nova · ✓ done · 4s ─+╮$/), expect.stringMatching(/^│ Primera tarea +│$/)])
  await row.unmount()
  // The pane's next frame keeps what it was first drawn with.
  await clock.advance(400)

  // Pip takes another task; after the reload the row is drawn as it first was.
  await $.tool.call({ tool: DELEGATE, task: 'Ahora la segunda', title: 'Segunda tarea', repo: '/work/api' })
  await $.session.start(TERMINAL)
  expect(await frameRows(await mountSaid($, 'end-1', ended))).toEqual(drawn)
})
