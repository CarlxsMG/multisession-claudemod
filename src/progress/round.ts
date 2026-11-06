// A round: the runs since the orchestrator's last check-in, whether what
// they did since is news, and the lines a check-in gives them.
import type { CheckLine, Round, Run, SeenRun } from '../../types'
import { flat } from '../util/text'
import { shownPhase } from './phase'
import { isOpen, runMs } from './runs'

/** No round under way. */
export const NO_ROUND: Round = { startedAt: 0, ids: [], lastAt: 0, seen: [], closedAt: 0 }

/**
 * A run joins the round under way, or starts one; a round whose summary is
 * still waiting goes on, as nobody has seen it end.
 */
export function joinRound(round: Round, id: string, now: number): Round {
  if (round.startedAt === 0) return { startedAt: now, ids: [id], lastAt: now, seen: [], closedAt: 0 }
  return { ...round, ids: round.ids.includes(id) ? round.ids : [...round.ids, id], closedAt: 0 }
}

// A big jump in tool calls is news on its own, whatever the phase.
const BIG_JUMP = 25

/** The round's runs as a check-in shows them, what the next one is compared with. */
export function seenOf(round: Round, runs: readonly Run[], statusOf: (id: string) => string): SeenRun[] {
  return round.ids.flatMap(id => {
    const run = runs.find(x => x.id === id)
    if (run === undefined) return []
    const seen: SeenRun = { id, startedAt: run.startedAt, phase: shownPhase(run, statusOf(id)), tools: run.tools, isOpen: isOpen(run) }
    return [run.plan === undefined ? seen : { ...seen, step: run.plan.step }]
  })
}

/**
 * News since the last check-in: a worker started or ended, a phase or a
 * step changed, or a worker made many more calls.
 */
export function hasNews(before: readonly SeenRun[], after: readonly SeenRun[]): boolean {
  return after.some(a => {
    const b = before.find(x => x.id === a.id)
    if (b === undefined || b.startedAt !== a.startedAt || b.isOpen !== a.isOpen) return true
    return a.isOpen && (a.phase !== b.phase || a.step !== b.step || a.tools - b.tools >= BIG_JUMP)
  })
}

/**
 * A round ends with a summary when it had two workers or more, or ran longer
 * than the check-in interval; with check-ins off, never.
 */
export const wantsSummary = (r: Round, everyMs: number): boolean => everyMs > 0 && (r.ids.length >= 2 || r.closedAt - r.startedAt > everyMs)

/**
 * The lines of a check-in: the round's workers still running first, in the
 * order they started, then those that ended, in the order they did.
 */
export function checkLines(
  round: Round,
  runs: readonly Run[],
  who: (id: string) => { name: string; status: string; doing: string; title: string },
  now: number,
): CheckLine[] {
  const mine = round.ids.flatMap(id => {
    const run = runs.find(x => x.id === id)
    return run === undefined ? [] : [run]
  })
  const running = mine.filter(isOpen).sort((a, b) => a.startedAt - b.startedAt)
  const ended = mine.filter(x => !isOpen(x)).sort((a, b) => a.endedAt - b.endedAt)
  return [...running, ...ended].map(run => {
    const worker = who(run.id)
    const line: CheckLine = {
      id: run.id,
      name: worker.name,
      phase: shownPhase(run, worker.status),
      end: run.end,
      ms: runMs(run, now),
      doing: flat(isOpen(run) ? run.plan?.doing || worker.doing : worker.title),
      tools: run.tools,
    }
    return run.plan === undefined ? line : { ...line, plan: run.plan }
  })
}
