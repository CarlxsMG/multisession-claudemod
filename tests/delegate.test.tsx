import { expect } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { AgentSpawnInput } from 'claude-code'
import { WORKER_NAMES } from '../src/persona/names'
import { SEND_UNSURE } from '../src/prompts/results'
import { DELEGATE, NO_VERDICT, PANE, SURFACES, USAGE, crewCommand, engine, mountRow, spawnAgent, test, toolRow } from './support/crew'
import type { Ask, Seen } from './support/crew'

test('a haiku request asks the Agent tool for no model, as one with none does', async ($, on) => {
  const seen = { prompts: [] as string[], sends: [] as string[], models: [] as (string | undefined)[] }
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Count the lines', repo: '/work/api', model: 'haiku' })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Review the login', repo: '/work/web', model: 'sonnet' })
  expect(seen.models).toEqual([undefined, 'sonnet'])
})

test('a spawn that throws gives its name back for the next worker', async ($, on) => {
  let spawns = 0
  engine(on, {
    nextId: () => {
      spawns += 1
      if (spawns === 1) throw new Error('spawn failed')
      return `agent-${spawns}`
    },
  })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async () => String((await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Fix the tests', title: 'Tests', repo: '/work/api' })).result)
  expect(await delegate()).not.toMatch(/^Started /)
  expect(await delegate()).toMatch(/^Started Pip /)
})

test("where auto mode reviews only the model's own calls, the orchestrator starts delegate's worker and the crew takes it", async ($, on) => {
  let spawned = 0
  // Auto mode as the desktop app runs it: a spawn the plugin makes is in no
  // response the model wrote, so it has no verdict.
  const seen = { prompts: [] as string[], sends: [] as string[], spawns: [] as AgentSpawnInput[], refuse: NO_VERDICT }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...input })).result)
  const done = (agentId: string) => $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })

  expect(await delegate({ task: 'Run the tests', title: 'Tests', repo: '/work/api' })).toBe(
    'crew: nothing started: auto mode reviews only calls you write, not the one delegate makes. Start Pip yourself before this turn ends: Agent tool with description "(Pip) Tests", subagent_type "general-purpose", name "pip" if the tool takes a name, and as prompt the task exactly as you gave delegate. The crew takes that agent as Pip, working in /work/api. Left for a later turn, the handoff lapses: delegate the task again then. While this session is in auto mode, delegate hands every new worker over like this and still gives a task to a free one itself. For several new workers, make the delegate calls in one message and their Agent calls in the next, each with the description its handoff gives.',
  )
  // Another in the same response is handed a name of its own.
  expect(await delegate({ task: 'Fix the login', title: 'Login', repo: '/work/web', model: 'sonnet' })).toMatch(
    /Start Bolt yourself before this turn ends: Agent tool with description "\(Bolt\) Login", subagent_type "general-purpose", model "sonnet", name "bolt" if the tool takes a name, and as prompt/,
  )
  expect(seen.spawns).toHaveLength(0)

  // The orchestrator's own Agent calls, which auto mode reviews; one that
  // names no agent is known by its task.
  await spawnAgent($, {
    prompt: 'Run the tests',
    description: 'Tests',
    subagentType: 'general-purpose',
    name: 'pip',
    tool_use_id: 'toolu_1',
    background: false,
    parentModel: 'claude-opus-5-5',
  })
  await spawnAgent($, {
    prompt: 'Fix the login',
    description: 'Login',
    subagentType: 'general-purpose',
    model: 'sonnet',
    tool_use_id: 'toolu_2',
    background: false,
  })
  expect(seen.spawns.map(s => [s.cwd, s.background])).toEqual([
    ['/work/api', true],
    ['/work/web', true],
  ])
  expect(seen.prompts[0]).toMatch(/^\[crew\] You are Pip, a worker in Nova's crew\./)
  expect(seen.prompts[0]).toMatch(/Your repository is \/work\/api\./)
  expect(seen.prompts[1]).toMatch(/^\[crew\] You are Bolt, a worker in Nova's crew\./)

  // Delegate's own: each takes the next task in its repository.
  await done('agent-1')
  await done('agent-2')
  expect(await delegate({ task: 'Now the e2e', repo: '/work/api' })).toMatch(/^Given to Pip/)
  expect(await delegate({ task: 'And the signup', repo: '/work/web', model: 'sonnet' })).toMatch(/^Given to Bolt/)
})

test('a worker the orchestrator starts for delegate is as delegate asked: its model, its reuse, the row of its delegate call, and why it is new', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[], spawns: [] as AgentSpawnInput[], refuse: NO_VERDICT }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: DELEGATE, ...input })).result)
  const done = (agentId: string) => $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })
  // The orchestrator's Agent call: its spawn, then what the call reads after its result.
  const agent = async (toolUseId: string, call: Partial<AgentSpawnInput> & Pick<AgentSpawnInput, 'prompt'>) => {
    await spawnAgent($, { subagentType: 'general-purpose', parentModel: 'claude-opus-5-5', background: false, ...call, tool_use_id: toolUseId })
    return (await $.tool.call({ tool: 'Agent', tool_use_id: toolUseId, ...call } as never)) as { context?: string[] }
  }

  // Asked for sonnet, and the Agent call leaves the model out.
  const tests = { task: 'Run the tests', title: 'Tests', repo: '/work/api', model: 'sonnet' }
  const handoff = await delegate({ ...tests, tool_use_id: 'toolu_d1' })
  expect(handoff).toMatch(/Start Pip yourself before this turn ends/)
  const first = await agent('toolu_a1', { prompt: 'Run the tests', description: 'Tests', name: 'pip' })
  expect(seen.spawns[0]?.model).toBe('sonnet')
  expect(first.context).toEqual([
    '[crew] This agent is Pip (address "pip", id agent-1), the worker delegate had you start, in /work/api: a new one, as no free worker of that type and model was there.',
  ])
  // The delegate call's row names the worker its Agent call started.
  const row = await mountRow($, toolRow(DELEGATE, 'toolu_d1', tests, { output: handoff }))
  expect(await row.find({ type: 'Text', text: /^╭─ Nova → Pip · Tests ─+╮$/ })).toBeDefined()
  await row.unmount()

  // Asked for no model, and the Agent call names one: delegate's stands,
  // and the call hears it, with who is busy there.
  expect(await delegate({ task: 'Fix the login', title: 'Login', repo: '/work/api', fresh: true })).toMatch(/Start Bolt yourself before this turn ends/)
  const second = await agent('toolu_a2', { prompt: 'Fix the login', description: 'Login', name: 'bolt', model: 'sonnet' })
  expect(seen.spawns[1]?.model).toBe('opus')
  expect(second.context).toEqual([
    '[crew] This agent is Bolt (address "bolt", id agent-2), the worker delegate had you start, in /work/api: a new one, as `fresh` asked. It runs on the session\'s model, as delegate was asked, not on "sonnet".\nHeads-up: Pip is working in this repository; keep files apart or wait for its report.',
  ])

  // Each is reused for the model delegate was asked, not the one its Agent call named.
  await done('agent-1')
  await done('agent-2')
  expect(await delegate({ task: 'Now the e2e', repo: '/work/api', model: 'sonnet' })).toMatch(/^Given to Pip/)
  expect(await delegate({ task: 'And the signup', repo: '/work/api' })).toMatch(/^Given to Bolt/)
})

test('a worker handed to the orchestrator that its turn does not start is let go: its name is free, and a later agent is not the crew’s worker', async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [], spawns: [], refuse: NO_VERDICT }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: DELEGATE, repo: '/work/api', ...input })).result)
  const done = (agentId?: string) =>
    $.turn.complete({
      answer: 'Hecho',
      durationMs: 1,
      isAborted: false,
      turnId: `t-${agentId ?? 'main'}-${spawned}`,
      reason: 'answer',
      ...(agentId ? { agentId } : {}),
    })
  const agent = (name: string, prompt: string) =>
    spawnAgent($, { prompt, description: prompt, subagentType: 'general-purpose', name, tool_use_id: `toolu_${name}` })

  // Its Agent call comes in the turn delegate answered in, after a worker's
  // own turn ended meanwhile: the handoff stands until the main turn ends.
  expect(await delegate({ task: 'Run the tests' })).toMatch(/Start Pip yourself before this turn ends/)
  await agent('pip', 'Run the tests')
  expect(await delegate({ task: 'Fix the login', fresh: true })).toMatch(/Start Bolt yourself before this turn ends/)
  await done('agent-1')
  await agent('bolt', 'Fix the login')
  expect(seen.prompts[1]).toMatch(/^\[crew\] You are Bolt, a worker in Nova's crew\./)
  expect(rowOf(await roster($), 'Bolt')).toMatch(/^- Bolt: address "bolt", starting, repo \/work\/api, /)

  // The main turn ends with a handoff not acted on: the next new worker
  // takes its name.
  expect(await delegate({ task: 'Write the docs', fresh: true })).toMatch(/Start Mika yourself before this turn ends/)
  await done()
  expect(await delegate({ task: 'Ship it', fresh: true })).toMatch(/Start Mika yourself before this turn ends/)
  await done()

  // An Agent call a later turn writes for it starts an agent of its own
  // repository and no worker of delegate's: an unnamed task does not reach it.
  await agent('mika', 'Write the docs')
  expect(seen.spawns?.[2]?.cwd).toBeUndefined()
  await done('agent-3')
  await done('agent-2')
  const given = await delegate({ task: 'Polish it' })
  expect(given).toMatch(/^Given to Pip .*\(also free: Bolt; /)
  expect(given).not.toMatch(/Mika/)
})

test('an Agent call for a handed-over worker that starts nothing leaves the handoff for the call written again, until the turn ends', async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [], spawns: [], refuse: NO_VERDICT, refuseAgent: 'Auto mode blocked this action.' }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: DELEGATE, repo: '/work/api', ...input })).result)
  const agent = () => spawnAgent($, { prompt: 'Run the tests', description: 'Tests', subagentType: 'general-purpose', name: 'pip', tool_use_id: 'toolu_1' })

  expect(await delegate({ task: 'Run the tests' })).toMatch(/Start Pip yourself before this turn ends/)
  expect((await agent()).agentId).toBeUndefined()
  // Written again in the same turn, it is delegate's worker still.
  seen.refuseAgent = undefined
  await agent()
  expect(seen.spawns?.map(s => [s.cwd, s.background])).toEqual([['/work/api', true]])

  // Refused and not written again: the end of the turn frees its name.
  seen.refuseAgent = 'Auto mode blocked this action.'
  expect(await delegate({ task: 'Fix the login', fresh: true })).toMatch(/Start Bolt yourself before this turn ends/)
  await spawnAgent($, { prompt: 'Fix the login', description: 'Login', subagentType: 'general-purpose', name: 'bolt', tool_use_id: 'toolu_2' })
  await $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: 't-main', reason: 'answer' })
  expect(await delegate({ task: 'Fix the login', fresh: true })).toMatch(/Start Bolt yourself before this turn ends/)
})

test('an Agent call that names no agent and rewords the handoff is still its worker, by its title or as the only one of its type, and never when two fit', async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [], spawns: [], refuse: NO_VERDICT }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: DELEGATE, fresh: true, ...input })).result)
  let calls = 0
  const agent = (call: Partial<AgentSpawnInput> & Pick<AgentSpawnInput, 'prompt'>) =>
    spawnAgent($, { subagentType: 'general-purpose', description: '', ...call, tool_use_id: `toolu_${++calls}` })
  // Whether the agent last started is delegate's worker of that name, and
  // where it was sent to run.
  const last = () => {
    const prompt = seen.prompts[seen.prompts.length - 1] ?? ''
    return [/^\[crew\] You are (\w+), a worker in Nova's crew\./.exec(prompt)?.[1], seen.spawns?.[seen.spawns.length - 1]?.cwd]
  }
  const handed = async (input: Record<string, unknown>) => /Start (\w+) yourself/.exec(await delegate(input))?.[1]

  // The task as delegate had it, under no name: the engine knows the agent
  // by its id alone, which is its address.
  expect(await handed({ task: 'Run the tests', title: 'Tests', repo: '/work/api' })).toBe('Pip')
  await agent({ prompt: 'Run the tests', description: 'Tests' })
  expect(last()).toEqual(['Pip', '/work/api'])
  expect(rowOf(await roster($), 'Pip')).toMatch(/^- Pip: address "agent-1", starting, repo \/work\/api, /)

  // The prompt reworded, the title kept, with two handoffs waiting.
  expect(await handed({ task: 'Fix the login', title: 'Login', repo: '/work/web' })).toBe('Bolt')
  expect(await handed({ task: 'Write the docs', title: 'Docs', repo: '/work/docs' })).toBe('Mika')
  await agent({ prompt: 'Please write the documentation.', description: 'Docs' })
  expect(last()).toEqual(['Mika', '/work/docs'])

  // A worker's own agent is none of the orchestrator's handoffs; nor is a
  // call of another type, or one under a name of its own that says nothing
  // delegate did: each runs where its call says.
  await agent({ prompt: 'Read the routes', description: 'Routes', parentAgentId: 'agent-1' })
  expect(last()[1]).toBeUndefined()
  await agent({ prompt: 'Read the routes', description: 'Routes', subagentType: 'Explore' })
  expect(last()[1]).toBeUndefined()
  await agent({ prompt: 'Read the routes', description: 'Routes', name: 'rex' })
  expect(last()).toEqual(['Rex', undefined])
  // Reworded whole, it is the only handoff of its type left.
  await agent({ prompt: 'Please fix the login page.', description: 'Fix login' })
  expect(last()).toEqual(['Bolt', '/work/web'])

  // Two of a type and nothing to tell them by: neither is taken, and each
  // is still there for the call that gives its title, under any name.
  const cache = await handed({ task: 'Add the cache', title: 'Cache', repo: '/work/api' })
  const queue = await handed({ task: 'Add the queue', title: 'Queue', repo: '/work/web' })
  await agent({ prompt: 'Do the caching work.', description: 'Caching' })
  expect(last()[1]).toBeUndefined()
  expect([cache, queue]).not.toContain(last()[0])
  await agent({ prompt: 'Do the queue work.', description: 'Queue', name: 'q1' })
  expect(last()).toEqual([queue, '/work/web'])
  expect(rowOf(await roster($), queue ?? '')).toMatch(/: address "q1", starting, repo \/work\/web, /)
})

test('several workers handed over in one response are each started by the Agent call whose description names it, however alike or reworded', async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [], spawns: [], refuse: NO_VERDICT }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  // Three of one type under one title, as parts of one job are.
  const input = (repo: string) => ({ task: `Review ${repo}`, title: 'Review', repo, fresh: true })
  const handoffs = await Promise.all(
    ['/work/api', '/work/web', '/work/docs'].map(async (repo, i) =>
      String((await $.tool.call({ tool: DELEGATE, tool_use_id: `toolu_d${i}`, ...input(repo) })).result),
    ),
  )
  expect(handoffs.map(text => /Agent tool with description "([^"]*)"/.exec(text)?.[1])).toEqual(['(Pip) Review', '(Bolt) Review', '(Mika) Review'])
  // Only the session's first says how new workers start from here on.
  expect(handoffs.map(text => /For several new workers, make the delegate calls in one message/.test(text))).toEqual([true, false, false])

  // The Agent calls of the next response, in another order and reworded.
  for (const [i, name] of [
    [2, 'Mika'],
    [0, 'Pip'],
    [1, 'Bolt'],
  ] as const) {
    await spawnAgent($, {
      prompt: 'Please review the code there.',
      description: `(${name}) Review`,
      subagentType: 'general-purpose',
      tool_use_id: `toolu_a${i}`,
    })
  }
  expect(seen.prompts.map(p => /^\[crew\] You are (\w+),/.exec(p)?.[1])).toEqual(['Mika', 'Pip', 'Bolt'])
  expect(seen.spawns?.map(s => s.cwd)).toEqual(['/work/docs', '/work/api', '/work/web'])

  // Each delegate call's row is its worker's, a new one, as after a spawn delegate made.
  const row = await mountRow($, toolRow(DELEGATE, 'toolu_d1', input('/work/web'), { output: handoffs[1] }))
  expect(await row.find({ type: 'Text', text: /^╭─ Nova → Bolt · Review ─+╮$/ })).toBeDefined()
  expect(await row.find({ type: 'Text', text: /^╰─ new ─+╯$/ })).toBeDefined()
  await row.unmount()
})

test('a spawn auto mode gave no verdict for is not tried again in the session, until the session starts anew or leaves that mode', async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [], spawns: [], refuse: NO_VERDICT }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  const start = () => $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  await start()
  const delegate = async (task: string) => String((await $.tool.call({ tool: DELEGATE, task, title: task, repo: '/work/api', fresh: true })).result)
  const agent = (prompt: string, permissionMode: string) =>
    spawnAgent($, { prompt, description: prompt, subagentType: 'general-purpose', tool_use_id: `toolu_${prompt}`, permissionMode })

  // The first is tried and refused; the next are handed over at once, and
  // each is still the crew's worker when its Agent call comes.
  expect(await delegate('Run the tests')).toMatch(/Start Pip yourself before this turn ends/)
  expect(await delegate('Fix the login')).toMatch(/Start Bolt yourself before this turn ends/)
  expect(seen.refused).toBe(1)
  await agent('Fix the login', 'auto')
  expect([seen.prompts[0]?.slice(0, 20), seen.spawns?.[0]?.cwd]).toEqual(['[crew] You are Bolt,', '/work/api'])
  expect(await delegate('Write the docs')).toMatch(/Start Mika yourself before this turn ends/)
  expect(seen.refused).toBe(1)

  // The main conversation starts an agent out of auto mode: delegate's own
  // spawn is tried again, and starts its worker where nothing refuses it.
  await agent('Write the docs', 'default')
  seen.refuse = undefined
  expect(await delegate('Ship it')).toMatch(/^Started Tito /)

  // A session started anew tries again too.
  seen.refuse = NO_VERDICT
  expect(await delegate('Tag it')).toMatch(/Start Luna yourself before this turn ends/)
  expect(await delegate('Announce it')).toMatch(/Start Rex yourself before this turn ends/)
  expect(seen.refused).toBe(2)
  await start()
  expect(await delegate('Archive it')).toMatch(/yourself before this turn ends/)
  expect(seen.refused).toBe(3)
})

test("a worker on the session's model is asked for it by the alias the Agent tool takes", async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[], spawns: [] as AgentSpawnInput[], refuse: NO_VERDICT }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const handOff = async (repo: string) => {
    const result = String((await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Run the tests', title: 'Tests', repo })).result)
    return /Start (\w+) yourself/.exec(result)![1]!.toLowerCase()
  }
  const start = (name: string | undefined, parentModel: string, id: string) =>
    spawnAgent($, {
      prompt: 'Run the tests',
      description: 'Tests',
      subagentType: 'Explore',
      ...(name ? { name } : {}),
      tool_use_id: id,
      background: false,
      parentModel,
    })

  await start(await handOff('/work/api'), 'claude-opus-5-5', 'toolu_1')
  await start(await handOff('/work/web'), 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'toolu_2')
  await start(await handOff('/work/docs'), 'local-model', 'toolu_3')
  // An Agent call of the orchestrator's own runs as it was asked.
  await start(undefined, 'claude-opus-5-5', 'toolu_4')
  expect(seen.spawns.map(s => s.model)).toEqual(['opus', 'sonnet', undefined, undefined])
})

test("a worker runs on the session's model, haiku in a session on haiku, and a haiku request gets the session's", async ($, on) => {
  let spawned = 0
  // The orchestrator's Agent call carries the session's model as its parent's,
  // which the test kit leaves out of a spawn the plugin makes itself.
  const seen = { prompts: [] as string[], sends: [] as string[], spawns: [] as AgentSpawnInput[], refuse: NO_VERDICT }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: false })
  const start = async (repo: string, parentModel: string, model?: string) => {
    const result = String((await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Run the tests', title: 'Tests', repo, ...(model ? { model } : {}) })).result)
    expect(result).not.toMatch(/model "/)
    const name = /Start (\w+) yourself/.exec(result)![1]!.toLowerCase()
    await spawnAgent($, {
      prompt: 'Run the tests',
      description: 'Tests',
      subagentType: 'general-purpose',
      name,
      tool_use_id: `toolu_${name}`,
      background: false,
      parentModel,
    })
  }

  await start('/work/api', 'claude-haiku-4-5')
  await start('/work/web', 'claude-haiku-4-5', 'haiku')
  await start('/work/docs', 'claude-opus-5-5', 'haiku')
  await start('/work/app', 'claude-sonnet-5-5', 'claude-haiku-4-5')
  expect(seen.spawns.map(s => s.model)).toEqual(['haiku', 'haiku', 'opus', 'sonnet'])
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

  expect(await delegate({ task: 'List the routes', repo: '/work/api', model: 'sonnet' })).toMatch(/^Started Pip/)
  await done('agent-1')
  // Without a model, only a worker on the session's model, opus, will do.
  expect(await delegate({ task: 'Design the cache', repo: '/work/api' })).toMatch(/^Started Bolt/)
  await done('agent-2')
  // A model asked for is one the worker must run on; Pip and Mika stay busy from here.
  expect(await delegate({ task: 'Check the queries', repo: '/work/api', model: 'sonnet' })).toMatch(/^Given to Pip/)
  expect(await delegate({ task: 'Review it', repo: '/work/api', model: 'fable' })).toMatch(/^Started Mika/)
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
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...input })).result)
  const done = (agentId: string) => $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })

  expect(await delegate({ task: 'Map the API', repo: 'C:\\work\\api' })).toMatch(/^Started Pip .* in C:\\work\\api, /)
  await done('agent-1')
  // Another case, the other slash, a trailing one: the same repository.
  expect(await delegate({ task: 'Fix the router', repo: 'c:/work/api/' })).toMatch(/^Given to Pip /)
  // A teammate there is named by its folder, not the whole path.
  await delegate({ task: 'Write the docs', repo: '..\\api', fresh: true })
  expect(seen.prompts[seen.prompts.length - 1]).toMatch(/Teammates you can reach with SendMessage: Pip \("pip", api\)/)
  expect(await delegate({ task: 'Style it', repo: '../web', fresh: true })).toMatch(/ in C:\\work\\web, /)
  // Git Bash's spelling, a path from the drive's root, the home and a share.
  expect(await delegate({ task: 'Shop', repo: '/c/work/shop', fresh: true })).toMatch(/ in C:\\work\\shop, /)
  expect(await delegate({ task: 'Root', repo: '\\tools', fresh: true })).toMatch(/ in C:\\tools, /)
  expect(await delegate({ task: 'Home', repo: '~\\code', fresh: true })).toMatch(/ in C:\\Users\\ana\\code, /)
  expect(await delegate({ task: 'Share', repo: '\\\\srv\\team\\x\\..\\y', fresh: true })).toMatch(/ in \\\\srv\\team\\y, /)
})

test('a failed worker is never taken unnamed, and is when named', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })).result)

  expect(await delegate({ task: 'Migrate the schema' })).toMatch(/^Started Pip/)
  await $.turn.complete({ answer: 'API error', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'error' })
  expect(String((await $.tool.call({ tool: 'mcp__crew__roster', worker: 'pip' })).result)).toMatch(/^- Pip: address "pip", failed, /)
  expect(await delegate({ task: 'Seed the data' })).toMatch(/^Started Bolt/)
  expect(await delegate({ task: 'Try the migration again', worker: 'pip' })).toBe(
    'Given to Pip (address "pip") in /work/api, as named; context kept. Pip\'s last run failed: if this task builds on that one, have it check what was left undone.\nHeads-up: Bolt is working in this repository; keep files apart or wait for its report.',
  )
})

test('a busy worker named for a task keeps the title of the one in flight, and the result says it was busy', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })).result)
  const pip = async () => String((await $.tool.call({ tool: 'mcp__crew__roster', worker: 'pip' })).result)

  expect(await delegate({ task: 'Migrate the schema', title: 'Schema' })).toMatch(/^Started Pip/)
  expect(await delegate({ task: 'Seed the data too', title: 'Seeds', worker: 'pip' })).toBe(
    'Given to Pip (address "pip") in /work/api, as named; context kept. Pip is busy: the task reached it as a message in the middle of "Schema", which it may finish first or set aside.',
  )
  // The task went all the same, and counts.
  expect(seen.sends[seen.sends.length - 1]).toMatch(/^Seed the data too\n/)
  expect(await pip()).toMatch(/, 2 tasks, .*last task "Schema"/)
  expect(await pip()).not.toMatch(/Seeds/)

  // Free again, it takes the next task's title and no warning.
  await $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  expect(await delegate({ task: 'Add the indexes', title: 'Indexes', worker: 'pip' })).toBe(
    'Given to Pip (address "pip") in /work/api, as named; context kept.',
  )
  expect(await pip()).toMatch(/last task "Indexes"/)
})

test('a worker the list let go is found on the shelf by name, address or id, and is back on the list with the task', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: DELEGATE, ...input })).result)
  const roster = async (worker?: string) => String((await $.tool.call({ tool: 'mcp__crew__roster', ...(worker ? { worker } : {}) })).result)
  const done = (agentId: string) => $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })

  // More free workers than the list keeps: the three oldest go to the shelf.
  for (let i = 1; i <= 28; i++) {
    await delegate({ task: `Task ${i}`, repo: `/work/r${i}`, fresh: true })
    await clock.advance(1000)
    await done(`agent-${i}`)
  }
  const head = async () => (await roster()).split('\n')[0]
  expect(await head()).toBe("Nova's crew (25):")

  // Asked for by name, the roster shows one from the shelf and leaves it there.
  expect(await roster('Pip')).toMatch(/^- Pip: address "pip", done, repo \/work\/r1, /)
  expect(await head()).toBe("Nova's crew (25):")

  expect(await delegate({ task: 'By name', worker: 'Pip' })).toMatch(/^Given to Pip \(address "pip"\) in \/work\/r1, as named; context kept\./)
  expect(await delegate({ task: 'By address', worker: 'bolt [3fa9c1]' })).toMatch(/^Given to Bolt .* in \/work\/r2, as named; /)
  expect(await delegate({ task: 'By id', worker: 'agent-3' })).toMatch(/^Given to Mika .* in \/work\/r3, as named; /)
  expect(seen.sends.map(s => s.split('\n')[0])).toEqual(['By name', 'By address', 'By id'])
  expect(await head()).toBe("Nova's crew (28):")
  const back = await roster()
  for (const name of ['Pip', 'Bolt', 'Mika']) expect(back).toMatch(new RegExp(`- ${name}: address "${name.toLowerCase()}", working, `))

  // On neither the list nor the shelf: no such worker, and nothing started.
  expect(await delegate({ task: 'Nobody', worker: 'nobody' })).toMatch(/^crew: no worker "nobody"\. Workers: /)
  expect(spawned).toBe(28)
})

test('the result says why its worker got the task: named, the free one, or a new one and why', async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })).result)
  const done = (agentId: string) => $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })
  const first = (result: string) => result.split('\n')[0]

  expect(await delegate({ task: 'Map the API' })).toBe('Started Pip (address "pip", id ?) in /work/api, as no free worker of that type and model was there.')
  await done('agent-1')
  expect(first(await delegate({ task: 'Write the docs', fresh: true }))).toBe('Started Bolt (address "bolt", id ?) in /work/api, as `fresh` asked.')
  expect(first(await delegate({ task: 'Add the endpoint' }))).toBe(
    'Given to Pip (address "pip") in /work/api, the free worker of that type and model there that last finished a task; context kept: last task "Map the API", finished 0s ago, 0 tokens used.',
  )
  await done('agent-1')
  expect(first(await delegate({ task: 'Test the endpoint', worker: 'pip' }))).toBe('Given to Pip (address "pip") in /work/api, as named; context kept.')
  await done('agent-1')

  // A free worker the task did not reach: a new one takes it, and the result
  // names the one that was tried and why it failed.
  seen.undelivered = 'the agent is gone.'
  expect(first(await delegate({ task: 'Review the endpoint' }))).toBe(
    'Started Mika (address "mika", id ?) in /work/api, as Pip, free there, could not be reached (the agent is gone).',
  )
})

test('a free worker that cannot be reached gives way to the next free one, and a new one starts only when none is reached', async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [] }
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })).result)
  let turns = 0
  const done = async (agentId: string) => {
    await clock.advance(1000)
    await $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${++turns}`, agentId, reason: 'answer' })
  }
  const first = (result: string) => result.split('\n')[0]
  const gone = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, 'crew: the agent is gone.']))

  // Four free workers, best first: Tito, Mika, Bolt, Pip.
  for (const task of ['Map the API', 'Write the docs', 'Add the endpoint', 'Test the endpoint']) await delegate({ task, fresh: true })
  for (const id of ['agent-1', 'agent-2', 'agent-3', 'agent-4']) await done(id)

  // The first cannot be reached: the second takes the task, and no worker starts.
  seen.gone = gone('agent-4')
  expect(first(await delegate({ task: 'Review the endpoint' }))).toBe(
    'Given to Mika (address "mika") in /work/api, the next free worker of that type and model there (also free: Bolt, Pip; name one with `worker` to pick it), as Tito could not be reached (the agent is gone); context kept: last task "Add the endpoint", finished 1s ago, 0 tokens used.',
  )
  expect(spawned).toBe(4)
  expect(seen.sends.slice(-2).map(text => text.split('\n')[0])).toEqual(['Review the endpoint', 'Review the endpoint'])
  await done('agent-3')

  // Two cannot be reached, in the order tried: Mika, Tito, then Bolt.
  seen.gone = gone('agent-3', 'agent-4')
  expect(first(await delegate({ task: 'Polish the endpoint' }))).toBe(
    'Given to Bolt (address "bolt") in /work/api, the next free worker of that type and model there (also free: Pip; name one with `worker` to pick it), as Mika (the agent is gone) and Tito (the agent is gone) could not be reached; context kept: last task "Write the docs", finished 3s ago, 0 tokens used.',
  )
  expect(spawned).toBe(4)
  await done('agent-2')

  // Three are tried and none is reached: a new worker starts, and its reason
  // names them and the one that was not tried.
  seen.gone = gone('agent-1', 'agent-2', 'agent-3', 'agent-4')
  const sent = seen.sends.length
  expect(first(await delegate({ task: 'Ship the endpoint' }))).toBe(
    'Started Luna (address "luna", id ?) in /work/api, as Bolt (the agent is gone), Mika (the agent is gone) and Tito (the agent is gone), free there, could not be reached, and no more were tried (also free: Pip; name one with `worker` to pick it).',
  )
  expect(seen.sends.length).toBe(sent + 3)
  expect(spawned).toBe(5)
})

test('a free worker whose send may have gone out ends the call: no other worker gets the task and none starts', async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [] }
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })).result)

  // Three free workers, best first: Mika, Bolt, Pip.
  for (const task of ['Map the API', 'Write the docs', 'Add the endpoint']) await delegate({ task, fresh: true })
  for (const agentId of ['agent-1', 'agent-2', 'agent-3']) {
    await clock.advance(1000)
    await $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })
  }

  // The first may have the task: it is sent once, and no one else is tried.
  seen.gone = { 'agent-3': SEND_UNSURE }
  let sent = seen.sends.length
  expect(await delegate({ task: 'Review the endpoint' })).toBe(
    'crew: the task may have reached Mika (address "mika"): its send failed on its way, so no other worker was tried and none started. See whether Mika is working (mcp__crew__roster with `worker` "mika"): if it is, it has the task and reports to you; if not, give the task again.',
  )
  expect(seen.sends.length).toBe(sent + 1)
  expect(spawned).toBe(3)

  // One that could not be reached before it is named, and the one after it gets nothing.
  seen.gone = { 'agent-3': 'crew: the agent is gone.', 'agent-2': SEND_UNSURE }
  sent = seen.sends.length
  expect(await delegate({ task: 'Review the endpoint' })).toBe(
    'crew: the task may have reached Bolt (address "bolt"): its send failed on its way, so no other worker was tried and none started. Before it, Mika could not be reached (the agent is gone). See whether Bolt is working (mcp__crew__roster with `worker` "bolt"): if it is, it has the task and reports to you; if not, give the task again.',
  )
  expect(seen.sends.length).toBe(sent + 2)
  expect(spawned).toBe(3)
})

test('a worker whose last run was stopped is reused with a word on it, named or not, and with none once it finished a run', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })).result)
  const ends = (turnId: string, isAborted: boolean) =>
    $.turn.complete({ answer: '', durationMs: 1, isAborted, turnId, agentId: 'agent-1', reason: isAborted ? 'aborted' : 'answer' })
  const stopped = " Pip's last run was stopped: if this task builds on that one, have it check what was left undone."

  expect(await delegate({ task: 'Migrate the schema' })).toMatch(/^Started Pip/)
  await ends('t1', true)
  expect(await delegate({ task: 'Seed the data' })).toBe(
    `Given to Pip (address "pip") in /work/api, the free worker of that type and model there that last finished a task; context kept: last task "Migrate the schema", finished 0s ago, 0 tokens used.${stopped}`,
  )
  await ends('t2', true)
  expect(await delegate({ task: 'Seed the data again', worker: 'pip' })).toBe(`Given to Pip (address "pip") in /work/api, as named; context kept.${stopped}`)
  await ends('t3', false)
  expect(await delegate({ task: 'Add the indexes' })).toBe(
    'Given to Pip (address "pip") in /work/api, the free worker of that type and model there that last finished a task; context kept: last task "Seed the data again", finished 0s ago, 0 tokens used.',
  )
  expect(spawned).toBe(1)
})

test('a worker sent where another is busy hears of it', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (ask: Ask) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...ask })).result)

  expect(await delegate({ task: 'Refactor the router', repo: '/work/api' })).not.toMatch(/Heads-up/)
  const second = await delegate({ task: 'Update the docs', repo: '/work/api' })
  expect(second).toMatch(/^Started Bolt \(address "bolt", id [^)]+\) in \/work\/api, as no free worker of that type and model was there\.\nHeads-up: /)
  expect(second).toMatch(/\nHeads-up: Pip is working in this repository; keep files apart or wait for its report\.$/)
  expect(await delegate({ task: 'Fix the styles', repo: '/work/web' })).not.toMatch(/Heads-up/)
})

test('a worker named for a task hears of who is busy in its own repository', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...input })).result)
  const done = (agentId: string) => $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })

  expect(await delegate({ task: 'Map the API', repo: '/work/api' })).toMatch(/^Started Pip/)
  await done('agent-1')
  expect(await delegate({ task: 'Refactor the router', repo: '/work/api', fresh: true })).toMatch(/^Started Bolt/)
  expect(await delegate({ task: 'Fix the styles' })).toMatch(/^Started Mika/)
  // Pip stays in /work/api, whatever the session's directory or `repo` say.
  for (const extra of [{}, { repo: '/work/web' }]) {
    const given = await delegate({ task: 'Add the endpoint', worker: 'pip', ...extra })
    expect(given).toMatch(/^Given to Pip \(address "pip"\) in \/work\/api, as named; context kept\.( Not applied|\n|$)/)
    expect(given).toMatch(/\nHeads-up: Bolt is working in this repository; .*its report\.$/)
    expect(given).not.toMatch(/Mika/)
    await done('agent-1')
  }

  // One in a worktree of its own edits apart: no heads-up.
  await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_1', isolation: 'worktree', prompt: 'Fix it', description: 'Fix' })
  await spawnAgent($, { prompt: 'Fix it', description: 'Fix', subagentType: 'general-purpose', tool_use_id: 'toolu_1' })
  await done('agent-4')
  const apart = await delegate({ task: 'Fix the rest', worker: 'agent-4' })
  expect(apart).toMatch(/^Given to Tito \(address "agent-4"\) in a worktree of \/work\/main, as named; context kept\.$/)
  expect(apart).not.toMatch(/Heads-up/)
  // It was not started by delegate: it hears the whole report rule.
  expect(seen.sends[seen.sends.length - 1]).toMatch(/^Fix the rest\n\nWhen done, report the outcome first, then only facts: /)
})

test('a named worker stays as it is, and the result notes what the call asked that it is not', async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen, host: { exists: path => !path.includes('missing') } })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...input })).result)
  const done = () =>
    $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: `t-${seen.sends.length}`, agentId: 'agent-1', reason: 'answer' })
  const own = { repo: '/work/api', subagent_type: 'Explore', model: 'sonnet' }
  const plain = 'Given to Pip (address "pip") in /work/api, as named; context kept.'
  const note = ' Not applied, as a named worker stays as it is: '

  expect(await delegate({ task: 'Find the auth code', ...own })).toMatch(/^Started Pip/)
  await done()
  // What matches the worker, or is not given, is not noted.
  expect(await delegate({ task: 'Find the routes', worker: 'pip', ...own })).toBe(plain)
  await done()
  expect(await delegate({ task: 'Find the models', worker: 'pip', fresh: false })).toBe(plain)
  await done()

  // Each argument the worker is not, alone.
  const each: [Record<string, unknown>, string][] = [
    [{ repo: '/work/web' }, '`repo` /work/web (it works in /work/api)'],
    [{ subagent_type: 'Plan' }, '`subagent_type` Plan (it is Explore)'],
    [{ model: 'opus' }, '`model` opus (it runs on test-model)'],
    [{ fresh: true }, '`fresh` (it is not a new worker)'],
  ]
  for (const [extra, said] of each) {
    expect(await delegate({ task: 'Find the tests', worker: 'pip', ...extra })).toBe(`${plain}${note}${said}.`)
    expect(seen.sends[seen.sends.length - 1]).toMatch(/^Find the tests\n/)
    await done()
  }
  // All of them, in the order of the tool's arguments.
  expect(await delegate({ task: 'Find the rest', worker: 'pip', repo: '/work/web', subagent_type: 'Plan', model: 'opus', fresh: true })).toBe(
    `${plain}${note}${each.map(([, said]) => said).join('; ')}.`,
  )
  await done()

  // A value no new worker could take does not turn the call down: it would not be used.
  expect(await delegate({ task: 'Find the docs', worker: 'pip', repo: '/work/missing', subagent_type: 'fork', model: 'gpt-5' })).toBe(
    `${plain}${note}\`repo\` /work/missing (it works in /work/api); \`subagent_type\` fork (it is Explore); \`model\` gpt-5 (it runs on test-model).`,
  )
  expect(spawned).toBe(1)
  // With no worker named it still does.
  expect(await delegate({ task: 'Find the docs', repo: '/work/missing' })).toBe('crew: /work/missing does not exist.')
  expect(await delegate({ task: 'Find the docs', model: 'gpt-5' })).toMatch(/^crew: no model "gpt-5"/)
  expect(await delegate({ task: 'Find the docs', subagent_type: 'fork' })).toMatch(/a fork starts from the Agent tool/)
})

test('a worker can be of another agent type, and is reused only for that type', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...input })).result)

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
test("a worker's type is kept as delegate was asked for it", async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })).result)

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

test('a free worker running on a full id of the family asked for is reused, whatever alias it was asked', async ($, on) => {
  let spawned = 0
  // A spawn answers the full id its agent runs on: the session's when the
  // call asks for none.
  const runsOn = (asked: string | undefined) => (asked === 'sonnet' ? 'claude-sonnet-4-5-20250929' : 'us.anthropic.claude-opus-5-5-v1:0')
  engine(on, { nextId: () => `agent-${++spawned}`, runsOn })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (ask: Ask) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...ask })).result)
  const done = (agentId: string, turnId: string) => $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId, agentId, reason: 'answer' })

  expect(await delegate({ task: 'List the routes', repo: '/work/api' })).toMatch(/^Started Pip/)
  await done('agent-1', 't1')
  expect(await delegate({ task: 'Check the queries', repo: '/work/api', model: 'opus' })).toMatch(/^Given to Pip/)
  await done('agent-1', 't2')
  // Another family is not the model it runs on.
  expect(await delegate({ task: 'Review the login', repo: '/work/api', model: 'sonnet' })).toMatch(/^Started Bolt/)
  await done('agent-2', 't3')
  // No model asked: only the one on the session's model, not the newer one.
  expect(await delegate({ task: 'Polish it', repo: '/work/api' })).toMatch(/^Given to Pip/)
})

test("a free worker on the session's model is reused whether its call or the next names that model or none, and one on another model never", async ($, on) => {
  let spawned = 0
  let turns = 0
  // The session is on opus, and a spawn answers the id its agent runs on.
  const runsOn = (asked: string | undefined) => (asked === 'sonnet' ? 'claude-sonnet-4-5' : 'claude-opus-5-5')
  engine(on, { nextId: () => `agent-${++spawned}`, runsOn })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (ask: Ask) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...ask })).result)
  const done = (agentId: string) => $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: `t${++turns}`, agentId, reason: 'answer' })

  // Asked for the session's model by name, then for none.
  expect(await delegate({ task: 'List the routes', repo: '/work/api', model: 'opus' })).toMatch(/^Started Pip/)
  await done('agent-1')
  expect(await delegate({ task: 'Check the queries', repo: '/work/api' })).toMatch(/^Given to Pip/)
  // Asked for none, then for the session's model by name.
  expect(await delegate({ task: 'Review the login', repo: '/work/web' })).toMatch(/^Started Bolt/)
  await done('agent-2')
  expect(await delegate({ task: 'Polish it', repo: '/work/web', model: 'opus' })).toMatch(/^Given to Bolt/)
  // Asked for another model by name, then for none: a new worker.
  expect(await delegate({ task: 'Write the guide', repo: '/work/docs', model: 'sonnet' })).toMatch(/^Started Mika/)
  await done('agent-3')
  expect(await delegate({ task: 'Check the links', repo: '/work/docs' })).toMatch(/^Started (?!Mika)/)
  await done('agent-4')
  // Asked for none, then for another model by name: the one on it, not the
  // one that ended a turn last.
  expect(await delegate({ task: 'Fix the typos', repo: '/work/docs', model: 'sonnet' })).toMatch(/^Given to Mika/)
})

test('in a session whose model names no family, a call for no model reuses only a worker asked for none', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}`, host: { model: () => 'local-model' } })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (ask: Ask) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...ask })).result)
  const done = (agentId: string, turnId: string) => $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId, agentId, reason: 'answer' })

  expect(await delegate({ task: 'List the routes', repo: '/work/api', model: 'opus' })).toMatch(/^Started Pip/)
  await done('agent-1', 't1')
  expect(await delegate({ task: 'Check the queries', repo: '/work/api' })).toMatch(/^Started Bolt/)
  await done('agent-2', 't2')
  expect(await delegate({ task: 'Polish it', repo: '/work/api' })).toMatch(/^Given to Bolt/)
})

test('among several free workers the one that ended a turn last is reused, whichever was touched last', async ($, on) => {
  let spawned = 0
  const clock = engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (ask: Ask) => String((await $.tool.call({ tool: 'mcp__crew__delegate', ...ask })).result)
  const done = (agentId: string, turnId: string) => $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId, agentId, reason: 'answer' })

  expect(await delegate({ task: 'List the routes', repo: '/work/api', fresh: true })).toMatch(/^Started Pip/)
  expect(await delegate({ task: 'Check the queries', repo: '/work/api', fresh: true })).toMatch(/^Started Bolt/)
  await clock.advance(1000)
  await done('agent-1', 't1')
  await clock.advance(1000)
  await done('agent-2', 't2')
  // A message to the one that ended first touches it, and it stays free.
  await clock.advance(1000)
  await $.session.send({ to: 'pip', text: 'Thanks', origin: { kind: 'model' } } as Parameters<typeof $.session.send>[0])
  expect(await delegate({ task: 'Polish it', repo: '/work/api' })).toMatch(/^Given to Bolt/)

  // Pip ends a turn after Bolt's task is over: it is the pick again.
  await clock.advance(1000)
  await done('agent-2', 't3')
  await clock.advance(1000)
  await done('agent-1', 't4')
  expect(await delegate({ task: 'Count the lines', repo: '/work/api' })).toMatch(/^Given to Pip/)
})

test('an unnamed call passes over a free worker whose last turn ended too long ago to be cached, names it, and says what its pick holds', async ($, on) => {
  let spawned = 0
  const clock = engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) =>
    String((await $.tool.call({ tool: 'mcp__crew__delegate', repo: '/work/api', ...input })).result).split('\n')[0]
  let turns = 0
  const done = (agentId: string) =>
    $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: `t${++turns}`, agentId, reason: 'answer', usage: USAGE })

  await delegate({ task: 'Map the API', title: 'API map' })
  await delegate({ task: 'Write the docs', title: 'Docs', fresh: true })
  await done('agent-1')
  await clock.advance(3 * 60_000)
  await done('agent-2')
  await clock.advance(2 * 60_000)
  // Pip ended five minutes ago, Bolt two: Bolt takes the task, the result
  // says what its context holds, and Pip is named for a call that wants it.
  expect(await delegate({ task: 'Add the endpoint', title: 'Endpoint' })).toBe(
    'Given to Bolt (address "bolt") in /work/api, the free worker of that type and model there that last finished a task (also free: Pip; name one with `worker` to pick it); context kept: last task "Docs", finished 2m ago, ~45k tokens used.',
  )
  expect(spawned).toBe(2)

  // Every free candidate past the window: a new worker starts, and its reason names them, best first.
  await done('agent-2')
  await clock.advance(4 * 60_000)
  expect(await delegate({ task: 'Test the endpoint', title: 'Tests' })).toBe(
    'Started Mika (address "mika", id ?) in /work/api, as no free worker of that type and model there finished a task in the last 4 min, so none has its context cached (also free: Bolt, Pip; name one with `worker` to pick it).',
  )
  expect(spawned).toBe(3)

  // Named, a worker long idle still takes the task, and its result is a named one's.
  expect(await delegate({ task: 'Recheck the map', worker: 'pip' })).toBe('Given to Pip (address "pip") in /work/api, as named; context kept.')

  // A second short of the window it is still reused.
  await done('agent-3')
  await clock.advance(4 * 60_000 - 1000)
  expect(await delegate({ task: 'One more' })).toBe(
    'Given to Mika (address "mika") in /work/api, the free worker of that type and model there that last finished a task (also free: Bolt; name one with `worker` to pick it); context kept: last task "Tests", finished 3m ago, ~45k tokens used.',
  )
  expect(spawned).toBe(3)
})

const roster = async ($: Parameters<TestBody>[0]) => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
const rowOf = (text: string, name: string) => text.split('\n').find(line => line.startsWith(`- ${name}: `)) ?? ''

test('two forks a worker starts in one response take names of their own, each a fork of it', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Investigate the checkout, then split it', repo: '/work/shop' })
  const fork = (prompt: string) => spawnAgent($, { prompt, description: prompt, subagentType: 'fork', fork: true, parentAgentId: 'agent-1' })
  await Promise.all([fork('Do the frontend'), fork('Do the backend')])

  const text = await roster($)
  const forks = text
    .split('\n')
    .filter(line => / fork of Pip, /.test(line))
    .map(line => /^- (\S+):/.exec(line)?.[1])
  expect(forks).toHaveLength(2)
  expect(new Set(forks).size).toBe(2)
  expect(forks).not.toContain('Pip')
})

test("a name the Agent call gives that does not fit a card is replaced, and the call hears the crew's name and address", async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Map the auth flow', repo: '/work/api' })
  const call = { prompt: 'Read the auth module', description: 'Scout auth', subagentType: 'Explore', name: 'researcher-auth', parentAgentId: 'agent-1' }
  await spawnAgent($, { ...call, tool_use_id: 'toolu_7' })
  const done = await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_7', agentId: 'agent-1', ...call })

  expect(done.context).toEqual([
    '[crew] The crew calls this agent Bolt, not "researcher-auth": a worker\'s name is 2 to 4 characters and no other worker\'s. SendMessage reaches it as "researcher-auth".',
  ])
  expect(rowOf(await roster($), 'Bolt')).toMatch(/^- Bolt: address "researcher-auth", starting, started by Pip, /)
})

test('a name too short or already taken is replaced too, and a taken one leaves the agent its id to be reached by', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Map the auth flow', repo: '/work/api' })
  const agent = async (name: string, id: string) => {
    const call = { prompt: `Look at ${name}`, description: name, subagentType: 'general-purpose', name, parentAgentId: 'agent-1' }
    await spawnAgent($, { ...call, tool_use_id: id })
    return (await $.tool.call({ tool: 'Agent', tool_use_id: id, agentId: 'agent-1', ...call })).context ?? []
  }

  expect(await agent('x', 'toolu_1')).toEqual([expect.stringMatching(/^\[crew\] The crew calls this agent Bolt, not "x": .* SendMessage reaches it as "x"\.$/)])
  expect(await agent('PIP', 'toolu_2')).toEqual([
    expect.stringMatching(/^\[crew\] The crew calls this agent Mika, not "PIP": .* SendMessage reaches it as "agent-3"\.$/),
  ])
  // One that fits and is free is kept, and nothing is said.
  expect(await agent('qa', 'toolu_3')).toEqual([])

  const text = await roster($)
  expect(rowOf(text, 'Pip')).toMatch(/^- Pip: address "pip", /)
  expect(rowOf(text, 'Mika')).toMatch(/^- Mika: address "agent-3", /)
  expect(rowOf(text, 'Qa')).toMatch(/^- Qa: address "qa", /)
  expect(text.match(/^- Pip: /gm)).toHaveLength(1)
})

test("Claude Code's list shows each agent by its crew name and title, and the crew keeps the bare title", async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[], spawns: [] as AgentSpawnInput[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  // Delegate's own worker.
  await $.tool.call({ tool: DELEGATE, task: 'Run the tests', title: 'Tests', repo: '/work/api' })
  // The Agent tool's, with a name, without one, with the name already ahead, and a fork.
  await spawnAgent($, { prompt: 'Map auth', description: 'Scout auth', subagentType: 'Explore', name: 'bolt', tool_use_id: 'toolu_1' })
  await spawnAgent($, { prompt: 'Read the docs', description: 'Docs', subagentType: 'Explore', tool_use_id: 'toolu_2' })
  await spawnAgent($, { prompt: 'Lint it', description: '(Tito) Lint', subagentType: 'Explore', name: 'tito', tool_use_id: 'toolu_3' })
  await spawnAgent($, {
    prompt: 'Do the frontend',
    description: 'Frontend',
    subagentType: 'fork',
    fork: true,
    parentAgentId: 'agent-1',
    tool_use_id: 'toolu_4',
  })

  expect(seen.spawns.map(s => s.description)).toEqual(['(Pip) Tests', '(Bolt) Scout auth', '(Mika) Docs', '(Tito) Lint', '(Luna) Frontend'])
  const text = await roster($)
  expect(rowOf(text, 'Pip')).toMatch(/last task "Tests"/)
  expect(rowOf(text, 'Mika')).toMatch(/last task "Docs"/)
  expect(rowOf(text, 'Tito')).toMatch(/last task "Lint"/)
  expect(rowOf(text, 'Luna')).toMatch(/last task "Frontend"/)
})

test("an agent whose title another crew member's name stands ahead of shows only its own in Claude Code's list", async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[], spawns: [] as AgentSpawnInput[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Run the tests', title: 'Tests', repo: '/work/api' })
  // A worker's own agent, its title written as the worker sees its own named.
  await spawnAgent($, {
    prompt: 'Process it',
    description: '(Pip) Process the task',
    subagentType: 'Explore',
    parentAgentId: 'agent-1',
    tool_use_id: 'toolu_1',
  })
  // A new worker's title copied from another's, twice named.
  await $.tool.call({ tool: DELEGATE, task: 'Write the docs', title: '(Pip) (Bolt) Docs', repo: '/work/api', fresh: true })

  expect(seen.spawns.map(s => s.description)).toEqual(['(Pip) Tests', '(Bolt) Process the task', '(Mika) Docs'])
  const text = await roster($)
  expect(rowOf(text, 'Bolt')).toMatch(/last task "Process the task"/)
  expect(rowOf(text, 'Mika')).toMatch(/last task "Docs"/)
})

test('past the last name of the pool a worker takes a letter and a number, which no name taken before has', async ($, on) => {
  let spawned = 0
  const seen = { prompts: [] as string[], sends: [] as string[] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  // An agent the model named A1 is already one of the crew.
  await spawnAgent($, { prompt: 'Task 0', description: 'Task 0', subagentType: 'general-purpose', name: 'a1' })
  for (let i = 1; i <= WORKER_NAMES.length + 2; i++) {
    await spawnAgent($, { prompt: `Task ${i}`, description: `Task ${i}`, subagentType: 'general-purpose' })
  }

  const names = seen.prompts.map(p => /^\[crew\] You are (\S+), a worker/.exec(p)?.[1])
  expect(names.slice(1, 1 + WORKER_NAMES.length)).toEqual(WORKER_NAMES)
  expect(names.slice(-2)).toEqual(['B1', 'C1'])
  expect(new Set(names.map(n => n?.toLowerCase())).size).toBe(names.length)
})

test('a worker the user cleared keeps its name: no new worker or fork takes it', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Run the tests', repo: '/work/api' })
  await $.turn.complete({ answer: 'Done', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  await crewCommand($, 'clear')
  expect(rowOf(await roster($), 'Pip')).toBe('')

  const next = String((await $.tool.call({ tool: DELEGATE, task: 'Now the login', repo: '/work/web', fresh: true })).result)
  expect(next).toMatch(/^Started Bolt \(address "bolt"/)
  await spawnAgent($, { prompt: 'Split it', description: 'Split', subagentType: 'fork', fork: true, parentAgentId: 'agent-2' })
  expect(rowOf(await roster($), 'Mika')).toMatch(/ fork of Bolt, /)
})

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
