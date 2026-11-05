// The account's usage the pane shows: the engine's rate-limit windows, and a
// model's own weekly window, which only a headless claude's /usage gives.
import type { Limit } from '../../types'
import { quiet, unrecognized } from '../engine'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { runtime } from '../runtime'
import { updateModelLimits } from '../state/atoms'
import { basename } from '../util/path'

/** The pane's name for one of the engine's usage windows, undefined for a kind it does not name. */
export const limitLabel = (kind: string): string | undefined => {
  // The engine's own string: only a key of the catalog's, never one every object has.
  const labels = t().limit
  return Object.hasOwn(labels, kind) ? labels[kind] : undefined
}
// The order the pane shows the engine's windows in.
const LIMIT_ORDER = ['five_hour', 'seven_day', 'spend_limit']
/** The windows the pane shows: the session's, the week's and a model's week. */
export const LIMITS_SHOWN = 3
// The usage probe is a whole claude process; one that hangs is given up.
const PROBE_TIMEOUT_MS = 30_000

const limitRank = (kind: string): number => {
  const i = LIMIT_ORDER.indexOf(kind)
  return i < 0 ? 99 : i
}
/** The engine's usage windows the pane shows, in whole percent, in the order of `LIMIT_ORDER`. */
export const toLimits = (list: readonly { kind: string; percentUsed: number }[]): Limit[] =>
  list
    .map(r => ({ kind: r.kind, percent: Math.round(r.percentUsed) }))
    .sort((a, b) => limitRank(a.kind) - limitRank(b.kind))
    .slice(0, LIMITS_SHOWN)
/** A window's color by how much of it is used. */
export const limitColor = (percent: number): string => (percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success')

// A model's own weekly window (Fable's) reaches only /usage, not the engine's
// figures: a headless claude answers the SDK's `get_usage` request, which reads
// the account's usage and runs no model. Without the user's settings it loads
// no plugins, this one included, and it keeps no session.
const USAGE_PROBE = [
  '-p', '--setting-sources', 'local', '--strict-mcp-config', '--no-session-persistence',
  '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
]
const USAGE_REQUEST = `${JSON.stringify({ type: 'control_request', request_id: 'crew-usage', request: { subtype: 'get_usage' } })}\n`
const PROBE_MS = 3 * 60_000
// Whether this session may ask for the usage, and when it last did: only
// the person's own session asks.
const probe = runtime.probe
// The crew's `usageProbe` option is `off`: no session of this load asks.
let isProbeOff = false

/** Takes the crew's `usageProbe` option as the plugin loads: `off` turns the probe off, anything else leaves it on. */
export function chooseUsageProbe(option: unknown) {
  isProbeOff = option === 'off'
}

/** Lets this session ask for the usage, as a person is there; true when it could not until now. */
export function allowUsageProbe(): boolean {
  if (probe.isAllowed) return false
  probe.isAllowed = true
  return true
}

/**
 * The model windows in a get_usage reply, or undefined when it holds none.
 * `odd` hears what of the reply is in no shape the crew reads; a null
 * `rate_limits` or `model_scoped` reads as no windows.
 */
export function parseModelLimits(stdout: string, odd: (what: string) => void = () => {}): Limit[] | undefined {
  for (const line of stdout.split('\n')) {
    if (!line.includes('"crew-usage"')) continue
    try {
      const reply = JSON.parse(line) as { response?: { error?: unknown; response?: { rate_limits?: { model_scoped?: unknown } | null } } }
      const rates = reply.response?.response?.rate_limits
      if (rates === undefined) {
        const error = reply.response?.error
        odd(`get_usage answered no rate_limits${typeof error === 'string' ? `: ${error}` : ''}`)
        return undefined
      }
      if (rates !== null && (typeof rates !== 'object' || !('model_scoped' in rates))) odd('get_usage answered rate_limits without model_scoped')
      const scoped = Array.isArray(rates?.model_scoped) ? (rates.model_scoped as unknown[]) : []
      const read = scoped.flatMap(x => {
        const w = x as { display_name?: unknown; utilization?: unknown }
        return typeof w.display_name === 'string' && typeof w.utilization === 'number'
          ? [{ kind: w.display_name, percent: Math.round(w.utilization) }]
          : []
      })
      if (read.length < scoped.length) odd('get_usage answered a model window without display_name or utilization')
      return read
    } catch {
      odd('get_usage answered a line that is not JSON')
      return undefined
    }
  }
  odd('no answer to get_usage')
  return undefined
}

/**
 * Reads the models' own weekly windows from a headless claude, when the
 * engine's figures lack them.
 */
export async function probeUsage($: Engine) {
  const now = await $.clock.now()
  if (isProbeOff || !probe.isAllowed || now - probe.at < PROBE_MS) return
  probe.at = now
  const run = (exe: string) =>
    quiet($, $.process.run([exe, ...USAGE_PROBE], { stdin: USAGE_REQUEST, timeoutMs: PROBE_TIMEOUT_MS }), `usage probe ${exe}`)
  // `claude` on the PATH; where it is not there (a session the desktop app or
  // an editor started), the executable this session runs, when it is claude's.
  let result = await run('claude')
  if (result === undefined) {
    const own = (await $.env.get('CLAUDE_CODE_EXECPATH')) ?? ''
    if (/^claude(\.exe)?$/i.test(basename(own))) result = await run(own)
  }
  const found = result === undefined ? undefined : parseModelLimits(result.stdout, what => unrecognized($, 'usage probe answer', what))
  if (found !== undefined) await updateModelLimits($, () => found)
}

/** Whether an app draws this session: the desktop app, an editor or a phone. */
export async function hasApp($: Engine): Promise<boolean> {
  return (await $.session.surfaces().catch(() => [] as const)).some(s => s !== 'terminal')
}
