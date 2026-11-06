// What the crew tests drive the plugin with: crews at work and the calls that
// move them, the texts and inputs they are given, and what mounts and reads
// their drawings.
import { expect } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, On } from 'claude-code'
import { DEFAULT_TYPE, DELEGATE, PLUGIN } from '../../src/config'
import type { Anim } from '../../src/figure/anim'
import { DIAMOND_W } from '../../src/figure/diamond'
import { DEFAULT_LOOK } from '../../src/figure/look'
import { JUST_ENDED_MS } from '../../src/progress/runs'
import { engine } from './engine'
import type { Seen } from './engine'

export { DELEGATE }

export const PANE = {
  plugin: PLUGIN,
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

export const composeBrief = async ($: Parameters<TestBody>[0]) =>
  (
    await $.prompt.compose({
      model: 'test-model',
      promptModel: 'test-model',
      surfaces: ['terminal'],
      tools: [DELEGATE],
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
  await spawnAgent($, { prompt: 'Build the session bus step', description: 'Session bus', subagentType: DEFAULT_TYPE, parentAgentId: 'agent-1' })
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
      id, name: id, description: 'x', type: DEFAULT_TYPE, status: states.get(id) ?? 'running',
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
// last sign of life (`MISSED_MS` in src/progress/tracker.ts, not the time a
// free worker naps after), and then stands out for half a minute.
export const AWAY_MS = 5000 + JUST_ENDED_MS

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
  $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'ToolUse', requestId: props.tool_use_id, props, viewport })

export type Said = { text: string; origin: { kind: 'task-notification' | 'unclassified' | 'composer' | 'peer' }; isExpanded: boolean; from?: { name: string }; task?: { id?: string; status?: string; durationMs?: number } }

export const mountSaid = ($: Parameters<TestBody>[0], id: string, props: Said, viewport: { columns: number; rows: number; isFullscreen?: boolean } = CLICKS) =>
  $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId: id, props, viewport })

// A bubble's rows as drawn: its top border, its lines and its bottom one,
// each a Text, or a row Box where it holds the glyph that opens or closes
// it (a row of one piece is found twice, as the row and as the piece).
export const frameRows = async (ui: { findAll: (q: { text: RegExp }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ text: /^(╭─ .*╮|│ .* │|╰─.*╯)$/ })).map(x => x.text).filter((x, i, all) => x !== all[i - 1])

export type Result = { tool: string; tool_use_id: string; output: unknown; isErrored: boolean; isExpanded?: boolean }

// The block under a tool row, where the engine draws the call's result.
export const mountResult = ($: Parameters<TestBody>[0], props: Result) =>
  $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'ToolResult', requestId: props.tool_use_id, props })

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
      id, name: id, description: 'x', type: DEFAULT_TYPE, status: states.get(id) ?? 'running',
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
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Placed', requestId: id, props: { id, plugin: PLUGIN }, viewport: { columns, rows: 40 } })
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
