import { expect } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'
import { COMPOSER, DELEGATE, crewCommand, engine, spawnAgent, test } from './support/crew'

type Dollar = Parameters<TestBody>[0]

const rowOf = async ($: Dollar, name: string) =>
  String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
    .split('\n')
    .find(line => line.startsWith(`- ${name}: `)) ?? ''
const finish = ($: Dollar, agentId: string) =>
  $.turn.complete({ answer: 'Done: PR merged.', durationMs: 1000, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })

// A crew of Pip and Bolt, Pip's fork, which the engine lists as `listed`
// says: running, ended, or not at all once it dropped its task.
async function forkCrew($: Dollar, on: On) {
  let spawned = 0
  const listed = new Map<string, AgentInfo['status']>()
  const agents = (): AgentInfo[] =>
    [...listed].map(([id, status]) => ({
      id,
      description: id,
      type: id === 'agent-2' ? 'fork' : 'general-purpose',
      status,
      ...(id === 'agent-1' ? { name: 'pip' } : {}),
    }))
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, agents })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Fix the relay queue, then split it', repo: '/work/api' })
  listed.set('agent-1', 'running')
  await spawnAgent($, { prompt: 'Fix the relay', description: 'Relay fix', subagentType: 'fork', fork: true, parentAgentId: 'agent-1' })
  listed.set('agent-2', 'running')
  await clock.advance(4000)
  return { clock, listed }
}

test('a fork the engine ends late stays done, and done once the engine drops it', async ($, on) => {
  const { clock, listed } = await forkCrew($, on)
  expect(await rowOf($, 'Bolt')).toMatch(/^- Bolt: address "agent-2", (starting|working), fork of Pip, /)

  await finish($, 'agent-2')
  // The engine ends the agent half a minute after its last turn, and drops it.
  await clock.advance(30_000)
  expect(await rowOf($, 'Bolt')).toMatch(/^- Bolt: address "agent-2", done, fork of Pip, /)
  listed.delete('agent-2')
  await clock.advance(70_000)
  expect(await rowOf($, 'Bolt')).toMatch(/^- Bolt: address "agent-2", done, fork of Pip, /)
})

test('a busy worker the engine dropped without an end the crew heard is stopped, its run closed', async ($, on) => {
  const { clock, listed } = await forkCrew($, on)
  // Its turn's end never reaches the crew.
  listed.delete('agent-2')
  await clock.advance(30_000)
  expect(await rowOf($, 'Bolt')).toMatch(/^- Bolt: address "agent-2", (starting|working), /)
  await clock.advance(40_000)
  expect(await rowOf($, 'Bolt')).toMatch(/^- Bolt: address "agent-2", stopped, fork of Pip, /)
  // Pip, which the engine still lists, works on.
  expect(await rowOf($, 'Pip')).toMatch(/^- Pip: address "pip", (starting|working), /)
})

test('a fork cleared before the engine ended it comes back busy, and takes its end once the engine drops it', async ($, on) => {
  const { clock, listed } = await forkCrew($, on)
  await finish($, 'agent-2')
  // Cleared while the engine still lists it as running, it comes back from
  // the shelf as busy, its run ended.
  await crewCommand($, 'clear')
  await clock.advance(4000)
  expect(await rowOf($, 'Bolt')).toMatch(/^- Bolt: address "agent-2", working, /)
  listed.delete('agent-2')
  await clock.advance(70_000)
  expect(await rowOf($, 'Bolt')).toMatch(/^- Bolt: address "agent-2", done, fork of Pip, /)
})

test('a busy worker the engine dropped across a reload is stopped, as it is within a load', async ($, on) => {
  const { clock, listed } = await forkCrew($, on)
  // The engine lists it before the reload, and no more after it: no sync of
  // the new load sees it, and its turn's end never reaches the crew.
  listed.delete('agent-2')
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await clock.advance(70_000)
  expect(await rowOf($, 'Bolt')).toMatch(/^- Bolt: address "agent-2", stopped, fork of Pip, /)
})

test('a worker the engine never listed stays busy when quiet, across a reload too', async ($, on) => {
  let spawned = 0
  const clock = engine(on, { nextId: () => `agent-${++spawned}` })
  const start = () => $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await start()
  await $.tool.call({ tool: DELEGATE, task: 'Fix the relay queue', repo: '/work/api' })
  await clock.advance(70_000)
  expect(await rowOf($, 'Pip')).toMatch(/^- Pip: address "[^"]+", (starting|working), /)
  await start()
  await clock.advance(70_000)
  expect(await rowOf($, 'Pip')).toMatch(/^- Pip: address "[^"]+", (starting|working), /)
})

// A crew whose workers the engine lists as `listed` says, with what the user's
// messages carry, the toasts, and the main conversation's delegate and roster.
async function watchedCrew($: Dollar, on: On) {
  let spawned = 0
  const listed = new Map<string, AgentInfo['status']>()
  const agents = (): AgentInfo[] => [...listed].map(([id, status]) => ({ id, description: id, type: 'general-purpose', status }))
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)
    return { text: e.text }
  })
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, agents })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: DELEGATE, repo: '/work/api', ...input })).result)
  const roster = async (agentId?: string) => String((await $.tool.call({ tool: 'mcp__crew__roster', ...(agentId ? { agentId } : {}) })).result)
  const submit = (text: string) => $.prompt.submit({ text, wait: false, origin: COMPOSER })
  return { clock, listed, contexts, toasts, delegate, roster, submit }
}

const GONE = (name: string, address: string, task: string) =>
  `${name} (address "${address}") ended without a report: the engine dropped it while it was on "${task}". Take that task as not done: give it again, to ${name} by name or to another worker.`

test("a busy worker the engine dropped with no end heard is told to the orchestrator once, in the user's next message", async ($, on) => {
  const { clock, listed, contexts, toasts, delegate, submit } = await watchedCrew($, on)
  await delegate({ task: 'Fix the relay queue', title: 'Relay' })
  listed.set('agent-1', 'running')
  await clock.advance(4000)
  listed.delete('agent-1')
  await clock.advance(70_000)
  expect(toasts).toContain('Pip ended without a report')
  await submit('How is it going?')
  await submit('And now?')
  expect(contexts[0]).toEqual([`[crew] ${GONE('Pip', 'pip', 'Relay')}`])
  expect(contexts[1] ?? []).toEqual([])
  expect(await rowOf($, 'Pip')).toMatch(/^- Pip: address "pip", stopped, /)
})

test("with no user message first, the next delegate or roster result of the main conversation says it, and a worker's own never does", async ($, on) => {
  const { clock, listed, contexts, delegate, roster, submit } = await watchedCrew($, on)
  await delegate({ task: 'Fix the relay queue', title: 'Relay' })
  await delegate({ task: 'Write the docs', title: 'Docs', fresh: true })
  for (const id of ['agent-1', 'agent-2']) listed.set(id, 'running')
  await clock.advance(4000)
  listed.delete('agent-1')
  await clock.advance(70_000)

  // A worker's look at the roster, and its refused delegate call, are told nothing.
  expect(await roster('agent-2')).not.toMatch(/ended without a report/)
  expect(await delegate({ task: 'Split this', agentId: 'agent-2' })).not.toMatch(/ended without a report/)
  const given = await delegate({ task: 'Fix the footer', title: 'Footer', repo: '/work/web' })
  expect(given).toMatch(/^Started Mika /)
  expect(given.split('\n').pop()).toBe(`crew: ${GONE('Pip', 'pip', 'Relay')}`)
  expect(await roster()).not.toMatch(/ended without a report/)

  listed.delete('agent-2')
  await clock.advance(70_000)
  expect((await roster()).split('\n').pop()).toBe(`crew: ${GONE('Bolt', 'bolt', 'Docs')}`)
  expect(await roster()).not.toMatch(/ended without a report/)
  await submit('How is it going?')
  expect(contexts[0] ?? []).toEqual([])
})

test('a busy worker nothing was heard from for ten minutes is told once, and again after it was heard from and went quiet anew', async ($, on) => {
  const { clock, listed, toasts, delegate, roster } = await watchedCrew($, on)
  await delegate({ task: 'Fix the relay queue', title: 'Relay' })
  listed.set('agent-1', 'running')
  await clock.advance(9 * 60_000)
  expect(await roster()).not.toMatch(/nothing was heard/)

  await clock.advance(100_000)
  expect(toasts).toContain('Nothing heard from Pip for 10 min')
  expect((await roster()).split('\n').pop()).toMatch(
    /^crew: Pip \(address "pip"\) is working on "Relay" and nothing was heard from it for 10 min\. It may be on a long command, waiting for the user's approval, or stuck: ask it with SendMessage, or TaskStop it and give the task again\.$/,
  )
  // Said once, however long it stays quiet.
  await clock.advance(5 * 60_000)
  expect(await roster()).not.toMatch(/nothing was heard/)
  expect(await delegate({ task: 'Fix the footer', repo: '/work/web' })).not.toMatch(/nothing was heard/)

  // A tool call is a sign of life: the next quiet spell is another one, with what it was last seen doing.
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/relay.ts', agentId: 'agent-1' })
  await clock.advance(400)
  await clock.advance(11 * 60_000)
  const said = (await delegate({ task: 'Fix the header', repo: '/work/web', fresh: true })).split('\n')
  expect(said.find(line => line.startsWith('crew: Pip '))).toMatch(
    /^crew: Pip \(address "pip"\) is working on "Relay" and nothing was heard from it for 1[01] min \(last seen: Read relay\.ts\)\. /,
  )
})

test('a worker the engine never listed stays busy when quiet, and is told as quiet; one that waits for a busy agent of its own, or that reported, is not', async ($, on) => {
  const { clock, listed, contexts, delegate, roster, submit } = await watchedCrew($, on)
  await delegate({ task: 'Fix the relay queue', title: 'Relay' })
  await delegate({ task: 'Write the docs', title: 'Docs', fresh: true })
  await delegate({ task: 'Map the API', title: 'API', fresh: true })
  // Bolt has a fork at work, which the engine lists; Mika reports.
  await spawnAgent($, { prompt: 'Draft the docs', description: 'Draft', subagentType: 'fork', fork: true, parentAgentId: 'agent-2' })
  listed.set('agent-4', 'running')
  await finish($, 'agent-3')
  for (let minute = 0; minute < 11; minute++) {
    await $.tool.call({ tool: 'Read', file_path: '/work/api/docs/a.md', agentId: 'agent-4' })
    await clock.advance(60_000)
  }
  await submit('How is it going?')
  expect(contexts[0]).toEqual([expect.stringMatching(/^\[crew\] Pip \(address "pip"\) is starting on "Relay" and nothing was heard from it for 1[01] min\. /)])
  expect(await rowOf($, 'Pip')).toMatch(/^- Pip: address "pip", starting, /)
  expect(await roster()).not.toMatch(/nothing was heard|ended without a report/)
})
