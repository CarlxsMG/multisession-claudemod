// What sits beneath the plugin in a crew test: the kit's `test`, and an engine
// that answers whatever the plugin asks of the host.
import { mock, test as kitTest } from 'claude-code/testing'
import type { TestRest } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, HookFor, On } from 'claude-code'
import { PLUGIN } from '../../src/config'
import { APPLE_TYPE_TICK_MS, TYPE_TICK_MS } from '../../src/ui/pane/feed'

/** The kit's `test`, with the plugin under test speaking English unless a test asks for another language. */
export function test(name: string, ...rest: TestRest) {
  const [options, body] = rest.length === 1 ? [{}, rest[0]] : rest
  kitTest(name, { ...options, options: { language: 'en', ...options.options } }, body)
}

// Nothing sits beneath the plugin: each hook here stands for the engine.
// What the engine records, and how it answers sends and spawns: `tools`
// the delegate descriptions registered, `specs` every tool registration,
// `undelivered` the reason a send is not delivered, `refuse` auto mode's
// refusal of the plugin's own spawns.
export type Seen = {
  prompts: string[]
  sends: string[]
  models?: (string | undefined)[]
  tools?: string[]
  specs?: { name: string; description: string; inputSchema: unknown }[]
  failSends?: boolean
  undelivered?: string
  spawns?: AgentSpawnInput[]
  refuse?: string
  opens?: string[]
}

// What a test's engine answers: the ids of new agents, the engine's list of
// agents, what it records (`seen`), the account's rate limits, the usage
// probe's stdout, the store, the session id and the host; and `typing`, for
// a test about bubbles typing out, which keeps the timer that draws them.
export type EngineOptions = {
  nextId?: () => string
  agents?: () => AgentInfo[]
  seen?: Seen
  rateLimits?: { kind: string; percentUsed: number }[]
  probe?: (argv: readonly string[], stdin: string) => string
  stored?: Record<string, unknown>
  session?: () => string
  host?: { cwd?: string; env?: Record<string, string>; model?: () => string; exists?: (path: string) => boolean }
  typing?: boolean
}

// `mock.clock` as it is, but for the timer that types the pane's bubbles out,
// whose first period it refuses, which ends that timer. It comes round eleven
// times a simulated second and does nothing unless a bubble is typing, and each
// round is a dispatch through every hook: of a test whose clock advances
// minutes, it was two thirds of the time. An event takes one hook of a test's,
// the mock's, so the refusal goes in that hook as the mock registers it.
function clockWithoutTyping(on: On) {
  const clockOn = ((event: 'clock.every', hook: HookFor<'clock.every'>) =>
    on(
      event,
      event !== 'clock.every'
        ? hook
        : (host, wait, next) =>
            wait.ms === TYPE_TICK_MS || wait.ms === APPLE_TYPE_TICK_MS ? { deny: 'no bubble in this test waits on the typing timer' } : hook(host, wait, next),
    )) as On
  return mock.clock(clockOn, { now: 1_000_000 })
}

export function engine(on: On, options: EngineOptions = {}) {
  const {
    nextId = () => 'agent-1',
    agents = (): AgentInfo[] => [],
    seen,
    rateLimits = [],
    probe = (): string => '',
    stored = {},
    session = () => 'sess-1',
    host = {},
    typing = false,
  } = options
  const clock = typing ? mock.clock(on, { now: 1_000_000 }) : clockWithoutTyping(on)
  mock.env(on, host.env ?? {})
  mock.store(on, stored)
  on('session.id', () => ({ value: session() }))
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('tool.register', (_, e) => {
    if (e.name === 'delegate') seen?.tools?.push(e.description)
    seen?.specs?.push({ name: e.name, description: e.description, inputSchema: e.inputSchema })
    return { value: { tool: `mcp__crew__${e.name}` } }
  })
  on('ui.open', (_, e) => {
    seen?.opens?.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.cwd', () => ({ value: host.cwd ?? '/work/main' }))
  on('session.model', () => ({ value: host.model?.() ?? 'claude-opus-5-5' }))
  on('agent.list', () => ({ value: agents() }))
  on('fs.exists', (_, e) => ({ value: host.exists?.(e.path) ?? true }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('process.run', (_, e) => ({
    value: { exitCode: 0, stdout: probe(e.argv, e.init?.stdin ?? ''), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', (_, e, next) => {
    // Auto mode's answer to a spawn the plugin makes.
    if (seen?.refuse !== undefined && next.origin.plugin === PLUGIN) return { deny: seen.refuse }
    seen?.spawns?.push(e)
    seen?.prompts.push(e.prompt)
    seen?.models?.push(e.model)
    return { model: 'test-model', agentId: nextId() }
  })
  on('session.send', (_, e) => {
    seen?.sends.push(e.text)
    if (seen?.failSends === true) throw new Error('socket closed')
    if (seen?.undelivered !== undefined) return { isDelivered: false as const, reason: seen.undelivered }
    return { isDelivered: true as const }
  })
  // TaskCreate answers with the id of the task it made, as the engine's does.
  let tasks = 0
  on('tool.call', (_, e) => ({ result: e.tool === 'TaskCreate' ? { task: { id: String(++tasks), subject: e.subject } } : {} }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  // The engine's own drawing of a row the plugin leaves alone.
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  return clock
}

// For a test that takes over a second or two unloaded, most of them because
// their mocked clock advances minutes and every tick on the way runs the
// plugin's timers: with the test files run side by side, that nears the
// default 5 s.
export const SLOW = { timeoutMs: 15_000 }
