import { expect } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On, SessionCompactInput } from 'claude-code'

import { COMPACT_MAIN, COMPACT_WORKER } from '../src/prompts/compact'
import { engine, test } from './support/crew'

type Dollar = Parameters<TestBody>[0]

const start = ($: Dollar) => $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })

// The engine's own compaction, beneath the plugin: it records what it was
// asked and answers a summary.
function compactor(on: On) {
  const asked: SessionCompactInput[] = []
  on('session.compact', (_, e) => {
    asked.push(e)
    return { messages: [{ role: 'user' as const, text: 'Summary.', toolUses: [] }] }
  })
  return asked
}

// What a compaction runs over: it always holds a message.
const TRANSCRIPT = [{ role: 'user' as const, text: 'Fix the login.', toolUses: [] }]

// The engine's context blocks, beneath the plugin, as it computed them.
const contextAsIs = (on: On) => on('prompt.context', (_, e) => ({ blocks: e.blocks }))

const context = async ($: Dollar) => (await $.prompt.context({ blocks: [{ name: 'currentDate', text: 'Today' }] })).blocks

test("the main conversation's compaction keeps the crew, after the person's own instructions, and is never skipped", async ($, on) => {
  engine(on, { stored: { isOn: true } })
  const asked = compactor(on)
  await start($)

  expect((await $.session.compact({ trigger: 'auto', messages: TRANSCRIPT })).skip).toBeUndefined()
  expect(asked[0]?.instructions).toBe(COMPACT_MAIN)

  expect((await $.session.compact({ trigger: 'manual', instructions: '  the billing plan ', messages: TRANSCRIPT })).skip).toBeUndefined()
  expect(asked[1]?.instructions).toBe(`the billing plan\n\n${COMPACT_MAIN}`)
})

test('with delegation off and no crew, a compaction runs as the engine has it', async ($, on) => {
  engine(on, { stored: { isOn: false } })
  const asked = compactor(on)
  await start($)
  await $.session.compact({ trigger: 'manual', instructions: 'the plan', messages: TRANSCRIPT })
  expect(asked[0]?.instructions).toBe('the plan')
})

test("a crew worker's own compaction keeps its task; another agent's is left alone", async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}`, stored: { isOn: true } })
  const asked = compactor(on)
  await start($)
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Fix the login', repo: '/work/api' })
  // The engine compacting each agent's own transcript at its threshold.
  await $.session.compact({ trigger: 'auto', agentId: 'agent-1', messages: TRANSCRIPT })
  await $.session.compact({ trigger: 'auto', agentId: 'agent-9', messages: TRANSCRIPT })
  expect(asked.map(e => e.instructions)).toEqual([COMPACT_WORKER, undefined])
})

test('the context after a compaction carries the crew as the roster has it; an empty crew adds nothing', async ($, on) => {
  engine(on, { stored: { isOn: true } })
  contextAsIs(on)
  await start($)
  expect((await context($)).map(b => b.name)).toEqual(['currentDate'])

  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Fix the login', title: 'Login fix', repo: '/work/api' })
  const blocks = await context($)
  expect(blocks.map(b => b.name)).toEqual(['currentDate', 'crewState'])
  const text = blocks[1]!.text
  expect(text).toMatch(/^\[crew\] The crew as of the last compaction or resume, .*call mcp__crew__roster for live state/)
  expect(text).toMatch(/\nNova's crew \(1\):\n- Pip: address "pip", /)
})
