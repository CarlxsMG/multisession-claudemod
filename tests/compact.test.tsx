import { expect } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On, SessionCompactInput, SessionContextBreakdown } from 'claude-code'

import { COMPACT_MAIN, COMPACT_WORKER } from '../src/prompts/compact'
import { engine, progressCrew, test, wokenCrew } from './support/crew'

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

// A compaction the crew starts: the engine beneath records what it ran with,
// and answers each as `answer` says (a summary, a skip, or a turn refusing it).
function scheduledCompactor(on: On) {
  const ran: (string | undefined)[] = []
  const answer = { now: 'compact' as 'compact' | 'skip' | 'busy' }
  on('session.compact', (_, e) => {
    if (answer.now === 'busy') throw new Error('a turn is running')
    ran.push(e.instructions)
    if (answer.now === 'skip') return { skip: 'a plugin said no' }
    return { messages: [{ role: 'user' as const, text: 'Summary.', toolUses: [] }] }
  })
  return { ran, answer }
}

const compactCall = async ($: Dollar, input: Record<string, unknown>, agentId?: string) =>
  String((await $.tool.call({ tool: 'mcp__crew__compact', ...input, ...(agentId ? { agentId } : {}) } as never)).result)

test("the orchestrator's compaction waits for no worker busy, runs once with the crew's instructions, and the next waits 10 minutes and a main turn's end", async ($, on) => {
  const { ran } = scheduledCompactor(on)
  const { clock, delegate, end, mainTurn, toasts } = await progressCrew($, on)
  await delegate('Fix the login', '/work/api', 'Login')

  expect(await compactCall($, { focus: 'the billing phase' })).toBe(
    'Compaction queued: it runs between turns once no worker is busy. End your turn when you are done; a later call replaces this one.',
  )
  await clock.advance(5000)
  expect(ran).toHaveLength(0)

  await end('agent-1')
  await clock.advance(3000)
  expect(ran).toEqual([`Stress for what comes next: the billing phase\n\n${COMPACT_MAIN}`])
  expect(toasts).toContain('Compacted the conversation; the summary keeps the crew')

  expect(await compactCall($, {})).toMatch(/, in 10 min at the soonest \(one every 10 min\)\./)
  await clock.advance(5 * 60_000)
  expect(ran).toHaveLength(1)
  await clock.advance(5 * 60_000 + 2000)
  expect(ran).toHaveLength(1)
  await (
    await mainTurn()
  )()
  await clock.advance(2000)
  expect(ran).toEqual([`Stress for what comes next: the billing phase\n\n${COMPACT_MAIN}`, COMPACT_MAIN])
})

test("a compaction safe only once the main turn's prompt cache lapsed waits for the next main turn's end", async ($, on) => {
  const { ran } = scheduledCompactor(on)
  const { clock, delegate, end, mainTurn } = await progressCrew($, on)
  await delegate('Fix the login', '/work/api', 'Login')
  const done = await mainTurn()
  await compactCall($, {})
  await done()
  await clock.advance(5 * 60_000)
  await end('agent-1')
  await clock.advance(30 * 60_000)
  expect(ran).toHaveLength(0)

  await (
    await mainTurn()
  )()
  await clock.advance(2000)
  expect(ran).toEqual([COMPACT_MAIN])
})

test('a compaction a turn refuses stays queued and runs at the next safe moment; a skipped one is told and dropped', async ($, on) => {
  const { ran, answer } = scheduledCompactor(on)
  const { clock, mainTurn, toasts } = await progressCrew($, on)
  answer.now = 'busy'
  const done = await mainTurn()
  await compactCall($, {})
  await done()
  await clock.advance(3000)
  expect(ran).toHaveLength(0)
  answer.now = 'skip'
  await clock.advance(2000)
  expect(ran).toEqual([COMPACT_MAIN])
  expect(toasts).toContain('Did not compact the conversation: a plugin said no')
  await clock.advance(20 * 60_000)
  expect(ran).toHaveLength(1)
})

test('a compaction that waits for reports runs only after a turn of the orchestrator since the last one came in', async ($, on) => {
  const { ran } = scheduledCompactor(on)
  const { clock, delegate, end, mainTurn } = await progressCrew($, on)
  await delegate('Fix the login', '/work/api', 'Login')
  await compactCall($, { after: 'reports' })
  await clock.advance(1000)
  await end('agent-1')
  await clock.advance(5000)
  expect(ran).toHaveLength(0)

  const done = await mainTurn()
  await clock.advance(2000)
  expect(ran).toHaveLength(0)
  await done()
  await clock.advance(2000)
  expect(ran).toEqual([COMPACT_MAIN])
})

test('a compaction waits for the run of an agent its worker woke, and not for held tasks that missed their worker', async ($, on) => {
  const { ran } = scheduledCompactor(on)
  for (const call of ['ui.status', 'ui.toast'] as const) on(call, () => ({ value: undefined }))
  on('ui.place', (_, e) => ({ value: { isPlaced: true as const, requestId: e.id } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  const { seen, clock, delegate, roster, done } = await wokenCrew($, on)
  let turns = 0
  const ask = async () => {
    const turnId = `m${++turns}`
    await $.turn.start({ text: '', turnId })
    await compactCall($, {})
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId, reason: 'answer' })
  }
  await delegate({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })
  await done('agent-1')

  // Bolt still answers Pip: its run, and the task that waits for it, hold the compaction.
  await ask()
  await clock.advance(3000)
  expect(ran).toHaveLength(0)

  // The run ends and the task does not reach Bolt: the mark stays, and holds nothing back.
  seen.undelivered = 'the agent is gone'
  await done('agent-2')
  await clock.advance(1000)
  expect(await roster('bolt')).toMatch(/, 1 task waiting, not delivered: the agent is gone, /)
  await clock.advance(3000)
  expect(ran).toEqual([COMPACT_MAIN])
  expect(await roster('bolt')).toMatch(/, 1 task waiting, not delivered: /)
})

test("a worker is told the compact tool is the orchestrator's, and nothing is queued", async ($, on) => {
  const { ran } = scheduledCompactor(on)
  const { clock, delegate } = await progressCrew($, on)
  await delegate('Fix the login', '/work/api', 'Login')
  expect(await compactCall($, {}, 'agent-1')).toBe("mcp__crew__compact compacts the orchestrator's conversation; a worker's is compacted by the engine.")
  await clock.advance(20 * 60_000)
  expect(ran).toHaveLength(0)
})

for (const [option, tokens, runs] of [
  ['70%', 150_000, 1],
  ['70%', 130_000, 0],
  ['off', 190_000, 0],
] as const) {
  test(
    `with compactAt ${option}, a context of ${tokens} tokens against a threshold of 200000 ${runs ? 'compacts' : 'does not compact'} on its own`,
    { options: { compactAt: option } },
    async ($, on) => {
      const breakdown = { autoCompactThreshold: 200_000, isAutoCompactEnabled: true } as SessionContextBreakdown
      const { ran } = scheduledCompactor(on)
      const { clock, mainTurn } = await progressCrew($, on, {}, { context: () => ({ tokens, window: 1_000_000, breakdown }) })
      await (
        await mainTurn()
      )()
      await clock.advance(3000)
      expect(ran).toHaveLength(runs)
    },
  )
}

test(
  "with compactAt set, the context's fill is read only within a main turn's warm window, not at every idle tick",
  { options: { compactAt: '70%' } },
  async ($, on) => {
    const breakdown = { autoCompactThreshold: 200_000, isAutoCompactEnabled: true } as SessionContextBreakdown
    let reads = 0
    const { clock, mainTurn } = await progressCrew(
      $,
      on,
      {},
      {
        context: () => {
          reads += 1
          return { tokens: 100_000, window: 1_000_000, breakdown }
        },
      },
    )
    await (
      await mainTurn()
    )()
    await clock.advance(3000)
    expect(reads).toBeGreaterThan(0)

    await clock.advance(5 * 60_000)
    reads = 0
    await clock.advance(30_000)
    expect(reads).toBe(0)
  },
)
