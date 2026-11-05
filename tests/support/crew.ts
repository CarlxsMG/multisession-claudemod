// What the crew tests share: an engine that answers beneath the plugin, and
// the fixtures and helpers that drive a crew through it.
import { expect, mock, test as kitTest } from 'claude-code/testing'
import type { TestBody, TestRest } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, On } from 'claude-code'
import type { Anim } from '../../src/figure/anim'
import { DIAMOND_W } from '../../src/figure/diamond'
import { DEFAULT_LOOK } from '../../src/figure/look'
import { DEFAULT_COLOR } from '../../src/figure/raster'
import { JUST_ENDED_MS } from '../../src/progress/runs'

/** The kit's `test`, with the plugin under test speaking English unless a test asks for another language. */
export function test(name: string, ...rest: TestRest) {
  const [options, body] = rest.length === 1 ? [{}, rest[0]] : rest
  kitTest(name, { ...options, options: { language: 'en', ...options.options } }, body)
}

export const PANE = {
  plugin: 'crew',
  component: 'Pane',
  requestId: 'crew',
  props: {
    title: 'Crew',
    isFocused: false,
    bodyColumns: 56,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

export const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

export const NO_VERDICT =
  "The server-side auto mode classifier gave no verdict for Agent: the request that produced this action did not ask for one. Issue the action again once, as-is; if it is denied again, continue with other tasks that don't require it and tell the user that auto mode could not evaluate it."

export const ANIMS: Anim[] = ['idle', 'sleep', 'thinking', 'working', 'delegating', 'happy', 'starting', 'waiting', 'done', 'failed', 'stopped']

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
// probe's stdout, the store, the session id and the host.
export type EngineOptions = {
  nextId?: () => string
  agents?: () => AgentInfo[]
  seen?: Seen
  rateLimits?: { kind: string; percentUsed: number }[]
  probe?: (argv: readonly string[], stdin: string) => string
  stored?: Record<string, unknown>
  session?: () => string
  host?: { cwd?: string; env?: Record<string, string>; model?: () => string; exists?: (path: string) => boolean }
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
  } = options
  const clock = mock.clock(on, { now: 1_000_000 })
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
    if (seen?.refuse !== undefined && next.origin.plugin === 'crew') return { deny: seen.refuse }
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

// An agent the Agent tool starts, with only what the test cares about: the
// engine fills the rest.
export const spawnAgent = ($: Parameters<TestBody>[0], input: Partial<AgentSpawnInput> & Pick<AgentSpawnInput, 'prompt'>) =>
  $.agent.spawn(input as AgentSpawnInput)

export type Ask = { task: string; repo: string; model?: string; fresh?: boolean }

export const USAGE = { input_tokens: 40_000, output_tokens: 3_000, cache_read_input_tokens: 500_000, cache_creation_input_tokens: 2_000, model: 'test-model' }

export const GIT_LINE = /\n- In a git repository: start with `git status`, leave changes you did not make alone, and read `git log`\/`git blame` before changing code\./
export const COMMENT_LINE =
  /\n- A comment says why the code is as it is now, never its history: not what changed or what it was, who or when \("now…", "no longer…", "was…", "previously…", "removed…"\), and no commented-out code\.\n/

// What a model switch hands the hooks, with the model it switched to.
export const switchTo = (to: string, from = 'claude-opus-5-5') => ({
  from_model: from,
  to_model: to,
  requested_model: null,
  source: 'command' as const,
  context_tokens: 0,
  prompt_cache_warm: false,
  cache_ttl: '5m' as const,
  estimated_cache_write_usd: 0,
  pricing: 'catalog' as const,
})

export const WRITTEN = JSON.stringify({
  idle: ['Listo para el combo'],
  thinking: ['Rumiando…'],
  working: ['Dale que te pego'],
  delegating: ['{w}, ¡al lío!', 'sin compañero'],
  happy: ['¡Clavado!', 'x'.repeat(60)],
  sleep: ['Zzz…'],
})

// A Raster's cells decoded, [codePoint, foreground, background] each.
export const cellsOf = (cells: string): [number, number, number][] => {
  const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
  return Array.from({ length: words.length / 3 }, (_, i) => [words[3 * i]!, words[3 * i + 1]!, words[3 * i + 2]!])
}

// The two pixels each cell paints, read back into a picture's grid (-1 where
// the terminal's background shows).
export const pixelsOf = (cells: [number, number, number][], w: number, h: number): number[] => {
  const px = new Array<number>(w * h).fill(-1)
  const own = (c: number) => (c === DEFAULT_COLOR ? -1 : c)
  cells.forEach(([ch, fg, bg], i) => {
    const r = Math.floor(i / w)
    const c = i % w
    const [top, bottom] = ch === 0x2580 ? [own(fg), own(bg)] : ch === 0x2584 ? [own(bg), own(fg)] : [-1, -1]
    px[2 * r * w + c] = top
    if (2 * r + 1 < h) px[(2 * r + 1) * w + c] = bottom
  })
  return px
}

// The engine's own cut to 256 colors (ansi-styles' rgbToAnsi256), and what
// xterm shows for each of its colors 16-255.
export const xtermIndex = (c: number): number => {
  const [r, g, b] = [(c >> 16) & 255, (c >> 8) & 255, c & 255]
  if (r === g && g === b) return r < 8 ? 16 : r > 248 ? 231 : Math.round(((r - 8) / 247) * 24) + 232
  return 16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5)
}
export const XTERM_LEVELS = [0, 95, 135, 175, 215, 255]
export const xtermColor = (i: number): number =>
  i >= 232
    ? (8 + 10 * (i - 232)) * 0x010101
    : (XTERM_LEVELS[Math.floor((i - 16) / 36)]! << 16) | (XTERM_LEVELS[Math.floor((i - 16) / 6) % 6]! << 8) | XTERM_LEVELS[(i - 16) % 6]!

export const PALETTE_CASES = [
  ['Terminal.app', { TERM_PROGRAM: 'Apple_Terminal' }, true],
  ['Terminal.app told it shows 24-bit color', { TERM_PROGRAM: 'Apple_Terminal', COLORTERM: 'truecolor' }, false],
  ['Terminal.app with FORCE_COLOR=3', { TERM_PROGRAM: 'Apple_Terminal', FORCE_COLOR: '3' }, false],
  ['another terminal', { TERM_PROGRAM: 'iTerm.app' }, false],
  ['a terminal that names none, such as Windows Terminal', {}, false],
] as const

export const composeBrief = async ($: Parameters<TestBody>[0]) =>
  (
    await $.prompt.compose({
      model: 'test-model',
      promptModel: 'test-model',
      surfaces: ['terminal'],
      tools: ['mcp__crew__delegate'],
      outputStyle: null,
      traits: [],
    })
  ).sections.find(s => s.id === 'crew:orchestrator')

export const COMPOSER = { kind: 'composer' } as const

export const crewCommand = ($: Parameters<TestBody>[0], args: string) =>
  $.command.run({ command: 'crew', args, origin: COMPOSER, presentation: { isFullscreen: false, columns: 80 } })

// A session that starts with delegation `isOn` in conversation `id`, each
// conversation's settings last told as `toldBy` has them, and what its
// messages carry beside them.
export async function startTold(
  $: Parameters<TestBody>[0],
  on: On,
  toldBy: Record<string, unknown>,
  isOn: boolean,
  id: { now: string } = { now: 'sess-1' },
) {
  engine(on, { stored: { isOn, toldBy }, session: () => id.now })
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)
    return { text: e.text }
  })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  return { contexts, submit: (text: string) => $.prompt.submit({ text, wait: false, origin: COMPOSER }) }
}

export const NOVA_ON = { on: true, name: 'Nova', vibe: DEFAULT_LOOK.vibe }
export const NOVA_OFF = { ...NOVA_ON, on: false }

// ---- a worker another one woke ----

// A worker's own SendMessage, as the engine raises it from that worker's
// loop: the model's, or stamped with the crew's name, as the model of an
// agent the crew spawned sends.
export const workerSend = ($: Parameters<TestBody>[0], to: string, text: string, agentId: string, origin: { kind: 'model' } | { kind: 'plugin'; name: string } = { kind: 'model' }) =>
  $.session.send({ to, text, agentId, origin } as Parameters<typeof $.session.send>[0])

// Pip in /work/api and Bolt, the agent Pip started there with the Agent
// tool: Bolt done and then woken by Pip's message, which the engine resumes
// it with: Bolt is busy again, for Pip.
export async function wokenCrew($: Parameters<TestBody>[0], on: On, agents?: () => AgentInfo[]) {
  let spawned = 0
  const seen: Seen = { prompts: [], sends: [] }
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, agents, seen })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const delegate = async (input: Record<string, unknown>) =>
    String((await $.tool.call({ tool: DELEGATE, ...input })).result)
  const roster = async (worker?: string) =>
    String((await $.tool.call({ tool: 'mcp__crew__roster', ...(worker ? { worker } : {}) })).result)
  const done = (agentId: string) =>
    $.turn.complete({ answer: `Hecho ${agentId}`, durationMs: 1, isAborted: false, turnId: `t-${agentId}-${seen.sends.length}`, agentId, reason: 'answer' })
  const message = (to: string, text: string, agentId: string) => workerSend($, to, text, agentId)
  await delegate({ task: 'Build the remote channel', title: 'Remote channel', repo: '/work/api' })
  await spawnAgent($, { prompt: 'Build the session bus step', description: 'Session bus', subagentType: 'general-purpose', parentAgentId: 'agent-1' })
  // To a busy agent a message changes nothing.
  await message('bolt', 'Pip: are you on router.ts?', 'agent-1')
  expect(await roster('bolt')).not.toMatch(/answering/)
  await done('agent-2')
  const sends = seen.sends.length
  await message('bolt', 'Pip: both fixed', 'agent-1')
  // Its own agent it reaches as it sent it.
  expect(seen.sends.slice(sends)).toEqual(['Pip: both fixed'])
  return { seen, clock, delegate, roster, done, message }
}

// A crew of `n` workers, Pip first, each in a repository of its own, whose
// statuses the engine's list gives from `states` (running by default).
export async function napCrew($: Parameters<TestBody>[0], on: On, n: number) {
  let spawned = 0
  const states = new Map<string, AgentInfo['status']>()
  const agents = (): AgentInfo[] =>
    Array.from({ length: spawned }, (_, i) => `agent-${i + 1}`).map(id => ({
      id, name: id, description: 'x', type: 'general-purpose', status: states.get(id) ?? 'running',
    }))
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, agents })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= n; i++) await $.tool.call({ tool: DELEGATE, task: `Task ${i}`, repo: `/work/r${i}` })
  const roster = async () => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  // The engine has these idle from now on, and the roster's sync sees it.
  const nap = async (...ids: string[]) => {
    for (const id of ids) states.set(id, 'idle')
    return roster()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 46 } })
  const card = async (id: string) => {
    await ui.redraw()
    return ui.find({ type: 'Raster', key: `w-${id}` })
  }
  const figures = async () => (await ui.findAll({ type: 'Raster' })).filter(r => r.key?.startsWith('w-'))
  return { clock, states, roster, nap, ui, card, figures }
}

// Pip alone, done this moment: its end stands out from here.
export async function doneCrew($: Parameters<TestBody>[0], on: On) {
  const crew = await napCrew($, on, 1)
  await $.turn.complete({ answer: 'Hecho', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  crew.states.set('agent-1', 'completed')
  return crew
}

// Pip alone, free this moment and its end over, so that only the time a free
// worker is given keeps it in the row.
export async function freeCrew($: Parameters<TestBody>[0], on: On) {
  const crew = await doneCrew($, on)
  await crew.clock.advance(JUST_ENDED_MS)
  await crew.nap('agent-1')
  return crew
}

// How long a worker the engine has free takes to leave the row when the end
// of its turn never reached the crew: the end is seen five seconds after its
// last sign of life, and then stands out for half a minute.
export const AWAY_MS = 5000 + JUST_ENDED_MS

// The characters a Raster's cells hold: a word of three per cell, the first
// the character.
export function cellText(cells: string): string {
  const bytes = atob(cells)
  let out = ''
  for (let i = 0; i < bytes.length; i += 12) out += String.fromCharCode(bytes.charCodeAt(i) | (bytes.charCodeAt(i + 1) << 8))
  return out
}

// What a headless claude answers to get_usage, Fable's week at `fable` percent.
export const usageReply = (fable: number) =>
  [
    JSON.stringify({ type: 'system', subtype: 'ui_panes' }),
    JSON.stringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'crew-usage',
        response: { rate_limits: { five_hour: { utilization: 12 }, model_scoped: [{ display_name: 'Fable', utilization: fable, resets_at: null }] } },
      },
    }),
  ].join('\n')

// ---- the conversation's crew rows ----

export const DELEGATE = 'mcp__crew__delegate'

export type Row = { tool: string; tool_use_id: string; input: Record<string, unknown>; isRunning: boolean; isErrored: boolean; isInterrupted: boolean; isExpanded?: boolean; output?: unknown }

export const toolRow = (tool: string, id: string, input: Record<string, unknown>, extra: Partial<Row> = {}): Row => ({
  tool,
  tool_use_id: id,
  input,
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  isExpanded: false,
  ...extra,
})

// The fullscreen terminal, which reports clicks: where a cut bubble opens.
export const CLICKS = { columns: 80, rows: 40, isFullscreen: true }

export const mountRow = ($: Parameters<TestBody>[0], props: Row, viewport: { columns: number; rows: number; isFullscreen?: boolean } = CLICKS) =>
  $.ui.mount({ plugin: 'crew', surface: 'terminal', component: 'ToolUse', requestId: props.tool_use_id, props, viewport })

export type Said = { text: string; origin: { kind: 'task-notification' | 'unclassified' | 'composer' | 'peer' }; isExpanded: boolean; from?: { name: string }; task?: { id?: string; status?: string; durationMs?: number } }

export const mountSaid = ($: Parameters<TestBody>[0], id: string, props: Said, viewport: { columns: number; rows: number; isFullscreen?: boolean } = CLICKS) =>
  $.ui.mount({ plugin: 'crew', surface: 'terminal', component: 'UserMessage', requestId: id, props, viewport })

// A bubble's rows as drawn: its top border, its lines and its bottom one,
// each a Text, or a row Box where it holds the glyph that opens or closes
// it (a row of one piece is found twice, as the row and as the piece).
export const frameRows = async (ui: { findAll: (q: { text: RegExp }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ text: /^(╭─ .*╮|│ .* │|╰─.*╯)$/ })).map(x => x.text).filter((x, i, all) => x !== all[i - 1])

export type Result = { tool: string; tool_use_id: string; output: unknown; isErrored: boolean; isExpanded?: boolean }

// The block under a tool row, where the engine draws the call's result.
export const mountResult = ($: Parameters<TestBody>[0], props: Result) =>
  $.ui.mount({ plugin: 'crew', surface: 'terminal', component: 'ToolResult', requestId: props.tool_use_id, props })

// Drawn as nothing: an empty Box.
export const isBlank = async (ui: { drawn: () => Promise<{ type: string }>; find: (q: { type: string }) => Promise<unknown> }) =>
  (await ui.drawn()).type === 'Box' && (await ui.find({ type: 'Text' })) === undefined

// The text of a drawn element, its pieces joined.
export const textIn = (x: unknown): string =>
  typeof x === 'string'
    ? x
    : typeof x === 'object' && x !== null && Array.isArray((x as { children?: unknown }).children)
      ? (x as { children: unknown[] }).children.map(textIn).join('')
      : ''

// A crew whose progress the test follows: the status lines pinned and the
// rows placed. The orchestrator delegates in a turn of its own that then
// ends, as it does in a session; the engine's list has each worker running
// until its turn ends, and running again once it is given more.
export async function progressCrew($: Parameters<TestBody>[0], on: On, stored: Record<string, unknown> = {}) {
  let spawned = 0
  const states = new Map<string, AgentInfo['status']>()
  const agents = (): AgentInfo[] =>
    Array.from({ length: spawned }, (_, i) => `agent-${i + 1}`).map(id => ({
      id, name: id, description: 'x', type: 'general-purpose', status: states.get(id) ?? 'running',
    }))
  const seen = { prompts: [] as string[], sends: [] as string[], tools: [] as string[] }
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, agents, seen, rateLimits: [], stored })
  const statuses: (string | undefined)[] = []
  const placed: string[] = []
  const toasts: string[] = []
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.place', (_, e) => {
    placed.push(e.id)
    return { value: { isPlaced: true as const, requestId: e.id } }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })

  let turns = 0
  // Starts a turn of the main session; the function it gives ends it.
  const mainTurn = async () => {
    const turnId = `m${++turns}`
    await $.turn.start({ text: '', turnId })
    return () => $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId, reason: 'answer' })
  }
  const ids = new Map<string, string>()
  const delegate = async (task: string, repo: string, title: string) => {
    const done = await mainTurn()
    const said = String((await $.tool.call({ tool: DELEGATE, task, title, repo })).result)
    await done()
    const started = /^Started (\w+) /.exec(said)
    if (started !== null) ids.set(started[1]!, `agent-${spawned}`)
    const given = /^Given to (\w+) /.exec(said)
    if (given !== null) states.set(ids.get(given[1]!)!, 'running')
    return said
  }
  const end = (agentId: string, reason: 'answer' | 'error' | 'aborted' = 'answer') => {
    states.set(agentId, reason === 'answer' ? 'idle' : reason === 'error' ? 'failed' : 'killed')
    return $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: reason === 'aborted', turnId: `w-${agentId}-${clock.now()}`, agentId, reason })
  }
  const status = () => statuses[statuses.length - 1]
  // A placed row's lines as drawn in a terminal `columns` wide.
  const lines = async (id: string, columns = 80) => {
    const ui = await $.ui.mount({ plugin: 'crew', surface: 'terminal', component: 'Placed', requestId: id, props: { id, plugin: 'crew' }, viewport: { columns, rows: 40 } })
    const box = await ui.find({ type: 'Box' })
    await ui.unmount()
    return (box?.children ?? []).map(textIn)
  }
  return { clock, seen, statuses, placed, toasts, states, status, mainTurn, delegate, end, lines }
}

// Glyphs Windows Terminal and Terminal.app draw alike, besides letters,
// digits and ASCII: ≈ marks a guessed time.
export const SAME_EVERYWHERE = /^[\p{L}\p{N}\s!-~✓×■·→…─│╭╮╯╰▀▄█░▴▸◀▶≈]*$/u

// ---- plans ----

// A worker's call of the progress tool; without an agent, the orchestrator's.
export const progress = async ($: Parameters<TestBody>[0], agentId: string | undefined, step: number, total: number, doing: string) =>
  String((await $.tool.call({ tool: 'mcp__crew__progress', step, total, doing, ...(agentId === undefined ? {} : { agentId }) } as never)).result)

// The texts of the team view, as the pane draws it.
export const teamTexts = async ($: Parameters<TestBody>[0]) => {
  await crewCommand($, 'team')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  return texts
}

// ---- cards ----

// The line under each name on the pane's cards, in a pane `columns` wide:
// a card is a column as wide as its diamond, and its line the last text in
// it ('' for a free worker's, which has none).
export const cardLines = async ($: Parameters<TestBody>[0], columns = 56) => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: columns } })
  const cards = (await ui.findAll({ type: 'Box' })).filter(b => b.props.width === DIAMOND_W && b.props.flexDirection === 'column')
  const shown = cards.map(card => {
    const texts = card.children.filter(k => typeof k === 'object' && k !== null && (k as { type?: unknown }).type === 'Text')
    const last = texts[texts.length - 1] as { props?: { wrap?: unknown } } | undefined
    return { text: last === undefined ? '' : textIn(last), wrap: last?.props?.wrap }
  })
  await ui.unmount()
  return shown
}

// For a test that takes over a second or two unloaded, most of them because
// their mocked clock advances minutes and every tick on the way runs the
// plugin's timers: with the test files run side by side, that nears the
// default 5 s.
export const SLOW = { timeoutMs: 15_000 }
