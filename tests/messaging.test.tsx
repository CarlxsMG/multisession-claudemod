import { expect } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'
import { COMPOSER, DELEGATE, PANE, engine, isBlank, mountResult, mountRow, test, toolRow, wokenCrew, workerSend } from './support/crew'
import type { Seen } from './support/crew'

test('a worker hears not to wait inside its turn: it ends it saying what it waits for, from whom, and a message wakes it', async ($, on) => {
  const { seen } = await wokenCrew($, on)
  expect(seen.prompts[0]).toContain(
    '\n- A message reaches a busy teammate at its next tool call, and wakes a free one with its context; a woken teammate reports to Nova (your own forks and agents, to you), so ask it to send you what you need.' +
      '\n- Waiting on someone: do what does not need it, then end your turn with your report: what you have, what you wait for and from whom. Their message wakes you with this context. Never wait inside your turn: no sleep, polling, Monitor, background loops or mcp__crew__roster checks for a teammate.' +
      '\n- Someone waits on you: SendMessage it as soon as you have what it needs.\n',
  )
})

test("a worker's message to a free teammate goes on from the main conversation: the sender owns no run of it, and the teammate reports here", async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [] }
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: DELEGATE, ...input })).result)
  const roster = async (worker: string) => String((await $.tool.call({ tool: 'mcp__crew__roster', worker })).result)
  await delegate({ task: 'Build the session bus step', title: 'Session bus', repo: '/work/api' })
  await delegate({ task: 'Build the remote channel', title: 'Remote channel', repo: '/work/api', fresh: true })

  // A busy teammate takes it at its next tool call, as sent.
  await workerSend($, 'pip', 'Bolt: are you on router.ts?', 'agent-2')
  expect(seen.sends[seen.sends.length - 1]).toBe('Bolt: are you on router.ts?')

  // A free one: the send is answered at once, and nothing leaves Bolt's loop.
  await $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  const sends = seen.sends.length
  await $.tool.call({ tool: 'SendMessage', to: 'pip', summary: 'router fixed', message: 'Bolt: both fixed', agentId: 'agent-2' })
  const sent = await workerSend($, 'pip', 'Bolt: both fixed', 'agent-2', { kind: 'plugin', name: 'crew' })
  expect(sent).toEqual({ isDelivered: true })
  expect(seen.sends).toHaveLength(sends)

  // The next tick sends it from here: Pip wakes working for Nova, answering
  // nobody, and hears who wrote and where its report goes.
  await clock.advance(400)
  expect(seen.sends.slice(sends)).toEqual([
    '[crew] From Bolt ("bolt"), passed on by the crew: your report goes to Nova; what Bolt needs back, SendMessage it.\n\nBolt: both fixed',
  ])
  expect(await roster('pip')).toMatch(/^- Pip: address "pip", working, repo \/work\/api, /)
  expect(await delegate({ task: 'Next step', title: 'Next', worker: 'pip' })).toMatch(/^Given to Pip /)
})

test('a worker that wakes a finished agent of its own takes its next report, and the mark goes when that run ends', async ($, on) => {
  const { clock, delegate, roster, done } = await wokenCrew($, on)
  expect(await roster('bolt')).toMatch(/^- Bolt: address "agent-2", working, answering Pip, started by Pip, repo \/work\/api, /)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  await done('agent-1')
  expect(await delegate({ task: 'Next step', repo: '/work/api' })).toMatch(/^Given to Pip /)
  expect(await roster()).toMatch(/^- Bolt: address "agent-2", working \(Read bus\.ts\), answering Pip, started by Pip, repo /m)

  // Its run ends: the next tick lifts the mark.
  await done('agent-2')
  await clock.advance(400)
  expect(await roster('bolt')).toMatch(/^- Bolt: address "agent-2", done, started by Pip, repo \/work\/api, /)
})

test('a task for an agent its worker woke waits, and goes from here once that run ends', async ($, on) => {
  const { seen, clock, delegate, roster, done } = await wokenCrew($, on)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  const sends = seen.sends.length

  const input = { task: 'Record session.message_emitted in oneTurn.', title: 'Session bus', worker: 'bolt' }
  const output = await delegate({ ...input, tool_use_id: 'toolu_w1' })
  expect(output).toBe(
    'Held for Bolt (address "agent-2"): Bolt is answering Pip, whose message woke it. It gets this task when that run ends, and reports to you.',
  )
  expect(await delegate({ task: 'Update the component doc.', title: 'Docs', worker: 'bolt' })).toMatch(/ 2 tasks held; they go together\.$/)
  expect(seen.sends).toHaveLength(sends)
  expect(await roster('bolt')).toMatch(/^- Bolt: address "agent-2", working \(Read bus\.ts\), answering Pip, 2 tasks waiting, started by Pip, repo /)

  // Its bubble says it waits, and for whom.
  const row = await mountRow($, toolRow(DELEGATE, 'toolu_w1', input, { output }))
  expect(await row.find({ type: 'Text', text: /^╰─ en espera · responde a Pip ─+╯$/ })).toBeDefined()
  const pip = (await (await $.ui.mount({ ...PANE, surface: 'terminal' })).find({ type: 'Text', text: /^Pip$/ }))?.props.color
  expect((await row.find({ type: 'Text', text: /^Pip$/ }))?.props.color).toBe(pip)
  expect(await isBlank(await mountResult($, { tool: DELEGATE, tool_use_id: 'toolu_w1', output, isErrored: false }))).toBe(true)

  // A worker's look at the roster sends nothing: from its turn, the send
  // would wake Bolt working for it.
  await done('agent-2')
  await $.tool.call({ tool: 'mcp__crew__roster', agentId: 'agent-1' })
  expect(seen.sends).toHaveLength(sends)

  // The run for Pip ended: both tasks go, together, at the next tick.
  await clock.advance(400)
  expect(seen.sends).toHaveLength(sends + 1)
  expect(seen.sends[sends]).toMatch(
    /^2 tasks, in order:\n\n## 1\. Session bus\nRecord session\.message_emitted in oneTurn\.\n\n## 2\. Docs\nUpdate the component doc\.\n\nWhen done, report the outcome first, /,
  )
  expect(await roster('bolt')).toMatch(/^- Bolt: address "agent-2", working, started by Pip, repo \/work\/api, .*3 tasks, .*last task "Docs"/)
})

test('a held task is not lost when the end of the run is missed', async ($, on) => {
  const states = new Map<string, AgentInfo['status']>()
  const agents = (): AgentInfo[] =>
    [...states].map(([id, status]) => ({ id, name: id === 'agent-1' ? 'pip' : 'bolt', description: 'x', type: 'general-purpose', status }))
  const { seen, delegate, roster } = await wokenCrew($, on, agents)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  expect(await delegate({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })).toMatch(/^Held for Bolt /)
  const sends = seen.sends.length
  // No turn end reaches the crew; the engine's list says the run is over.
  states.set('agent-2', 'completed')
  expect(await roster('bolt')).toMatch(/^- Bolt: address "agent-2", working, started by Pip, repo /)
  expect(seen.sends.slice(sends)).toEqual([expect.stringMatching(/^Record the event\.\n\nWhen done, report the outcome first, /)])
})

test('held tasks a send fails to deliver are kept, the orchestrator hears of it once, and they go first with the next task', async ($, on) => {
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)
    return { text: e.text }
  })
  const { seen, clock, delegate, roster, done } = await wokenCrew($, on)
  const submit = (text: string) => $.prompt.submit({ text, wait: false, origin: COMPOSER })
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  expect(await delegate({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })).toMatch(/^Held for Bolt /)

  // Bolt's run for Pip ends, and what waited for it does not arrive.
  seen.undelivered = 'the agent is gone'
  await done('agent-2')
  await clock.advance(400)
  expect(await roster('bolt')).toMatch(/^- Bolt: address "agent-2", \w+, 1 task waiting, not delivered: the agent is gone, started by Pip, /)
  // With no crew tool called since, the user's next message carries it, once.
  await submit('How is it going?')
  await submit('And now?')
  expect(contexts).toHaveLength(2)
  expect(contexts[0]).toEqual([expect.stringMatching(/^\[crew\] The task held for Bolt \(address "agent-2"\) did not reach it: the agent is gone\. It goes with the next task you give Bolt, or give it to another worker\.$/)])
  expect(contexts[1] ?? []).toEqual([])

  // Nothing tries again on its own: the next task for Bolt takes it along, first.
  const sends = seen.sends.length
  await clock.advance(10_000)
  expect(seen.sends).toHaveLength(sends)
  seen.undelivered = undefined
  expect(await delegate({ task: 'Then update the docs.', title: 'Docs', worker: 'bolt' })).toMatch(/; context kept\. The task held for it went first, in the same message\.\nHeads-up: Pip /)
  expect(seen.sends.slice(sends)).toEqual([expect.stringMatching(/^2 tasks, in order:\n\n## 1\. Session bus\nRecord the event\.\n\n## 2\. Docs\nThen update the docs\./)])
  expect(await roster('bolt')).not.toMatch(/waiting|not delivered/)
})

test('a worker woken again after its held tasks missed it holds them again, with the next task, until that run ends', async ($, on) => {
  const { seen, clock, delegate, roster, done, message } = await wokenCrew($, on)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  expect(await delegate({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })).toMatch(/^Held for Bolt /)
  seen.undelivered = 'the agent is gone'
  await done('agent-2')
  await clock.advance(400)
  expect(await roster('bolt')).toMatch(/not delivered: the agent is gone/)

  // Pip wakes it again: its run reports to Pip, so what is given now waits.
  seen.undelivered = undefined
  await message('bolt', 'Pip: one more thing', 'agent-1')
  expect(await delegate({ task: 'Then update the docs.', title: 'Docs', worker: 'bolt' })).toMatch(/^Held for Bolt /)
  expect(await roster('bolt')).toMatch(/^- Bolt: address "agent-2", working, answering Pip, 2 tasks waiting, /)

  // That run ends: both go from here, together.
  const sends = seen.sends.length
  await done('agent-2')
  await clock.advance(400)
  expect(seen.sends.slice(sends)).toEqual([expect.stringMatching(/^2 tasks, in order:\n\n## 1\. Session bus\nRecord the event\.\n\n## 2\. Docs\nThen update the docs\./)])
})

test("a delegate call that sends held tasks which fail says so in its result, and its own task still goes", async ($, on) => {
  const { seen, delegate, done } = await wokenCrew($, on)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  expect(await delegate({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })).toMatch(/^Held for Bolt /)
  await done('agent-2')
  seen.failSends = true
  const output = await delegate({ task: 'Style the login page', title: 'Login styles', repo: '/work/web' })
  expect(output).toMatch(/^Started \S+ \(address /)
  expect(output).toMatch(/\ncrew: the task held for Bolt \(address "agent-2"\) did not reach it: the message may not have gone out; check before sending it again\. It goes with the next task you give Bolt, or give it to another worker\.$/)
})

test('a message that fails on its way is sent once only', async ($, on) => {
  const { seen, message } = await wokenCrew($, on)
  const sends = seen.sends.length
  seen.failSends = true
  const sent = await message('pip', 'Bolt: the lock is free', 'agent-2').catch((err: unknown) => err)
  expect(seen.sends).toHaveLength(sends + 1)
  expect(sent).toMatchObject({ isDelivered: false })
})
