// The rows placed in the conversation: check-ins, summaries, end lines and
// message lines, the queue of those that wait for the main turn, and the
// check-in interval they are placed by. Drawn only: no model reads them.
import type { CheckIn, CheckLine, Note, PendingRow, Round, Run, Worker } from '../../types'
import { nameOf } from '../crew/feed'
import { ACTIVE } from '../crew/workers'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { runtime } from '../runtime'
import {
  STORE_KEYS,
  readCheckins,
  readJobs,
  readMembers,
  readPendingRows,
  readRound,
  readRuns,
  readWorkers,
  updateCheckins,
  updatePendingRows,
  updateRound,
} from '../state/atoms'
import { appendKept } from '../util/bounded'
import { DEFAULT_EVERY, parseEvery } from './check-in'
import { checkLines, seenOf } from './round'

// How often the newest check-in reads its times again when nothing else in
// it changed: each write draws again every row that reads the list.
const CHECKIN_TIMES_MS = 60_000
const CHECKINS_KEEP = 60

// The check-in interval.
const interval = runtime.placed

/** The check-in interval in minutes, 0 for off. */
export const everyMin = (): number => interval.everyMin ?? DEFAULT_EVERY

/** Reads the check-in interval the store keeps. */
export async function loadEvery($: Engine) {
  interval.everyMin = parseEvery(String(await $.store.get(STORE_KEYS.progress))) ?? DEFAULT_EVERY
}

/** Sets the minutes between check-ins, 0 for none, and keeps them in the store. */
export async function setEvery($: Engine, minutes: number) {
  interval.everyMin = minutes
  await $.store.set(STORE_KEYS.progress, minutes)
}

/** A line the tick places once the main session's turn is over. */
export async function queueLine($: Engine, row: PendingRow) {
  await updatePendingRows($, list => appendKept(list, [row], CHECKINS_KEEP))
}

/**
 * A message between agents lands in a conversation the user does not read:
 * the main one keeps a line of it.
 */
export async function noteMessage($: Engine, note: Note) {
  await queueLine($, { kind: 'message', lines: [], note })
}

// Who a line of a placed row names, as the crew (`workers`, read here when
// not given) has it now.
async function crewLookup($: Engine, workers?: readonly Worker[]) {
  const [list, members, given] = await Promise.all([workers ?? readWorkers($), readMembers($), readJobs($)])
  return (id: string) => {
    const worker = list.find(x => x.id === id)
    return {
      name: nameOf(id, worker, members),
      status: worker?.status ?? 'done',
      doing: worker !== undefined && ACTIVE.has(worker.status) ? worker.activity : '',
      title: given.find(j => j.id === id)?.title ?? worker?.task ?? '',
    }
  }
}

const rowId = (now: number): string => `progress-${now.toString(36)}-${(runtime.carried.placedSeq++).toString(36)}`

// The row's content goes in first, so its drawing finds it.
async function placeRow($: Engine, row: CheckIn) {
  await updateCheckins($, list => appendKept(list, [row], CHECKINS_KEEP))
  await quiet($, $.ui.place({ id: row.id }), 'place row')
}

/**
 * A check-in of the round under way, or a line saying nobody works; the
 * next one is counted from it and compared with what it shows.
 */
export async function placeCheckIn($: Engine, isAsked: boolean) {
  const now = await $.clock.now()
  const round = await readRound($)
  const all = await readRuns($)
  const who = await crewLookup($)
  const isRound = round.startedAt !== 0
  await placeRow($, {
    id: rowId(now),
    kind: 'checkin',
    at: now,
    roundMs: isRound ? now - round.startedAt : 0,
    every: everyMin(),
    isAsked,
    lines: isRound ? checkLines(round, all, who, now) : [],
  })
  if (isRound) await updateRound($, x => ({ ...x, lastAt: now, seen: seenOf(x, all, id => who(id).status) }))
}

// What a check-in's lines say but their times: what it is drawn again for.
const linesSaid = (lines: readonly CheckLine[]): string => JSON.stringify(lines.map(x => [x.id, x.name, x.phase, x.end, x.doing, x.plan?.step, x.plan?.total]))

/**
 * The round's newest check-in follows the round in place: its lines are read
 * again from the runs (`all`) and the workers (`list`) as the tick read them,
 * so it never gives an older step or phase than the pane and the status line.
 * Written when what it says changes, and its times once a minute; the rows
 * before it keep what they showed.
 */
export async function followCheckIn($: Engine, round: Round, list: readonly Worker[], all: readonly Run[], now: number) {
  if (round.startedAt === 0) return
  const newest = (await readCheckins($)).findLast(c => c.kind === 'checkin' || c.kind === 'summary')
  if (newest === undefined || newest.kind !== 'checkin' || newest.at < round.startedAt) return
  const lines = checkLines(round, all, await crewLookup($, list), now)
  const was = newest.shown ?? newest
  if (linesSaid(lines) === linesSaid(was.lines) && now - was.at < CHECKIN_TIMES_MS) return
  const roundMs = (round.closedAt || now) - round.startedAt
  await updateCheckins($, list => list.map(c => (c.id === newest.id ? { ...c, shown: { at: now, roundMs, lines } } : c)))
}

/** The row that closes a round. */
export async function placeSummary($: Engine, round: Round) {
  const now = await $.clock.now()
  const lines = checkLines(round, await readRuns($), await crewLookup($), now)
  await placeRow($, { id: rowId(now), kind: 'summary', at: now, roundMs: round.closedAt - round.startedAt, every: everyMin(), isAsked: false, lines })
}

/** The lines that wait for the main turn; read first, since a tick that finds none writes nothing. */
export async function placeWaiting($: Engine, now: number) {
  let waiting: PendingRow[] = []
  if ((await readPendingRows($)).length > 0) {
    await updatePendingRows($, queued => {
      waiting = [...queued]
      return []
    })
  }
  for (const row of waiting) await placeRow($, { id: rowId(now), at: now, roundMs: 0, every: everyMin(), isAsked: false, ...row })
}
