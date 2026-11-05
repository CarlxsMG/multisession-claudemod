import { expect } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { WORKER_NAMES } from '../src/persona/names'
import { DELEGATE, crewCommand, engine, spawnAgent, test } from './support/crew'

const roster = async ($: Parameters<TestBody>[0]) => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
const rowOf = (text: string, name: string) => text.split('\n').find(line => line.startsWith(`- ${name}: `)) ?? ''

test('two forks a worker starts in one response take names of their own, each a fork of it', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Investigate the checkout, then split it', repo: '/work/shop' })
  const fork = (prompt: string) =>
    spawnAgent($, { prompt, description: prompt, subagentType: 'fork', fork: true, parentAgentId: 'agent-1' })
  await Promise.all([fork('Do the frontend'), fork('Do the backend')])

  const text = await roster($)
  const forks = text.split('\n').filter(line => / fork of Pip, /.test(line)).map(line => /^- (\S+):/.exec(line)?.[1])
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
  expect(await agent('PIP', 'toolu_2')).toEqual([expect.stringMatching(/^\[crew\] The crew calls this agent Mika, not "PIP": .* SendMessage reaches it as "agent-3"\.$/)])
  // One that fits and is free is kept, and nothing is said.
  expect(await agent('qa', 'toolu_3')).toEqual([])

  const text = await roster($)
  expect(rowOf(text, 'Pip')).toMatch(/^- Pip: address "pip", /)
  expect(rowOf(text, 'Mika')).toMatch(/^- Mika: address "agent-3", /)
  expect(rowOf(text, 'Qa')).toMatch(/^- Qa: address "qa", /)
  expect(text.match(/^- Pip: /gm)).toHaveLength(1)
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
