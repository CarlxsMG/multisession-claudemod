// What calls under way leave for the hooks that follow them survives a
// reload of the plugin's code. A reload starts the load's runtime state
// afresh at its session start and keeps the atoms: a second session start
// in one test is that reload.
import { expect } from 'claude-code/testing'
import type { AgentSpawnInput } from 'claude-code'
import type { KeptCrew, Worker } from '../types'
import { KEPT_SHAPE } from '../src/crew/persist'
import { makeWorker } from '../src/crew/workers'
import { COMPACT_MAIN } from '../src/prompts/compact'
import { COMPOSER, DELEGATE, NO_VERDICT, engine, frameRows, mountSaid, progressCrew, spawnAgent, test, workerSend } from './support/crew'
import type { Seen } from './support/crew'

const TERMINAL = { cwd: '/work/main', surface: 'terminal', isInteractive: true } as const

// What a load keeps in memory beside its atoms starts afresh with each
// session: a reload reads again only the modules whose code changed, and
// the others' bookkeeping must not outlive the session it was kept for.
test("a session started again in the same load keeps nothing of the earlier one's bookkeeping", async ($, on) => {
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
    return {
      value: {
        isAnswered: true as const,
        text: 'Sorry, no lines today.',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })
  let rows = 0
  const endsTimedOut = async () => {
    const ui = await mountSaid($, `end-${++rows}`, {
      text: 'Agent "Tarea" finished',
      origin: { kind: 'task-notification' },
      isExpanded: false,
      task: { id: 'agent-1', status: 'timeout' },
    })
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

test('an agent the orchestrator starts for delegate after a reload is still taken as its worker', async ($, on) => {
  const seen: Seen = { prompts: [], sends: [], spawns: [], refuse: NO_VERDICT }
  engine(on, { seen })
  const start = () => $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  await start()
  expect(String((await $.tool.call({ tool: DELEGATE, task: 'Run the tests', title: 'Tests', repo: '/work/api' })).result)).toMatch(
    /Start Pip yourself before this turn ends/,
  )

  await start()
  await spawnAgent($, {
    prompt: 'Run the tests',
    description: 'Tests',
    subagentType: 'general-purpose',
    name: 'pip',
    tool_use_id: 'toolu_1',
    background: false,
  })
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
  const ended = {
    text: 'Agent "Primera tarea" finished',
    origin: { kind: 'task-notification' },
    isExpanded: false,
    task: { id: 'agent-1', status: 'completed' },
  } as const
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

// A new process is a test of its own: the state starts empty, and the store
// holds what an earlier process kept. `kept` is such a record: Pip free,
// Bolt at work, Mika woken by Pip with a task held for it, a task that waits
// for Bolt's run, and a compaction asked for.
const NOW = 1_000_000
function keptCrew(): KeptCrew {
  const worker = (id: string, name: string, status: Worker['status'], task: string, more: Partial<Worker> = {}): Worker => ({
    ...makeWorker(
      { id, name, address: name.toLowerCase(), task, type: 'general-purpose', cwd: '/work/api', status, model: 'test-model', asked: '' },
      NOW - 60_000,
    ),
    ...more,
  })
  return {
    shape: KEPT_SHAPE,
    at: NOW - 10_000,
    workers: [
      worker('agent-1', 'Pip', 'done', 'Schema', { answer: 'Done: schema migrated.', finishedAt: NOW - 30_000 }),
      worker('agent-2', 'Bolt', 'working', 'Docs', { activity: 'Edit docs.md' }),
      worker('agent-3', 'Mika', 'working', 'Routes'),
    ],
    dropped: [],
    parents: [{ id: 'agent-3', parent: 'Pip', fork: false }],
    worktrees: [],
    takeovers: [{ id: 'agent-3', by: 'Pip', held: [{ task: 'List the routes.', title: 'Routes' }] }],
    waiting: [
      {
        seq: 1,
        after: 'agent-2',
        behind: 'Bolt',
        to: 'agent-2',
        task: 'Check the links.',
        title: 'Links',
        cwd: '/work/api',
        type: 'general-purpose',
        model: '',
      },
    ],
    compaction: { ask: { focus: 'the release', after: 'idle', by: 'model', askedAt: NOW - 20_000 }, lastAt: 0 },
  }
}

test("the crew is kept in the store under the conversation's id as it changes, and not at every tool call", async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [], store: {} }
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start(TERMINAL)
  const kept = () => (seen.store?.crews as Record<string, KeptCrew> | undefined)?.['sess-1']
  await clock.advance(11_000)
  // A conversation with no worker writes nothing.
  expect(kept()).toBeUndefined()

  await $.tool.call({ tool: DELEGATE, task: 'Migrate the schema', title: 'Schema', repo: '/work/api' })
  await $.tool.call({ tool: DELEGATE, task: 'Write the docs', title: 'Docs', repo: '/work/api', fresh: true })
  await $.turn.complete({ answer: 'Done: schema migrated.', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  await clock.advance(11_000)
  const first = kept()
  expect(first?.shape).toBe(KEPT_SHAPE)
  expect(first?.workers.map(w => [w.name, w.address, w.status, w.asked, w.task])).toEqual([
    ['Pip', 'pip', 'done', '', 'Schema'],
    ['Bolt', 'bolt', 'starting', '', 'Docs'],
  ])

  // A tool call changes what a worker is doing, which is not worth a write.
  await $.tool.call({ tool: 'Read', file_path: '/work/api/docs.md', agentId: 'agent-2' })
  await clock.advance(11_000)
  expect(kept()?.at).toBe(first?.at)
})

test('a session that starts in a new process on a conversation that had a crew finds it: its workers by name, the busy ones stopped, and what waited told', async ($, on) => {
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)
    return { text: e.text }
  })
  const ran: (string | undefined)[] = []
  on('session.compact', (_, e) => {
    ran.push(e.instructions)
    return { messages: [{ role: 'user' as const, text: 'Summary.', toolUses: [] }] }
  })
  for (const call of ['ui.status', 'ui.toast'] as const) on(call, () => ({ value: undefined }))
  on('ui.place', (_, e) => ({ value: { isPlaced: true as const, requestId: e.id } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  let spawned = 3
  const seen: Seen = { prompts: [], sends: [] }
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen, stored: { crews: { 'sess-1': keptCrew() } } })
  await $.session.start(TERMINAL)
  const roster = async (worker?: string) => String((await $.tool.call({ tool: 'mcp__crew__roster', ...(worker ? { worker } : {}) })).result)
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: DELEGATE, repo: '/work/api', ...input })).result)

  // The user's first message says who was cut short, and what waited for them.
  await clock.advance(4000)
  await $.prompt.submit({ text: 'Where were we?', wait: false, origin: COMPOSER })
  await $.prompt.submit({ text: 'Go on.', wait: false, origin: COMPOSER })
  expect(contexts[0]).toEqual([
    '[crew] The task held for Mika (address "mika") did not reach it: Claude Code restarted before that run ended. It goes with the next task you give Mika; or give it to another worker word for word, which takes it off Mika.',
    '[crew] The task "Links", held behind Bolt, was not given: Bolt\'s run was stopped. Give it again if it still stands.',
    '[crew] Bolt (address "bolt") was on "Docs" when Claude Code restarted, which ended its run: it is stopped. Take that task as not done: give it again, to Bolt by name, which keeps what it had read if the engine can resume it, or to another worker.',
    '[crew] Mika (address "mika") was on "Routes" when Claude Code restarted, which ended its run: it is stopped. Take that task as not done: give it again, to Mika by name, which keeps what it had read if the engine can resume it, or to another worker.',
  ])
  expect(contexts[1] ?? []).toEqual([])
  expect(seen.sends).toHaveLength(0)

  // The workers are the crew's as before: listed, named, and the crew's own to reuse.
  const all = await roster()
  expect(all).toMatch(/^Nova's crew \(3\):/)
  expect(all).toMatch(/^- Pip: address "pip", done, repo \/work\/api, .*last task "Schema"/m)
  expect(all).toMatch(/^- Bolt: address "bolt", stopped, repo \/work\/api, /m)
  expect(all).toMatch(/^- Mika: address "mika", stopped, 1 task waiting, not delivered: Claude Code restarted before that run ended, started by Pip, /m)
  expect(await delegate({ task: 'Add the indexes', title: 'Indexes' })).toMatch(
    /^Given to Pip \(address "pip"\) in \/work\/api, the free worker of that type and model there that last finished a task/,
  )
  expect(seen.sends[0]).toMatch(/^Add the indexes\n/)
  expect(await delegate({ task: 'Finish the docs', title: 'Docs', worker: 'bolt' })).toMatch(
    /^Given to Bolt \(address "bolt"\) in \/work\/api, as named; context kept\. Bolt's last run was stopped: /,
  )
  // A new worker takes a name none of them has.
  expect(await delegate({ task: 'Fix the footer', repo: '/work/web' })).toMatch(/^Started Tito /)

  // The compaction asked for before the restart runs once it is safe.
  for (const agentId of ['agent-1', 'agent-2', 'agent-4']) {
    await $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })
  }
  await $.turn.start({ text: '', turnId: 'm1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'm1', reason: 'answer' })
  await clock.advance(3000)
  expect(ran).toEqual([`Stress for what comes next: the release\n\n${COMPACT_MAIN}`])
})

test('another conversation, or a record this version did not write, reads no crew back', async ($, on) => {
  engine(on, { stored: { crews: { 'sess-0': keptCrew(), 'sess-1': { ...keptCrew(), shape: 'crew-0' } } } })
  await $.session.start(TERMINAL)
  expect(String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)).toBe("Nova's crew is empty.")
  expect(String((await $.tool.call({ tool: DELEGATE, task: 'Finish the docs', worker: 'bolt' })).result)).toBe('crew: no worker "bolt". Workers: none.')
})

test('a reload of the plugin, which keeps the state, reads nothing back over it', async ($, on) => {
  let spawned = 0
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, stored: { crews: { 'sess-1': keptCrew() } } })
  const roster = async () => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  await $.session.start(TERMINAL)
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Finish the docs', title: 'Docs', worker: 'bolt' })
  await clock.advance(1000)
  await $.session.start(TERMINAL)
  expect(await roster()).toMatch(/^- Bolt: address "bolt", working, repo \/work\/api, .*\b2 tasks, /m)
})
