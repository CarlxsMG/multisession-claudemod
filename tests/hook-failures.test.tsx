// What a hook that fails leaves behind. The engine skips it: what is beneath
// it runs in its place, or what its last `next` answered stands. Each kind of
// hook fails here where it stands, the crew's state refused under it, and the
// row, the call, the prompt or the spawn goes on. A guard answers for it, and
// a drawing's `.catch` passes the event on: the engine's row, caught.
import { expect } from 'claude-code/testing'
import type { Plugin, TestBody } from 'claude-code/testing'
import type { On, TraceOutcome } from 'claude-code'
import { DELEGATE_FAILED, SEND_UNSURE } from '../src/prompts/results'
import { COMPOSER, DELEGATE, NOVA_OFF, PANE, SURFACES, crewCommand, engine, progressCrew, spawnAgent, switchTo, test, toolRow } from './support/crew'
import type { Result, Row, Said, Seen } from './support/crew'

type Dollar = Parameters<TestBody>[0]
type Surface = (typeof SURFACES)[number]

// One way a hook fails: the event it hooks, what the engine decides of it, and
// the scene, which checks what goes on. VS Code's drawings have no `decided`: a
// hook above one reads all beneath it as one link of the engine's.
type Failure = { name: string; event: string; decided?: TraceOutcome; scene: ($: Dollar, on: On) => Promise<void> }

const START = { cwd: '/work/main', surface: 'terminal', isInteractive: true } as const
const VIEWPORT = { columns: 100, rows: 40 }
const INPUT = { task: 'Fix the tests', title: 'Tests', repo: '/work/api' }

// The crew's state, refused while `isOn`: a hook that reads it throws there.
function stateFault(on: On) {
  const fault = { isOn: false }
  on('state.get', (_, e, next) => (fault.isOn ? { deny: 'state gone' } : next(e)))
  return fault
}

// Over the engine's answer to one tool, counts the calls that reach it;
// `afterNext` makes the crew's hook fail once its `next` was answered.
function toolBeneath(on: On, tool: string, fault: { isOn: boolean }, afterNext = false) {
  const reached = { calls: 0 }
  on('tool.call', { tool: new RegExp(`^${tool}$`) }, (_, e, next) => {
    reached.calls++
    if (afterNext) fault.isOn = true
    return next(e)
  })
  return reached
}

// ---- a crew row falls back to the engine's ----

const mountCall = ($: Dollar, surface: Surface, requestId: string, props: Row) =>
  $.ui.mount({ plugin: 'crew', surface, component: 'ToolUse', requestId, props, viewport: VIEWPORT })
const mountResult = ($: Dollar, surface: Surface, requestId: string, props: Result) =>
  $.ui.mount({ plugin: 'crew', surface, component: 'ToolResult', requestId, props })
const mountSaid = ($: Dollar, surface: Surface, requestId: string, props: Said) =>
  $.ui.mount({ plugin: 'crew', surface, component: 'UserMessage', requestId, props, viewport: VIEWPORT })

// A row the crew draws while its state answers, and the engine's once it does not.
async function fallsBack(
  fault: { isOn: boolean },
  mount: (requestId: string) => Promise<{ drawn: () => Promise<{ type: string }>; unmount: () => Promise<void> }>,
) {
  const drawn = await mount('drawn')
  expect((await drawn.drawn()).type).not.toBe('engine')
  await drawn.unmount()
  fault.isOn = true
  const failed = await mount('failed')
  expect((await failed.drawn()).type).toBe('engine')
}

// A call to Pip on `surface`, with what it answered.
async function delegated($: Dollar, on: On, surface: Surface) {
  engine(on)
  const fault = stateFault(on)
  await $.session.start({ ...START, surface })
  const output = String((await $.tool.call({ tool: DELEGATE, tool_use_id: 'toolu_1', ...INPUT })).result)
  return { fault, output }
}

const decidedOn = (surface: Surface): Pick<Failure, 'decided'> => (surface === 'vscode' ? {} : { decided: 'caught' })

const SAID: Said = { text: '42 tests pass', origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'pip' } }

const ROWS: Failure[] = (['terminal', 'desktop', 'vscode'] as const).flatMap((surface): Failure[] => [
  {
    name: `the call's row on ${surface}`,
    event: 'ui.render',
    ...decidedOn(surface),
    scene: async ($, on) => {
      const { fault, output } = await delegated($, on, surface)
      await fallsBack(fault, id => mountCall($, surface, id, toolRow(DELEGATE, 'toolu_1', INPUT, { output })))
    },
  },
  {
    name: `the result's row on ${surface}`,
    event: 'ui.render',
    ...decidedOn(surface),
    scene: async ($, on) => {
      const { fault, output } = await delegated($, on, surface)
      await fallsBack(fault, id => mountResult($, surface, id, { tool: DELEGATE, tool_use_id: 'toolu_1', output, isErrored: false }))
    },
  },
  {
    name: `a worker's message on ${surface}`,
    event: 'ui.render',
    ...decidedOn(surface),
    scene: async ($, on) => {
      const { fault } = await delegated($, on, surface)
      await fallsBack(fault, id => mountSaid($, surface, id, SAID))
    },
  },
])

const OWN_DRAWINGS: Failure[] = SURFACES.flatMap((surface): Failure[] => [
  {
    name: `a row the crew placed on ${surface}`,
    event: 'ui.render',
    ...decidedOn(surface),
    scene: async ($, on) => {
      const fault = stateFault(on)
      const crew = await progressCrew($, on)
      await crew.delegate('Fix the tests', '/work/api', 'Tests')
      await crewCommand($, 'progress')
      const id = crew.placed.at(-1)!
      await fallsBack(fault, requestId =>
        $.ui.mount({ plugin: 'crew', surface, component: 'Placed', requestId, props: { id, plugin: 'crew' }, viewport: VIEWPORT }),
      )
    },
  },
  {
    name: `the pane on ${surface}`,
    event: 'ui.render',
    ...decidedOn(surface),
    scene: async ($, on) => {
      engine(on)
      const fault = stateFault(on)
      await $.session.start({ ...START, surface })
      await fallsBack(fault, () => $.ui.mount({ ...PANE, surface }))
    },
  },
])

// ---- what it stood over goes on ----

const GOES_ON: Failure[] = [
  {
    name: 'the watch on every tool call, before its next',
    event: 'tool.call',
    decided: 'skipped',
    scene: async ($, on) => {
      const fault = stateFault(on)
      const reached = toolBeneath(on, 'Read', fault)
      engine(on)
      await $.session.start(START)
      fault.isOn = true
      // A worker's call: the watch reads the workers before its next.
      const done = await $.tool.call({ tool: 'Read', file_path: '/work/api/a.ts', agentId: 'agent-1' })
      expect(done.deny).toBeUndefined()
      expect(done.result).toEqual({})
      expect(reached.calls).toBe(1)
    },
  },
  {
    name: 'the watch on every tool call, after its next was answered',
    event: 'tool.call',
    decided: 'kept',
    scene: async ($, on) => {
      const fault = stateFault(on)
      const reached = toolBeneath(on, 'TaskCreate', fault, true)
      engine(on)
      await $.session.start(START)
      const done = await $.tool.call({ tool: 'TaskCreate', subject: 'Fix', agentId: 'agent-1' } as never)
      expect(done.result).toEqual({ task: { id: '1', subject: 'Fix' } })
      expect(reached.calls).toBe(1)
    },
  },
  {
    name: 'the roster tool',
    event: 'tool.call',
    decided: 'skipped',
    scene: async ($, on) => {
      const fault = stateFault(on)
      const reached = toolBeneath(on, 'mcp__crew__roster', fault)
      engine(on)
      await $.session.start(START)
      fault.isOn = true
      expect((await $.tool.call({ tool: 'mcp__crew__roster' })).result).toEqual({})
      expect(reached.calls).toBe(1)
    },
  },
  {
    name: 'the progress tool',
    event: 'tool.call',
    decided: 'skipped',
    scene: async ($, on) => {
      const fault = stateFault(on)
      const reached = toolBeneath(on, 'mcp__crew__progress', fault)
      engine(on)
      await $.session.start(START)
      fault.isOn = true
      const input = { tool: 'mcp__crew__progress', step: 1, total: 2, doing: 'Reading', agentId: 'agent-1' }
      expect((await $.tool.call(input as never)).result).toEqual({})
      expect(reached.calls).toBe(1)
    },
  },
  {
    name: 'composing the prompt, after its next was answered',
    event: 'prompt.compose',
    decided: 'kept',
    scene: async ($, on) => {
      let composed = 0
      on('prompt.compose', () => {
        composed++
        return { sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }
      })
      engine(on)
      const fault = stateFault(on)
      await $.session.start(START)
      fault.isOn = true
      const prompt = await $.prompt.compose({
        model: 'test-model',
        promptModel: 'test-model',
        surfaces: ['terminal'],
        tools: [],
        outputStyle: null,
        traits: [],
      })
      expect(prompt.sections.map(s => s.id)).toEqual(['intro'])
      expect(composed).toBe(1)
    },
  },
  {
    name: "the person's prompt, before its next",
    event: 'prompt.submit',
    decided: 'skipped',
    scene: async ($, on) => {
      let entered = 0
      on('prompt.submit', (_, e) => {
        entered++
        return { text: e.text }
      })
      engine(on)
      const fault = stateFault(on)
      await $.session.start(START)
      fault.isOn = true
      expect((await $.prompt.submit({ text: 'Hola', wait: false, origin: COMPOSER })).text).toBe('Hola')
      expect(entered).toBe(1)
    },
  },
  {
    name: "the person's prompt, after its next was answered",
    event: 'prompt.submit',
    decided: 'kept',
    scene: async ($, on) => {
      const fault = stateFault(on)
      const contexts: (readonly string[] | undefined)[] = []
      on('prompt.submit', (_, e) => {
        contexts.push(e.context)
        fault.isOn = true
        return { text: e.text }
      })
      engine(on, { stored: { isOn: true, toldBy: { 'sess-1': NOVA_OFF } } })
      await $.session.start(START)
      expect((await $.prompt.submit({ text: 'Hola', wait: false, origin: COMPOSER })).text).toBe('Hola')
      // The note it attached went with the prompt, which entered once.
      expect(contexts).toEqual([[expect.stringMatching(/^\[crew\]/)]])
    },
  },
  {
    name: 'a spawn, before its next',
    event: 'agent.spawn',
    decided: 'skipped',
    scene: async ($, on) => {
      const seen: Seen = { prompts: [], sends: [] }
      engine(on, { seen })
      const fault = stateFault(on)
      await $.session.start(START)
      fault.isOn = true
      const started = await spawnAgent($, { prompt: 'Fix the tests', description: 'Tests', subagentType: 'general-purpose' })
      expect(started.agentId).toBe('agent-1')
      // It starts as it was asked, with nothing of the crew's.
      expect(seen.prompts).toEqual(['Fix the tests'])
    },
  },
  {
    name: 'a spawn, after its next was answered',
    event: 'agent.spawn',
    decided: 'kept',
    scene: async ($, on) => {
      const fault = stateFault(on)
      const seen: Seen = { prompts: [], sends: [] }
      const nextId = () => {
        fault.isOn = true
        return 'agent-1'
      }
      engine(on, { seen, nextId })
      await $.session.start(START)
      const started = await spawnAgent($, { prompt: 'Fix the tests', description: 'Tests', subagentType: 'general-purpose' })
      expect(started.agentId).toBe('agent-1')
      // Started once, with what the crew's hook had added to its prompt.
      expect(seen.prompts).toEqual([expect.stringContaining('Fix the tests')])
      expect(seen.prompts[0]).not.toBe('Fix the tests')
    },
  },
  {
    name: 'a model switch',
    event: 'classic.PostModelSwitch',
    decided: 'skipped',
    scene: async ($, on) => {
      let switched = 0
      on('classic.PostModelSwitch', () => {
        switched++
        return {}
      })
      engine(on)
      const fault = stateFault(on)
      await $.session.start(START)
      fault.isOn = true
      expect(await $.classic.PostModelSwitch(switchTo('claude-haiku-5'))).toEqual({})
      expect(switched).toBe(1)
    },
  },
  {
    name: 'a session that starts',
    event: 'session.start',
    decided: 'skipped',
    scene: async ($, on) => {
      engine(on)
      const fault = stateFault(on)
      fault.isOn = true
      expect((await $.session.start(START)).cwd).toBe('/work/main')
    },
  },
  {
    name: 'a measure of the session',
    event: 'session.measure',
    decided: 'skipped',
    scene: async ($, on) => {
      engine(on)
      const fault = stateFault(on)
      await $.session.start(START)
      fault.isOn = true
      const measured = await $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 13 }], changed: ['rateLimits'] })
      expect(measured.changed).toEqual(['rateLimits'])
    },
  },
  {
    name: 'a turn that starts',
    event: 'turn.start',
    decided: 'skipped',
    scene: async ($, on) => {
      on('turn.start', (_, e) => ({ turnId: e.turnId }))
      engine(on)
      const fault = stateFault(on)
      await $.session.start(START)
      fault.isOn = true
      expect((await $.turn.start({ text: 'Hola', turnId: 't1' })).turnId).toBe('t1')
    },
  },
  {
    name: 'a turn that ends',
    event: 'turn.complete',
    decided: 'skipped',
    scene: async ($, on) => {
      engine(on)
      const fault = stateFault(on)
      await $.session.start(START)
      fault.isOn = true
      expect((await $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })).text).toBe('Hecho')
    },
  },
  {
    name: 'the /crew command',
    event: 'command.run',
    decided: 'skipped',
    scene: async ($, on) => {
      on('command.run', () => ({ text: 'from the engine' }))
      engine(on)
      const fault = stateFault(on)
      await $.session.start(START)
      fault.isOn = true
      expect((await crewCommand($, '')).text).toBe('from the engine')
    },
  },
]

// ---- a guard answers for it ----

const GUARDS: Failure[] = [
  {
    name: 'delegate, which refuses rather than reach no tool',
    event: 'tool.call',
    decided: 'caught',
    scene: async ($, on) => {
      const fault = stateFault(on)
      const reached = toolBeneath(on, DELEGATE, fault)
      engine(on)
      await $.session.start(START)
      fault.isOn = true
      const done = await $.tool.call({ tool: DELEGATE, ...INPUT })
      expect(done.deny).toBe(DELEGATE_FAILED)
      expect(reached.calls).toBe(0)
    },
  },
  {
    name: 'a send that failed on its way, which is not tried again',
    event: 'session.send',
    decided: 'caught',
    scene: async ($, on) => {
      const seen: Seen = { prompts: [], sends: [], failSends: true }
      engine(on, { seen })
      await $.session.start(START)
      const sent = await $.session.send({ to: 'someone', text: 'Hola', origin: { kind: 'model' } } as Parameters<typeof $.session.send>[0])
      expect(sent).toEqual({ isDelivered: false, reason: SEND_UNSURE })
      expect(seen.sends).toEqual(['Hola'])
    },
  },
  {
    name: 'a send that failed before it went, which goes',
    event: 'session.send',
    decided: 'caught',
    scene: async ($, on) => {
      const seen: Seen = { prompts: [], sends: [] }
      engine(on, { seen })
      const fault = stateFault(on)
      await $.session.start(START)
      fault.isOn = true
      const sent = await $.session.send({ to: 'someone', text: 'Hola', origin: { kind: 'model' } } as Parameters<typeof $.session.send>[0])
      expect(sent).toEqual({ isDelivered: true })
      expect(seen.sends).toEqual(['Hola'])
    },
  },
]

// Above the crew in every chain, it says what the chain decided for the crew's
// hooks: a `.catch` that answered is told from one the engine skipped.
const ABOVE: Plugin = {
  name: 'above',
  tier: 'prepend',
  register(on) {
    on('*', async ($, e, next) => {
      const done = await next(e as never)
      const crew = next.trace.filter(link => link.plugin === 'crew')
      if (crew.length > 0) {
        $.ui.log(JSON.stringify({ event: next.event, decided: crew.map(link => link.outcome) }), { to: 'debug' })
        // After the line: the chain settles once the test has it.
        await $.clock.now()
      }
      return done
    })
  },
}

for (const failure of [...ROWS, ...OWN_DRAWINGS, ...GOES_ON, ...GUARDS]) {
  test(`when it fails: ${failure.name}`, async ($, on) => {
    on('ui.log', () => ({ value: undefined }))
    await failure.scene($, on)
  })

  if (failure.decided === undefined) continue
  test(`what the engine decides when it fails: ${failure.name}`, { plugins: [ABOVE] }, async ($, on) => {
    const decisions: { event: string; decided: TraceOutcome[] }[] = []
    on('ui.log', (_, e) => {
      if (e.text.startsWith('{"event"')) decisions.push(JSON.parse(e.text))
      return { value: undefined }
    })
    await failure.scene($, on)
    const last = decisions.findLast(d => d.event === failure.event)
    expect([...new Set(last?.decided)]).toEqual([failure.decided])
  })
}
