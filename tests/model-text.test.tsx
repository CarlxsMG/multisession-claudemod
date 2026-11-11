// Every text a model reads, exactly: the brief, the tool specs, the notes,
// what workers and forks hear, the tools' results, what /crew answers and the
// Haiku prompt. A refactor keeps them byte for byte; a change in wording is a
// deliberate change to tests/golden/model-text.ts, in a commit of its own.
import { expect } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On, UiCopyResult } from 'claude-code'

import { DEFAULT_LOOK } from '../src/figure/look'
import { lookCode, parseLookCode } from '../src/figure/share-code'
import { VIBES } from '../src/persona/vibes'
import { GOLDEN } from './golden/model-text'
import { DELEGATE, NO_VERDICT, composeBrief, crewCommand, engine, progress, spawnAgent, startTold, test, wokenCrew, workerSend } from './support/crew'
import type { Seen } from './support/crew'

type Dollar = Parameters<TestBody>[0]

function expectText(name: string, actual: unknown) {
  const text = typeof actual === 'string' ? actual : JSON.stringify(actual, null, 2)
  expect(name in GOLDEN).toBe(true)
  expect(text).toBe(GOLDEN[name])
}

const start = ($: Dollar) => $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
const call = async ($: Dollar, input: Record<string, unknown>) =>
  (await $.tool.call({ tool: DELEGATE, ...input } as never)) as { result?: unknown; deny?: string }
const delegate = async ($: Dollar, input: Record<string, unknown>) => String((await call($, input)).result)
const roster = async ($: Dollar, input: Record<string, unknown> = {}) => String((await $.tool.call({ tool: 'mcp__crew__roster', ...input } as never)).result)
const finish = (_$: Dollar, agentId: string, answer = 'Done: 3 files changed, tests green.') =>
  _$.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: `t-${agentId}-${answer.length}`, agentId, reason: 'answer' })

const recording = (): Seen => ({ prompts: [], sends: [], specs: [] })

const composed = (on: On) => on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))

// The one text here that follows the UI's language: it names the language and
// the catchphrase, and the golden holds it as a crew in Spanish asks it.
test('what Haiku is asked for the mood lines', { options: { language: 'es' } }, async ($, on) => {
  const clock = engine(on)
  const prompts: string[] = []
  on('model.complete', (_, e) => {
    prompts.push(e.prompt)
    return {
      value: {
        isAnswered: true as const,
        text: '{}',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })
  await start($)
  await clock.advance(12_000)
  expectText('haiku.prompt', prompts[0])
})

for (const isOn of [true, false]) {
  const mode = isOn ? 'on' : 'off'
  test(`the orchestrator's brief, the delegate description and the tool specs, with delegation ${isOn ? 'ON' : 'OFF'}`, async ($, on) => {
    const seen = recording()
    engine(on, { seen, stored: { isOn } })
    composed(on)
    await start($)
    expectText(`brief.${mode}`, (await composeBrief($))?.text)
    const spec = (name: string) => seen.specs!.find(s => s.name === name)!
    expectText('spec.delegate.description', spec('delegate').description)
    if (isOn) {
      expectText('spec.delegate.inputSchema', spec('delegate').inputSchema)
      expectText('spec.roster', spec('roster'))
      expectText('spec.progress', spec('progress'))
      expectText('spec.compact', spec('compact'))
    }
  })
}

for (const vibe of Object.keys(VIBES)) {
  test(`the persona line of the ${vibe} personality`, async ($, on) => {
    engine(on, { stored: { look: { ...DEFAULT_LOOK, vibe } } })
    composed(on)
    await start($)
    const brief = (await composeBrief($))?.text ?? ''
    expectText(`persona.${vibe}`, brief.split('\n').pop())
  })
}

for (const isOn of [true, false]) {
  const mode = isOn ? 'on' : 'off'
  test(`the "[crew]" note that tells the model delegation turned ${isOn ? 'ON' : 'OFF'}`, async ($, on) => {
    const { contexts, submit } = await startTold($, on, {}, !isOn)
    await crewCommand($, `mode ${mode}`)
    await submit('Hello')
    expectText(`note.${mode}`, contexts[0]?.join('\n'))
  })
}

test('what a worker hears when it starts: in its repository, beside teammates, and to a worker that started it', async ($, on) => {
  let spawned = 0
  const seen = recording()
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await start($)
  await delegate($, { task: 'Fix the login', title: 'Login', repo: '/work/api' })
  expectText('preamble.repo', seen.prompts[0])
  await delegate($, { task: 'Fix the styles', title: 'Styles', repo: '/work/api', fresh: true })
  expectText('preamble.teammates', seen.prompts[1])
  await spawnAgent($, { prompt: 'File the tickets', description: 'Tickets', subagentType: 'general-purpose', parentAgentId: 'agent-1' })
  expectText('preamble.childOfWorker', seen.prompts[2])
  await spawnAgent($, { prompt: 'Do the frontend', description: 'Frontend', subagentType: 'fork', fork: true, parentAgentId: 'agent-1' })
  expectText('fork.ofWorker', seen.prompts[3])
  await spawnAgent($, { prompt: 'Draft the migration plan', description: 'Plan', subagentType: 'fork', fork: true })
  expectText('fork.ofMain', seen.prompts[4])
})

test('what a worker hears in a worktree of its own, and an agent it starts there', async ($, on) => {
  let spawned = 0
  const seen = recording()
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await start($)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_1', isolation: 'worktree', prompt: 'Fix it', description: 'Fix' })
  await spawnAgent($, { prompt: 'Fix it', description: 'Fix', subagentType: 'general-purpose', tool_use_id: 'toolu_1' })
  expectText('preamble.ownWorktree', seen.prompts[0])
  await spawnAgent($, { prompt: 'Write the tests', description: 'Tests', subagentType: 'general-purpose', parentAgentId: 'agent-1' })
  expectText('preamble.parentWorktree', seen.prompts[1])
  await finish($, 'agent-1')
  expectText('result.givenInWorktree', await delegate($, { task: 'Also fix the logout', title: 'Logout', worker: 'pip' }))
  expectText('task.notFromDelegate', seen.sends[seen.sends.length - 1])
})

test("delegate's results: started, given, busy repositories, and what it turns down", async ($, on) => {
  let spawned = 0
  const seen = recording()
  engine(on, { nextId: () => `agent-${++spawned}`, seen, host: { exists: path => !path.includes('missing') } })
  await start($)
  expectText('result.started', await delegate($, { task: 'Fix the login', title: 'Login', repo: '/work/api' }))
  expectText('result.startedBesideBusy', await delegate($, { task: 'Fix the styles', title: 'Styles', repo: '/work/api', fresh: true }))
  await finish($, 'agent-1')
  expectText('result.givenBesideBusy', await delegate($, { task: 'Add the tests', title: 'Tests', repo: '/work/api' }))
  expectText('task.reused', seen.sends[seen.sends.length - 1])
  expectText('result.noTask', await delegate($, { task: '  ' }))
  expectText('result.noWorker', await delegate($, { task: 'Review it', worker: 'nobody' }))
  expectText('result.fork', await delegate($, { task: 'Review it', subagent_type: 'fork' }))
  expectText('result.noRepo', await delegate($, { task: 'Review it', repo: '/work/missing' }))
  expectText('result.noModel', await delegate($, { task: 'Review it', model: 'gpt-5' }))
  expectText('result.notForWorkers', await delegate($, { task: 'Split this', agentId: 'agent-1' }))
  await finish($, 'agent-2')
  seen.undelivered = 'the agent is gone'
  expectText('result.unreachable', await delegate($, { task: 'Polish it', worker: 'bolt' }))
  expectText('result.startedAfterLost', await delegate($, { task: 'Polish it', title: 'Polish', repo: '/work/api' }))
})

test("delegate's result for a free worker picked over others that were free", async ($, on) => {
  let spawned = 0
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen: recording() })
  await start($)
  for (const title of ['Login', 'Styles', 'Docs', 'Deploy', 'Search']) await delegate($, { task: `Build the ${title}`, title, repo: '/work/api', fresh: true })
  for (let i = 1; i <= 5; i++) {
    await clock.advance(1000)
    await finish($, `agent-${i}`)
  }
  expectText('result.givenOverOthers', await delegate($, { task: 'Add the tests', title: 'Tests', repo: '/work/api' }))
})

test("delegate's results when free workers could not be reached: the next one, and a new one when none is", async ($, on) => {
  let spawned = 0
  const seen = recording()
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await start($)
  for (const title of ['Login', 'Styles', 'Docs', 'Deploy', 'Search']) await delegate($, { task: `Build the ${title}`, title, repo: '/work/api', fresh: true })
  for (let i = 1; i <= 5; i++) {
    await clock.advance(1000)
    await finish($, `agent-${i}`)
  }
  seen.gone = { 'agent-5': 'the agent is gone' }
  expectText('result.givenAfterLost', await delegate($, { task: 'Add the tests', title: 'Tests', repo: '/work/api' }))
  seen.gone = { 'agent-5': 'the agent is gone', 'agent-3': 'the agent is gone', 'agent-2': 'the agent is gone' }
  expectText('result.startedAfterLostMany', await delegate($, { task: 'Tag the release', title: 'Release', repo: '/work/api' }))
  // A send that may have gone out, first of the free ones and after one that could not be reached.
  const unsure = 'crew: the message may not have gone out; check before sending it again.'
  seen.gone = { 'agent-5': unsure }
  expectText('result.unsureSend', await delegate($, { task: 'Write the notes', title: 'Notes', repo: '/work/api' }))
  seen.gone = { 'agent-5': 'the agent is gone', 'agent-3': unsure }
  expectText('result.unsureSendAfterLost', await delegate($, { task: 'Write the notes', title: 'Notes', repo: '/work/api' }))
})

test("delegate's results for a worker named while busy, after a run that failed, and for one whose last run was stopped", async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}`, seen: recording() })
  await start($)
  await delegate($, { task: 'Fix the login', title: 'Login', repo: '/work/api' })
  expectText('result.givenWhileBusy', await delegate($, { task: 'Add the tests', title: 'Tests', worker: 'pip' }))
  await $.turn.complete({ answer: 'API error', durationMs: 1, isAborted: false, turnId: 't-failed', agentId: 'agent-1', reason: 'error' })
  expectText('result.givenAfterFailure', await delegate($, { task: 'Try the login again', title: 'Login again', worker: 'pip' }))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't-stopped', agentId: 'agent-1', reason: 'aborted' })
  expectText('result.givenAfterStop', await delegate($, { task: 'Finish the login', title: 'Login', repo: '/work/api' }))
})

test("delegate's result for a named worker the call's other arguments do not fit, given and held", async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}`, seen: recording() })
  await start($)
  await delegate($, { task: 'Fix the login', title: 'Login', repo: '/work/api' })
  await finish($, 'agent-1')
  const other = { repo: '/work/web', subagent_type: 'Explore', model: 'opus', fresh: true }
  expectText('result.givenUnapplied', await delegate($, { task: 'Add the tests', title: 'Tests', worker: 'pip', ...other }))
})

test('a task held for a woken worker notes what the call asked that it is not', async ($, on) => {
  const { delegate: give } = await wokenCrew($, on)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  expectText('result.heldUnapplied', await give({ task: 'Record the event.', title: 'Session bus', worker: 'bolt', fresh: true }))
})

test("delegate's results when a spawn is refused, by auto mode's missing verdict or otherwise", async ($, on) => {
  engine(on, { seen: { ...recording(), refuse: NO_VERDICT } })
  await start($)
  expectText('result.autoMode', await delegate($, { task: 'Fix the login', title: 'Login', repo: '/work/api' }))
  expectText('result.autoModeWithModel', await delegate($, { task: 'Fix the styles', title: 'Styles', repo: '/work/api', model: 'sonnet' }))
})

test('what the Agent call that starts a worker delegate handed over hears', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}`, seen: { ...recording(), refuse: NO_VERDICT } })
  await start($)
  const hears = async (toolUseId: string, agent: { prompt: string; description: string; name: string; model?: string }) => {
    await spawnAgent($, { subagentType: 'general-purpose', parentModel: 'claude-opus-5-5', ...agent, tool_use_id: toolUseId })
    const done = await $.tool.call({ tool: 'Agent', tool_use_id: toolUseId, ...agent } as never)
    return (done as { context?: string[] }).context?.[0]
  }
  await delegate($, { task: 'Fix the login', title: 'Login', repo: '/work/api' })
  expectText('note.handedStarted', await hears('toolu_1', { prompt: 'Fix the login', description: 'Login', name: 'pip' }))
  await delegate($, { task: 'Fix the styles', title: 'Styles', repo: '/work/api', fresh: true })
  expectText('note.handedStartedOtherModel', await hears('toolu_2', { prompt: 'Fix the styles', description: 'Styles', name: 'bolt', model: 'sonnet' }))
})

test('a refused spawn, said as the engine said it', async ($, on) => {
  engine(on, { seen: { ...recording(), refuse: 'Auto mode blocked this action: it deletes the repository.' } })
  await start($)
  expectText('result.notStarted', await delegate($, { task: 'Clean up', repo: '/work/api' }))
})

test('what an Agent call hears when the crew names its agent otherwise', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await start($)
  await delegate($, { task: 'Map the auth flow', repo: '/work/api' })
  const agent = { prompt: 'Read the auth module', description: 'Scout auth', subagentType: 'Explore', name: 'researcher-auth', parentAgentId: 'agent-1' }
  await spawnAgent($, { ...agent, tool_use_id: 'toolu_7' })
  const done = await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_7', agentId: 'agent-1', ...agent } as never)
  expectText('result.renamedAgent', (done as { context?: string[] }).context?.[0])
})

test('the answer to a delegate call that failed on its way', async ($, on) => {
  const seen: Seen = { ...recording(), failSends: true }
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await start($)
  await delegate($, { task: 'Fix the login', title: 'Login', repo: '/work/api' })
  await finish($, 'agent-1')
  expectText('result.failed', await call($, { task: 'Polish it', worker: 'pip' }))
})

test('tasks held for an agent its worker woke, and how they go once its run ends', async ($, on) => {
  const { seen, clock, delegate: give, done } = await wokenCrew($, on)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  expectText('result.held', await give({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' }))
  expectText('result.heldMore', await give({ task: 'Update the doc.', title: 'Docs', worker: 'bolt' }))
  const sends = seen.sends.length
  await done('agent-2')
  await clock.advance(400)
  expectText('task.heldTogether', seen.sends[sends])
})

test('one held task goes alone', async ($, on) => {
  const { seen, clock, delegate: give, done } = await wokenCrew($, on)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  await give({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })
  const sends = seen.sends.length
  await done('agent-2')
  await clock.advance(400)
  expectText('task.heldAlone', seen.sends[sends])
})

test('held tasks that did not reach their worker: the next delegate result, the user message note, and the task that takes them along', async ($, on) => {
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)
    return { text: e.text }
  })
  const { seen, clock, delegate: give, done } = await wokenCrew($, on)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  await give({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })
  await give({ task: 'Update the doc.', title: 'Docs', worker: 'bolt' })
  seen.undelivered = 'the agent is gone'
  await done('agent-2')
  await clock.advance(400)
  await $.prompt.submit({ text: 'How is it going?', wait: false, origin: { kind: 'composer' } })
  expectText('note.heldMissed', contexts[0]?.join('\n'))
  // Another reason than the first: the tasks are kept.
  seen.undelivered = 'its transcript is locked'
  expectText('result.heldMissed', await give({ task: 'Write the changelog.', title: 'Changelog', worker: 'bolt' }))
  seen.undelivered = undefined
  expectText('result.heldWentFirst', await give({ task: 'Tag the release.', title: 'Release', worker: 'bolt' }))
})

test('held tasks that missed their worker and are let go: one given to another worker word for word, the rest when it cannot be reached again', async ($, on) => {
  const { seen, clock, delegate: give, done } = await wokenCrew($, on)
  await $.tool.call({ tool: 'Read', file_path: '/work/api/src/bus.ts', agentId: 'agent-2' })
  await give({ task: 'Record the event.', title: 'Session bus', worker: 'bolt' })
  await give({ task: 'Update the doc.', title: 'Docs', worker: 'bolt' })
  seen.undelivered = 'the agent is gone'
  await done('agent-2')
  await clock.advance(400)
  seen.undelivered = undefined
  expectText('result.heldLetGo', await give({ task: 'Record the event.', title: 'Session bus', repo: '/work/web' }))
  seen.gone = { 'agent-2': 'the agent is gone' }
  expectText('result.heldDropped', await give({ task: 'Write the changelog.', title: 'Changelog', worker: 'bolt' }))
})

test("a worker's message to a free teammate, as the teammate reads it", async ($, on) => {
  let spawned = 0
  const seen = recording()
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await start($)
  await delegate($, { task: 'Build the session bus step', title: 'Session bus', repo: '/work/api' })
  await delegate($, { task: 'Build the remote channel', title: 'Remote channel', repo: '/work/api', fresh: true })
  await finish($, 'agent-1')
  await workerSend($, 'pip', 'Bolt: both fixed', 'agent-2', { kind: 'plugin', name: 'crew' })
  const sends = seen.sends.length
  await clock.advance(400)
  expectText('relay', seen.sends[sends])
})

test("the user's message to a worker from /crew msg", async ($, on) => {
  const seen = recording()
  engine(on, { seen })
  await start($)
  await delegate($, { task: 'Fix the login', title: 'Login', repo: '/work/api' })
  await crewCommand($, 'msg pip mira también el logout')
  expectText('message.fromUser', seen.sends[seen.sends.length - 1])
})

test('the roster: empty, the whole crew, one worker, and a name it does not know', async ($, on) => {
  let spawned = 0
  const seen = recording()
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, seen })
  await start($)
  expectText('roster.empty', await roster($))
  await delegate($, { task: 'Fix the login', title: 'Login', repo: '/work/api' })
  await delegate($, { task: 'Fix the styles', title: 'Styles', repo: '/work/web', model: 'sonnet' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/web/src/app.css', agentId: 'agent-2' } as never)
  await progress($, 'agent-2', 2, 4, 'Restyle the header')
  await clock.advance(30_000)
  await finish($, 'agent-1', 'Login fixed: the token now refreshes.\nTests: 42 pass.')
  await spawnAgent($, { prompt: 'Do the frontend', description: 'Frontend', subagentType: 'fork', fork: true, parentAgentId: 'agent-2' })
  expectText('roster.crew', await roster($))
  expectText('roster.one', await roster($, { worker: 'pip' }))
  expectText('roster.unknown', await roster($, { worker: 'nobody' }))
})

test("the progress tool's answers", async ($, on) => {
  const seen = recording()
  engine(on, { seen })
  await start($)
  await delegate($, { task: 'Fix the login', title: 'Login', repo: '/work/api' })
  expectText('progress.declared', await progress($, 'agent-1', 0, 3, 'Plan'))
  expectText('progress.step', await progress($, 'agent-1', 1, 3, 'Read the code'))
  expectText('progress.last', await progress($, 'agent-1', 3, 3, 'Test'))
  expectText('progress.orchestrator', await progress($, undefined, 1, 3, 'Read'))
  expectText('progress.invalid', await progress($, 'agent-1', -1, 0, 'Read'))
  expectText('progress.noRun', await progress($, 'agent-9', 1, 3, 'Read'))
})

test("what a compaction's summarizer is told, the main conversation's and a worker's, and the crew read back after it", async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  const told: (string | undefined)[] = []
  on('session.compact', (_, e) => {
    told.push(e.instructions)
    return { messages: [{ role: 'user' as const, text: 'Summary.', toolUses: [] }] }
  })
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  await start($)
  await delegate($, { task: 'Fix the login', title: 'Login', repo: '/work/api' })
  await finish($, 'agent-1')
  const transcript = [{ role: 'user' as const, text: 'Fix the login.', toolUses: [] }]
  await $.session.compact({ trigger: 'auto', messages: transcript })
  await $.session.compact({ trigger: 'auto', agentId: 'agent-1', messages: transcript })
  expectText('compact.main', told[0])
  expectText('compact.worker', told[1])
  const blocks = (await $.prompt.context({ blocks: [] })).blocks
  expectText('compact.crewState', blocks.find(b => b.name === 'crewState')?.text)
})

test("the line on when to compact, in its own section of the system prompt, and the compact tool's answers", async ($, on) => {
  const clock = engine(on)
  on('session.compact', () => ({ messages: [{ role: 'user' as const, text: 'Summary.', toolUses: [] }] }))
  on('ui.toast', () => ({ value: undefined }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  composed(on)
  await start($)
  const sections = (
    await $.prompt.compose({ model: 'test-model', promptModel: 'test-model', surfaces: ['terminal'], tools: [DELEGATE], outputStyle: null, traits: [] })
  ).sections
  expectText('brief.compact', sections.find(s => s.id === 'crew:compact')?.text)
  const compact = async (input: Record<string, unknown>) => String((await $.tool.call({ tool: 'mcp__crew__compact', ...input } as never)).result)
  // The orchestrator asks in a turn of its own, whose end lets the compaction run.
  await $.turn.start({ text: '', turnId: 'm1' })
  expectText('result.compactQueued', await compact({ focus: 'the billing phase' }))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'm1', reason: 'answer' })
  await clock.advance(2000)
  expectText('result.compactQueuedWait', await compact({ after: 'reports' }))
  expectText('result.compactNotForWorkers', await compact({ agentId: 'agent-1' }))
})

test('the answer to a send that failed on its way', async ($, on) => {
  const { seen, message } = await wokenCrew($, on)
  seen.failSends = true
  expectText('send.failed', await message('pip', 'Bolt: the lock is free', 'agent-2').catch((err: unknown) => String(err)))
})

test("a command that does not end is refused, a worker's and the main session's; one that ends goes on", async ($, on) => {
  engine(on)
  await start($)
  const run = async (input: Record<string, unknown>) => (await $.tool.call(input as never)) as { result?: unknown; deny?: string }
  expectText('result.runaway', (await run({ tool: 'Bash', command: 'tail -f app.log', agentId: 'agent-1' })).deny)
  expect((await run({ tool: 'PowerShell', command: 'npx tsc --watch' })).deny).toContain('`tsc --watch` does not end')
  const ends = await run({ tool: 'Bash', command: 'timeout 30 tail -f app.log' })
  expect(ends.deny).toBeUndefined()
  expect(ends.result).toEqual({})
})

// A reply is stored where the model reads it, so neither the UI's language nor
// the personality changes a word of it, and what the person chose stands as
// they wrote it. A share code holds the whole look, so the golden has `<code>`.
async function expectReplies($: Dollar, on: On) {
  engine(on)
  let copy: UiCopyResult = { isCopied: true }
  on('ui.copy', () => ({ value: copy }))
  await start($)
  await $.tool.call({ tool: DELEGATE, task: 'Run the tests', repo: '/work/api' })
  const reply = async (args: string) => String((await crewCommand($, args)).text)
  for (const vibe of Object.keys(VIBES)) {
    expectText('command.imported', await reply(`import ${lookCode({ ...DEFAULT_LOOK, name: 'Mónica', phrase: '¡Allá vamos!', vibe })}`))
    expectText('command.opened', await reply(''))
    expectText('command.editing', await reply('edit'))
    expectText('command.teamOpened', await reply('team'))
    expectText('command.msgUsage', await reply('msg pip'))
    expectText('command.sent', await reply('msg pip look at the logout too'))
    copy = { isCopied: true }
    const copied = await reply('code')
    expect(parseLookCode(copied.split('\n')[1]!)?.phrase).toBe('¡Allá vamos!')
    expectText('command.codeCopied', copied.replace(/CREW1\.\S+/, '<code>'))
    copy = { isCopied: false, reason: 'no-clipboard' }
    expectText('command.code', (await reply('code')).replace(/CREW1\.\S+/, '<code>'))
    expectText('command.badCode', await reply('import nothing'))
    expectText('command.newLook', await reply('random'))
    expectText('command.modeOff', await reply('mode off'))
    expectText('command.modeOn', await reply('mode on'))
    expectText('command.cleared', await reply('clear'))
    expectText('command.progressUsage', await reply('progress 4m'))
    expectText('command.help', await reply('help'))
  }
}

test('what /crew answers, in every personality', expectReplies)
test('what /crew answers in a Spanish UI: the same words', { options: { language: 'es' } }, expectReplies)

test('the usage probe: the command it runs and what it writes to it', async ($, on) => {
  const runs: { argv: readonly string[]; stdin: string }[] = []
  engine(on, { probe: (argv, stdin) => (runs.push({ argv, stdin }), '') })
  await start($)
  expectText('usage.argv', runs[0]?.argv)
  expectText('usage.stdin', runs[0]?.stdin)
})
