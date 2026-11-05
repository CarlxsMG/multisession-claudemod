import { expect } from 'claude-code/testing'
import type { AgentSpawnInput } from 'claude-code'
import { NO_VERDICT, PANE, SURFACES, USAGE, engine, spawnAgent, test } from './support/crew'
import type { Ask, Seen } from './support/crew'

test('a worker appears, works, reports and is reused', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })

  const first = await $.tool.call({
    tool: 'mcp__crew__delegate',
    task: 'Run the tests and fix what fails',
    title: 'Arreglar tests',
    repo: '/work/api',
  })
  expect(String(first.result)).toMatch(/Started Pip/)

  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/app.ts', agentId: 'agent-1' })

  // Under the name, its run's time: what it does is the team view's.
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^Pip$/ }))?.text).toBe('Pip')
    expect((await ui.find({ type: 'Text', text: /^0s$/ }))?.text).toBe('0s')
    expect(await ui.find({ type: 'Text', text: /Read app\.ts/ })).toBeUndefined()
    await ui.unmount()
  }

  await $.turn.complete({
    answer: 'Tests verdes: 42 ok',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    agentId: 'agent-1',
    reason: 'answer',
  })

  const again = await $.tool.call({
    tool: 'mcp__crew__delegate',
    task: 'Now add a test for the login',
    repo: '/work/api',
  })
  expect(String(again.result)).toMatch(/Given to Pip/)

  const roster = await $.tool.call({ tool: 'mcp__crew__roster' })
  expect(String(roster.result)).toMatch(/Pip: address "pip"/)

  await $.turn.complete({
    answer: 'Login cubierto',
    durationMs: 1000,
    isAborted: false,
    turnId: 't2',
    agentId: 'agent-1',
    reason: 'answer',
  })
  // Past the cheer, a finished worker stands still with its tick.
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Tests verdes/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^done$/ }))?.text).toBe('done')
  expect(await ui.find({ type: 'Raster', key: 'w-agent-1' })).toBeDefined()
  await ui.unmount()
})

test("where auto mode reviews only the model's own calls, the orchestrator starts delegate's worker and the crew takes it", async ($, on) => {
  let spawned = 0
  // Auto mode as the desktop app runs it: a spawn the plugin makes is in no
  // response the model wrote, so it has no verdict.
  const seen = { prompts: [] as string[], sends: [] as string[], spawns: [] as AgentSpawnInput[], refuse: NO_VERDICT }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const delegate = async (input: Record<string, unknown>) =>
    String((await $.tool.call({ tool: 'mcp__crew__delegate', ...input })).result)
  const done = (agentId: string) =>
    $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })

  expect(await delegate({ task: 'Run the tests', title: 'Tests', repo: '/work/api' })).toBe(
    'crew: nothing started: auto mode reviews only calls you write, not the one delegate makes. Start Pip yourself now: Agent tool with name "pip", description "Tests", subagent_type "general-purpose", and as prompt the task exactly as you gave delegate. The crew takes that agent as Pip, working in /work/api.',
  )
  // Another in the same response is handed a name of its own.
  expect(await delegate({ task: 'Fix the login', title: 'Login', repo: '/work/web', model: 'sonnet' })).toMatch(
    /Start Bolt yourself now: Agent tool with name "bolt", description "Login", subagent_type "general-purpose", model "sonnet", and as prompt/,
  )
  expect(seen.spawns).toHaveLength(0)

  // The orchestrator's own Agent calls, which auto mode reviews; one that
  // names no agent is known by its task.
  await spawnAgent($, { prompt: 'Run the tests', description: 'Tests', subagentType: 'general-purpose', name: 'pip', tool_use_id: 'toolu_1', background: false, parentModel: 'claude-opus-5-5' })
  await spawnAgent($, { prompt: 'Fix the login', description: 'Login', subagentType: 'general-purpose', model: 'sonnet', tool_use_id: 'toolu_2', background: false })
  expect(seen.spawns.map(s => [s.cwd, s.background])).toEqual([['/work/api', true], ['/work/web', true]])
  expect(seen.prompts[0]).toMatch(/^\[crew\] You are Pip, a worker in Nova's crew\./)
  expect(seen.prompts[0]).toMatch(/Your repository is \/work\/api\./)
  expect(seen.prompts[1]).toMatch(/^\[crew\] You are Bolt, a worker in Nova's crew\./)

  // Delegate's own: each takes the next task in its repository.
  await done('agent-1')
  await done('agent-2')
  expect(await delegate({ task: 'Now the e2e', repo: '/work/api' })).toMatch(/^Given to Pip/)
  expect(await delegate({ task: 'And the signup', repo: '/work/web', model: 'sonnet' })).toMatch(/^Given to Bolt/)
})

test("a worker on the session's model is asked for it by the alias the Agent tool takes", async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[], spawns: [] as AgentSpawnInput[], refuse: NO_VERDICT }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const handOff = async (repo: string) => {
    const result = String((await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Run the tests', title: 'Tests', repo })).result)
    return /name "(\w+)"/.exec(result)![1]!
  }
  const start = (name: string | undefined, parentModel: string, id: string) =>
    spawnAgent($, { prompt: 'Run the tests', description: 'Tests', subagentType: 'Explore', ...(name ? { name } : {}), tool_use_id: id, background: false, parentModel })

  await start(await handOff('/work/api'), 'claude-opus-5-5', 'toolu_1')
  await start(await handOff('/work/web'), 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'toolu_2')
  await start(await handOff('/work/docs'), 'local-model', 'toolu_3')
  // An Agent call of the orchestrator's own runs as it was asked.
  await start(undefined, 'claude-opus-5-5', 'toolu_4')
  expect(seen.spawns.map(s => s.model)).toEqual(['opus', 'sonnet', undefined, undefined])
})

test('a spawn auto mode refused is said as it is, and nothing is handed on', async ($, on) => {
  engine(on, { seen: { prompts: [], sends: [], refuse: 'Auto mode blocked this action: it deletes the repository.' } })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const result = String((await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Clean up', repo: '/work/api' })).result)
  expect(result).toBe('crew: could not start a worker: Auto mode blocked this action: it deletes the repository.')
})

test('a free worker of the repo is reused however long its history', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (ask: Ask) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...ask })).result)
  const done = (agentId: string, usage?: typeof USAGE) =>
    $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer', ...(usage ? { usage } : {}) })

  expect(await delegate({ task: 'List the routes', repo: '/work/api', model: 'opus' })).toMatch(/^Started Pip/)
  await done('agent-1')
  // Without a model, only a worker on the session's model will do.
  expect(await delegate({ task: 'Design the cache', repo: '/work/api' })).toMatch(/^Started Bolt/)
  await done('agent-2')
  // A model asked for is one the worker must run on; Mika stays busy from here.
  expect(await delegate({ task: 'Check the queries', repo: '/work/api', model: 'opus' })).toMatch(/^Given to Pip/)
  expect(await delegate({ task: 'Review it', repo: '/work/api', model: 'sonnet' })).toMatch(/^Started Mika/)
  // No count of tasks or tokens sends it to a new worker: a worker compacts.
  for (let i = 2; i <= 12; i++) {
    expect(await delegate({ task: `Follow-up ${i}`, repo: '/work/api' })).toMatch(/^Given to Bolt/)
    await done('agent-2', { ...USAGE, input_tokens: 600_000 })
  }
  const roster = String((await $.tool.call({ tool: 'mcp__crew__roster', worker: 'bolt' })).result)
  // The roster still shows both, as information.
  expect(roster).toMatch(/, 12 tasks, ~6655k tokens, /)
  expect(await delegate({ task: 'Yet another', repo: '/work/api' })).toMatch(/^Given to Bolt/)
})

test('on Windows a repository is found however it is spelled, and its free worker reused', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  const host = { cwd: 'C:\\work\\main', env: { USERPROFILE: 'C:\\Users\\ana' } }
  engine(on, { nextId: () => `agent-${++spawned}`, seen, rateLimits: [], stored: {}, host })
  await $.session.start({ cwd: host.cwd, surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) =>
    String((await $.tool.call({ tool: 'mcp__crew__delegate', ...input })).result)
  const done = (agentId: string) =>
    $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })

  expect(await delegate({ task: 'Map the API', repo: 'C:\\work\\api' })).toMatch(/^Started Pip .* in C:\\work\\api\./)
  await done('agent-1')
  // Another case, the other slash, a trailing one: the same repository.
  expect(await delegate({ task: 'Fix the router', repo: 'c:/work/api/' })).toMatch(/^Given to Pip /)
  // A teammate there is named by its folder, not the whole path.
  await delegate({ task: 'Write the docs', repo: '..\\api', fresh: true })
  expect(seen.prompts[seen.prompts.length - 1]).toMatch(/Teammates you can reach with SendMessage: Pip \("pip", api\)/)
  expect(await delegate({ task: 'Style it', repo: '../web', fresh: true })).toMatch(/ in C:\\work\\web\./)
  // Git Bash's spelling, a path from the drive's root, the home and a share.
  expect(await delegate({ task: 'Shop', repo: '/c/work/shop', fresh: true })).toMatch(/ in C:\\work\\shop\./)
  expect(await delegate({ task: 'Root', repo: '\\tools', fresh: true })).toMatch(/ in C:\\tools\./)
  expect(await delegate({ task: 'Home', repo: '~\\code', fresh: true })).toMatch(/ in C:\\Users\\ana\\code\./)
  expect(await delegate({ task: 'Share', repo: '\\\\srv\\team\\x\\..\\y', fresh: true })).toMatch(/ in \\\\srv\\team\\y\./)
})

test('a failed worker is never taken unnamed, and is when named', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) =>
    String((await $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })).result)

  expect(await delegate({ task: 'Migrate the schema' })).toMatch(/^Started Pip/)
  await $.turn.complete({ answer: 'API error', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'error' })
  expect(String((await $.tool.call({ tool: 'mcp__crew__roster', worker: 'pip' })).result)).toMatch(/^- Pip: address "pip", failed, /)
  expect(await delegate({ task: 'Seed the data' })).toMatch(/^Started Bolt/)
  expect(await delegate({ task: 'Try the migration again', worker: 'pip' })).toMatch(/^Given to Pip/)
})

test('a worker sent where another is busy hears of it', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (ask: Ask) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...ask })).result)

  expect(await delegate({ task: 'Refactor the router', repo: '/work/api' })).not.toMatch(/Heads-up/)
  const second = await delegate({ task: 'Update the docs', repo: '/work/api' })
  expect(second).toMatch(/^Started Bolt \(address "bolt", id [^)]+\) in \/work\/api\.\nHeads-up: /)
  expect(second).toMatch(/\nHeads-up: Pip is working in this repository; keep files apart or wait for its report\.$/)
  expect(await delegate({ task: 'Fix the styles', repo: '/work/web' })).not.toMatch(/Heads-up/)
})

test('a worker named for a task hears of who is busy in its own repository', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) =>
    String((await $.tool.call({ tool: 'mcp__crew__delegate', ...input })).result)
  const done = (agentId: string) =>
    $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })

  expect(await delegate({ task: 'Map the API', repo: '/work/api' })).toMatch(/^Started Pip/)
  await done('agent-1')
  expect(await delegate({ task: 'Refactor the router', repo: '/work/api', fresh: true })).toMatch(/^Started Bolt/)
  expect(await delegate({ task: 'Fix the styles' })).toMatch(/^Started Mika/)
  // Pip stays in /work/api, whatever the session's directory or `repo` say.
  for (const extra of [{}, { repo: '/work/web' }]) {
    const given = await delegate({ task: 'Add the endpoint', worker: 'pip', ...extra })
    expect(given).toMatch(/^Given to Pip \(address "pip"\) in \/work\/api; context kept\.(\n|$)/)
    expect(given).toMatch(/\nHeads-up: Bolt is working in this repository; .*its report\.$/)
    expect(given).not.toMatch(/Mika/)
    await done('agent-1')
  }

  // One in a worktree of its own edits apart: no heads-up.
  await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_1', isolation: 'worktree', prompt: 'Fix it', description: 'Fix' })
  await spawnAgent($, { prompt: 'Fix it', description: 'Fix', subagentType: 'general-purpose', tool_use_id: 'toolu_1' })
  await done('agent-4')
  const apart = await delegate({ task: 'Fix the rest', worker: 'agent-4' })
  expect(apart).toMatch(/^Given to Tito \(address "agent-4"\) in a worktree of \/work\/main; context kept\.$/)
  expect(apart).not.toMatch(/Heads-up/)
  // It was not started by delegate: it hears the whole report rule.
  expect(seen.sends[seen.sends.length - 1]).toMatch(/^Fix the rest\n\nWhen done, report the outcome first, then only facts: /)
})

test('a worker can be of another agent type, and is reused only for that type', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) =>
    String((await $.tool.call({ tool: 'mcp__crew__delegate', ...input })).result)

  expect(await delegate({ task: 'Find the auth code', repo: '/work/api', subagent_type: 'Explore' })).toMatch(/^Started Pip/)
  await $.turn.complete({ answer: 'Found it', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })

  expect(await delegate({ task: 'Fix the login', repo: '/work/api' })).toMatch(/^Started Bolt/)
  expect(await delegate({ task: 'Find the session code', repo: '/work/api', subagent_type: 'Explore' })).toMatch(/^Given to Pip/)
  const roster = String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  expect(roster).toMatch(/- Pip: address "pip", \w+.*, repo \/work\/api, Explore, model test-model/)
  expect(roster).toMatch(/- Bolt: address "bolt", \w+.*, repo \/work\/api, model test-model/)
  expect(await delegate({ task: 'Plan it', subagent_type: 'fork' })).toMatch(/a fork starts from the Agent tool/)
})

// The engine may spell a resolved type its own way; a test cannot raise
// that above the plugin, so this one keeps the asked spelling in view.
test('a worker\'s type is kept as delegate was asked for it', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) =>
    String((await $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })).result)

  expect(await delegate({ task: 'Find the auth code', subagent_type: 'explore' })).toMatch(/^Started Pip/)
  await $.turn.complete({ answer: 'Found it', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  expect(String((await $.tool.call({ tool: 'mcp__crew__roster', worker: 'pip' })).result)).toMatch(/, repo \/work\/api, explore, /)
  expect(await delegate({ task: 'Find the session code', subagent_type: 'explore' })).toMatch(/^Given to Pip/)
})

test('an agent in a worktree of its own is not busy in the repository, and says where it is', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (task: string) => String((await $.tool.call({ tool: 'mcp__crew__delegate', task })).result)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_1', isolation: 'worktree', prompt: 'Fix it', description: 'Fix' })
  await spawnAgent($, { prompt: 'Fix it', description: 'Fix', subagentType: 'general-purpose', tool_use_id: 'toolu_1' })

  const first = await delegate('Update the docs')
  expect(first).toMatch(/^Started Bolt/)
  expect(first).not.toMatch(/Heads-up/)
  const second = await delegate('Fix the styles')
  expect(second).toMatch(/\nHeads-up: Bolt is working in this repository; keep files apart or wait for its report\.$/)
  expect(second).not.toMatch(/Pip/)
  expect(seen.prompts[2]).toMatch(/Pip \("agent-1", own worktree of main\)/)
  expect(seen.prompts[2]).toMatch(/Bolt \("bolt", main\)/)

  const roster = async () => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  expect(await roster()).toMatch(/^- Pip: address "agent-1", starting, worktree of \/work\/main, /m)
  expect(await roster()).toMatch(/^- Bolt: address "bolt", starting, repo \/work\/main, /m)
  await $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  expect(await roster()).toMatch(/^- Pip: address "agent-1", done, worktree of \/work\/main, /m)
})

test('delegate calls made at once never share a name or a worker', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = (task: string, extra: Record<string, unknown> = {}) =>
    $.tool.call({ tool: 'mcp__crew__delegate', task, repo: '/work/api', ...extra }).then(r => String(r.result))

  const started = await Promise.all([delegate('A', { fresh: true }), delegate('B', { fresh: true })])
  expect(started[0]).toMatch(/^Started Pip \(address "pip"/)
  expect(started[1]).toMatch(/^Started Bolt \(address "bolt"/)

  for (const id of ['agent-1', 'agent-2']) {
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: id, agentId: id, reason: 'answer' })
  }
  const given = await Promise.all([delegate('C'), delegate('D')])
  expect(given.map(r => /^Given to (\w+)/.exec(r)?.[1]).sort()).toEqual(['Bolt', 'Pip'])
})

test('a blank worker names no one: a free worker it cannot reach gives way to a new one', async ($, on) => {
  const seen: Seen = { prompts: [], sends: [] }
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (ask: Ask & { worker?: string }) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...ask })).result)
  expect(await delegate({ task: 'List the routes', repo: '/work/api' })).toMatch(/^Started Pip/)
  await $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: 't-agent-1', agentId: 'agent-1', reason: 'answer' })
  seen.undelivered = 'the agent is gone'
  expect(await delegate({ task: 'Design the cache', repo: '/work/api', worker: '  ' })).toMatch(/^Started Bolt/)
})

test('a worker never runs on haiku', async ($, on) => {
  const seen = { prompts: [] as string[], sends: [] as string[], models: [] as (string | undefined)[] }
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Count the lines', repo: '/work/api', model: 'haiku' })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Review the login', repo: '/work/web', model: 'sonnet' })
  expect(seen.models).toEqual([undefined, 'sonnet'])
})

test('a full model id goes as the alias the Agent tool takes, to start a worker and to reuse one', async ($, on) => {
  const seen = { prompts: [] as string[], sends: [] as string[], models: [] as (string | undefined)[] }
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (ask: Ask) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...ask })).result)
  const done = (agentId: string) =>
    $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: `t-${agentId}-${seen.models.length}`, agentId, reason: 'answer' })

  expect(await delegate({ task: 'List the routes', repo: '/work/api', model: 'claude-sonnet-4-5' })).toMatch(/^Started Pip/)
  await done('agent-1')
  expect(await delegate({ task: 'Check the queries', repo: '/work/api', model: 'sonnet' })).toMatch(/^Given to Pip/)
  expect(await delegate({ task: 'Review the login', repo: '/work/web', model: 'sonnet' })).toMatch(/^Started Bolt/)
  await done('agent-2')
  expect(await delegate({ task: 'Polish it', repo: '/work/web', model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0' })).toMatch(/^Given to Bolt/)
  expect(await delegate({ task: 'Count the lines', repo: '/work/docs', model: 'claude-haiku-4-5' })).toMatch(/^Started Mika/)
  expect(seen.models).toEqual(['sonnet', 'sonnet', undefined])

  // One that names no family starts nothing, and says which it takes.
  expect(await delegate({ task: 'Count the words', repo: '/work/docs', model: 'gpt-5' })).toBe(
    `crew: no model "gpt-5"; nothing started. Models: sonnet, opus, fable, or none for the session's.`,
  )
  expect(seen.models).toHaveLength(3)
})
