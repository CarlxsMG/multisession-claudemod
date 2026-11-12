import { expect } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'
import { COMPOSER, DELEGATE, PANE, crewCommand, engine, isBlank, mountResult, mountRow, test, toolRow, wokenCrew, workerSend } from './support/crew'
import type { Seen } from './support/crew'

test('/crew msg sends the message with its lines and spacing as the user typed them', async ($, on) => {
  const seen: Seen = { prompts: [], sends: [] }
  engine(on, { seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: DELEGATE, task: 'Fix the login', title: 'Login', repo: '/work/api' })
  const text = 'Two things:\n\n1. the logout\n2. the   token refresh'
  expect((await crewCommand($, `msg pip ${text}`)).text).toBe('Message sent to Pip.')
  expect(seen.sends[seen.sends.length - 1]).toContain(text)
})

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

test("a worker's message to a busy teammate writes the workers once, for both of them", async ($, on) => {
  let spawned = 0
  let writes = 0
  let written: readonly { id: string; lastMsgIn?: boolean }[] = []
  on('state.set', { plugin: 'crew', key: 'workers' }, (_, e, next) => {
    writes += 1
    written = e.value.value
    return next(e)
  })
  const seen: Seen = { prompts: [], sends: [] }
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: DELEGATE, ...input })).result)
  await delegate({ task: 'Build the session bus step', title: 'Session bus', repo: '/work/api' })
  await delegate({ task: 'Build the remote channel', title: 'Remote channel', repo: '/work/api', fresh: true })
  writes = 0
  await workerSend($, 'pip', 'Bolt: are you on router.ts?', 'agent-2')
  expect(seen.sends[seen.sends.length - 1]).toBe('Bolt: are you on router.ts?')
  expect(writes).toBe(1)
  expect(written.map(w => [w.id, w.lastMsgIn])).toEqual([
    ['agent-1', true],
    ['agent-2', false],
  ])
})

test('a relay whose record fails is still sent, and the relays queued after it go too', async ($, on) => {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [] }
  // The line of Bolt's first message cannot be kept: its write is refused.
  on('state.set', { plugin: 'crew', key: 'due' }, (_, e, next) => (JSON.stringify(e.value).includes('first') ? { deny: 'state full' } : next(e)))
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: DELEGATE, ...input })).result)
  const roster = async (worker: string) => String((await $.tool.call({ tool: 'mcp__crew__roster', worker })).result)
  await delegate({ task: 'Build the session bus step', title: 'Session bus', repo: '/work/api' })
  await delegate({ task: 'Build the remote channel', title: 'Remote channel', repo: '/work/api', fresh: true })
  await delegate({ task: 'Write the docs', title: 'Docs', repo: '/work/api', fresh: true })
  await $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  await $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: 't3', agentId: 'agent-3', reason: 'answer' })

  // Bolt writes to its two free teammates, Pip and Mika: both wait for the tick.
  const sends = seen.sends.length
  await workerSend($, 'pip', 'Bolt: first', 'agent-2', { kind: 'plugin', name: 'crew' })
  await workerSend($, 'mika', 'Bolt: second', 'agent-2', { kind: 'plugin', name: 'crew' })
  await clock.advance(400)
  expect(seen.sends.slice(sends).map(text => text.split('\n\n')[1])).toEqual(['Bolt: first', 'Bolt: second'])
  expect(await roster('pip')).toMatch(/^- Pip: address "pip", working, /)
  expect(await roster('mika')).toMatch(/^- Mika: address "mika", working, /)
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
  // What it does shows from the pane's next frame.
  await clock.advance(400)
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
  expect(await row.find({ type: 'Text', text: /^╰─ waiting · answers to Pip ─+╯$/ })).toBeDefined()
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
    /^2 tasks, in order:\n\n## 1\. Session bus\nRecord session\.message_emitted in oneTurn\.\n\n## 2\. Docs\nUpdate the component doc\.\n\nWhen done, open with DONE, PARTIAL or BLOCKED and the outcome, /,
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
  expect(seen.sends.slice(sends)).toEqual([expect.stringMatching(/^Record the event\.\n\nWhen done, open with DONE, PARTIAL or BLOCKED and the outcome, /)])
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
  expect(contexts[0]).toEqual([
    expect.stringMatching(
      /^\[crew\] The task held for Bolt \(address "agent-2"\) did not reach it: the agent is gone\. It goes with the next task you give Bolt; or give it to another worker word for word, which takes it off Bolt\.$/,
    ),
  ])
  expect(contexts[1] ?? []).toEqual([])

  // Nothing tries again on its own: the next task for Bolt takes it along, first.
  const sends = seen.sends.length
  await clock.advance(10_000)
  expect(seen.sends).toHaveLength(sends)
  seen.undelivered = undefined
  expect(await delegate({ task: 'Then update the docs.', title: 'Docs', worker: 'bolt' })).toMatch(
    /; context kept\. The task held for it went first, in the same message\.\nHeads-up: Pip /,
  )
  expect(seen.sends.slice(sends)).toEqual([
    expect.stringMatching(/^2 tasks, in order:\n\n## 1\. Session bus\nRecord the event\.\n\n## 2\. Docs\nThen update the docs\./),
  ])
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
  expect(seen.sends.slice(sends)).toEqual([
    expect.stringMatching(/^2 tasks, in order:\n\n## 1\. Session bus\nRecord the event\.\n\n## 2\. Docs\nThen update the docs\./),
  ])
})

test('a delegate call that sends held tasks which fail says so in its result, and its own task still goes', async ($, on) => {
  const { seen, delegate, done } = await wokenCrew($, on)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  expect(await delegate({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })).toMatch(/^Held for Bolt /)
  await done('agent-2')
  seen.failSends = true
  const output = await delegate({ task: 'Style the login page', title: 'Login styles', repo: '/work/web' })
  expect(output).toMatch(/^Started \S+ \(address /)
  expect(output).toMatch(
    /\ncrew: the task held for Bolt \(address "agent-2"\) did not reach it: the message may not have gone out; check before sending it again\. It goes with the next task you give Bolt; or give it to another worker word for word, which takes it off Bolt\.$/,
  )
})

test('a held task that missed its worker and is given to another, word for word, is let go: it is not sent again, and the roster says no more of it', async ($, on) => {
  const { seen, clock, delegate, roster, done } = await wokenCrew($, on)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  expect(await delegate({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })).toMatch(/^Held for Bolt /)
  expect(await delegate({ task: 'Update the component doc.', title: 'Docs', worker: 'bolt' })).toMatch(/^Held for Bolt /)
  seen.undelivered = 'the agent is gone'
  await done('agent-2')
  await clock.advance(400)
  expect(await roster('bolt')).toMatch(/, 2 tasks waiting, not delivered: the agent is gone, /)

  // One of the two goes to another worker as it was written: Bolt keeps the other.
  seen.undelivered = undefined
  const first = await delegate({ task: 'Record the event.', title: 'Session bus', repo: '/work/web' })
  expect(first).toMatch(/^Started Mika \(address "mika"/)
  expect(first).toMatch(/\ncrew: the task held for Bolt \(address "agent-2"\) is let go: Mika has it now\.$/)
  expect(await roster('bolt')).toMatch(/, 1 task waiting, not delivered: the agent is gone, /)

  // A task worded otherwise lets go of nothing.
  expect(await delegate({ task: 'Update the doc of the component.', title: 'Docs', repo: '/work/web', fresh: true })).not.toMatch(/let go/)
  expect(await roster('bolt')).toMatch(/, 1 task waiting, not delivered: /)

  // The other goes too: the mark has no task left, and goes with it.
  expect(await delegate({ task: 'Update the component doc.', title: 'Docs', repo: '/work/web', fresh: true })).toMatch(
    /\ncrew: the task held for Bolt .* is let go: \S+ has it now\.$/,
  )
  expect(await roster('bolt')).not.toMatch(/waiting|not delivered/)

  // Named again, Bolt gets its new task alone.
  const sends = seen.sends.length
  expect(await delegate({ task: 'Then tag the release.', title: 'Release', worker: 'bolt' })).not.toMatch(/went first/)
  expect(seen.sends.slice(sends)).toEqual([expect.stringMatching(/^Then tag the release\.\n/)])
})

test('a worker its held tasks miss again for the same reason, and that the engine lists no more, is let go of with them, said once by title', async ($, on) => {
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)
    return { text: e.text }
  })
  const { seen, clock, delegate, roster, done } = await wokenCrew($, on)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  expect(await delegate({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })).toMatch(/^Held for Bolt /)
  seen.undelivered = 'the agent is gone'
  await done('agent-2')
  await clock.advance(400)

  // Another reason: the tasks are kept, as after the first miss.
  seen.undelivered = 'its transcript is locked'
  expect(await delegate({ task: 'Update the component doc.', title: 'Docs', worker: 'bolt' })).toMatch(
    /^crew: the 2 tasks held for Bolt \(address "agent-2"\) did not reach it: its transcript is locked\. They go with the next task you give Bolt; /,
  )
  expect(await roster('bolt')).toMatch(/, 2 tasks waiting, not delivered: its transcript is locked, /)

  // The same reason again: nothing reaches it, so nothing is kept for it.
  expect(await delegate({ task: 'Then tag the release.', title: 'Release', worker: 'bolt' })).toBe(
    'crew: Bolt (address "agent-2") could not be reached again: its transcript is locked. The 3 tasks held for it are let go, this one included: "Session bus", "Docs", "Release". Give them to another worker.',
  )
  expect(await roster('bolt')).not.toMatch(/waiting|not delivered/)
  await $.prompt.submit({ text: 'How is it going?', wait: false, origin: COMPOSER })
  expect(contexts[0] ?? []).toEqual([])
})

test('a worker the engine still lists keeps its held tasks however often they miss it', async ($, on) => {
  const states = new Map<string, AgentInfo['status']>()
  const agents = (): AgentInfo[] =>
    [...states].map(([id, status]) => ({ id, name: id === 'agent-1' ? 'pip' : 'bolt', description: 'x', type: 'general-purpose', status }))
  const { seen, clock, delegate, roster, done } = await wokenCrew($, on, agents)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  expect(await delegate({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })).toMatch(/^Held for Bolt /)
  seen.undelivered = 'its transcript is locked'
  await done('agent-2')
  states.set('agent-2', 'completed')
  await clock.advance(400)
  for (const count of [2, 3]) {
    expect(await delegate({ task: `Step ${count}.`, title: `Step ${count}`, worker: 'bolt' })).toMatch(
      new RegExp(`^crew: the ${count} tasks held for Bolt \\(address "agent-2"\\) did not reach it: its transcript is locked\\. `),
    )
  }
  expect(await roster('bolt')).toMatch(/, 3 tasks waiting, not delivered: its transcript is locked, /)
})

test('a message that fails on its way is sent once only', async ($, on) => {
  const { seen, message } = await wokenCrew($, on)
  const sends = seen.sends.length
  seen.failSends = true
  const sent = await message('pip', 'Bolt: the lock is free', 'agent-2').catch((err: unknown) => err)
  expect(seen.sends).toHaveLength(sends + 1)
  expect(sent).toMatchObject({ isDelivered: false })
})

// More free workers than the list keeps: Pip, Bolt and Mika, the oldest, are
// on the shelf, and Ivy, the last, is still busy.
async function shelvedCrew($: Parameters<typeof crewCommand>[0], on: Parameters<typeof engine>[0]) {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [] }
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= 28; i++) {
    await $.tool.call({ tool: DELEGATE, task: `Task ${i}`, repo: `/work/r${i}`, fresh: true })
    await clock.advance(1000)
    if (i < 28) await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: `t-${i}`, agentId: `agent-${i}`, reason: 'answer' })
  }
  const roster = async () => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  const listed = async () => (await roster()).split('\n')[0]
  expect(await listed()).toBe("Nova's crew (25):")
  return { seen, clock, roster, listed }
}

test('/crew msg reaches a worker on the shelf, which is back on the list; a name on neither gets the usage text', async ($, on) => {
  const { seen, roster, listed } = await shelvedCrew($, on)
  const usage = (await crewCommand($, 'msg nobody Are you there?')).text
  expect(usage).toMatch(/^Usage: /)
  // Nothing to say brings nobody back.
  expect((await crewCommand($, 'msg pip')).text).toBe(usage)
  expect(await listed()).toBe("Nova's crew (25):")

  expect((await crewCommand($, 'msg pip Check the token refresh')).text).toBe('Message sent to Pip.')
  expect(seen.sends[seen.sends.length - 1]).toContain('Check the token refresh')
  expect(await listed()).toBe("Nova's crew (26):")
  expect(await roster()).toMatch(/\n- Pip: address "pip", /)
})

test("the orchestrator's SendMessage to a worker on the shelf puts it back on the list, and goes as sent", async ($, on) => {
  const { seen, roster, listed } = await shelvedCrew($, on)
  const send = (to: string, text: string) => $.session.send({ to, text, origin: { kind: 'model' } } as Parameters<typeof $.session.send>[0])
  expect(await send('bolt [3fa9c1]', 'Any news on the router?')).toMatchObject({ isDelivered: true })
  expect(seen.sends[seen.sends.length - 1]).toBe('Any news on the router?')
  expect(await listed()).toBe("Nova's crew (26):")
  expect(await roster()).toMatch(/\n- Bolt: address "bolt", /)

  // On neither the list nor the shelf: the send goes as it is.
  expect(await send('nobody', 'Hello?')).toMatchObject({ isDelivered: true })
  expect(seen.sends[seen.sends.length - 1]).toBe('Hello?')
  expect(await listed()).toBe("Nova's crew (26):")
})

test("a worker's message to a teammate on the shelf goes on from the main conversation, as to a free one on the list", async ($, on) => {
  const { seen, clock, roster, listed } = await shelvedCrew($, on)
  const sends = seen.sends.length
  expect(await workerSend($, 'mika', 'Ivy: is the schema yours?', 'agent-28')).toEqual({ isDelivered: true })
  // Nothing left Ivy's loop: the next tick sends it from here.
  expect(seen.sends).toHaveLength(sends)
  await clock.advance(400)
  expect(seen.sends.slice(sends)).toEqual([
    '[crew] From Ivy ("ivy"), passed on by the crew: your report goes to Nova; what Ivy needs back, SendMessage it.\n\nIvy: is the schema yours?',
  ])
  expect(await listed()).toBe("Nova's crew (26):")
  expect(await roster()).toMatch(/\n- Mika: address "mika", working, repo \/work\/r3, /)
})

test('while the runs a mark and a held task wait for go on, the syncs write neither the marks nor the tasks that wait', async ($, on) => {
  const writes = { takeovers: 0, waiting: 0 }
  on('state.set', { plugin: 'crew', key: 'takeovers' }, (_, e, next) => {
    writes.takeovers += 1
    return next(e)
  })
  on('state.set', { plugin: 'crew', key: 'waiting' }, (_, e, next) => {
    writes.waiting += 1
    return next(e)
  })
  const { clock, delegate, roster } = await wokenCrew($, on)
  expect(await delegate({ task: 'Seed the data', title: 'Seeds', repo: '/work/api', after: 'pip' })).toMatch(/^Held for Pip /)
  expect(await roster('bolt')).toMatch(/, answering Pip, /)
  writes.takeovers = 0
  writes.waiting = 0
  await clock.advance(10_000)
  expect(writes).toEqual({ takeovers: 0, waiting: 0 })
})
