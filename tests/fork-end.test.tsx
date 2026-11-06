import { expect } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'
import { DELEGATE, SLOW, crewCommand, engine, spawnAgent, test } from './support/crew'

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

test('a fork the engine ends late stays done, and done once the engine drops it', SLOW, async ($, on) => {
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

test('a busy worker the engine dropped without an end the crew heard is stopped, its run closed', SLOW, async ($, on) => {
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

test('a fork cleared before the engine ended it comes back busy, and takes its end once the engine drops it', SLOW, async ($, on) => {
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

test('a busy worker the engine dropped across a reload is stopped, as it is within a load', SLOW, async ($, on) => {
  const { clock, listed } = await forkCrew($, on)
  // The engine lists it before the reload, and no more after it: no sync of
  // the new load sees it, and its turn's end never reaches the crew.
  listed.delete('agent-2')
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await clock.advance(70_000)
  expect(await rowOf($, 'Bolt')).toMatch(/^- Bolt: address "agent-2", stopped, fork of Pip, /)
})

test('a worker the engine never listed stays busy when quiet, across a reload too', SLOW, async ($, on) => {
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
