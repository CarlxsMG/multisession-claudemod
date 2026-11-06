// While workers run, the user follows what each does and for how long on
// surfaces no model reads: the status line, the pane and rows placed in the
// conversation. Nothing here messages anyone or adds to a prompt.
import type { CheckIn, CheckLine, Note, Orch, PendingRow, Plan, Round, RunEndKind, TaskList, Worker } from '../../types'
import { nameOf } from '../crew/feed'
import { ACTIVE, patchWorker } from '../crew/workers'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { runtime } from '../runtime'
import {
  STORE_KEYS,
  readMembers,
  readJobs,
  readOrch,
  readCheckins,
  readParents,
  readPendingRows,
  readRound,
  readRuns,
  readTaskLists,
  readWorkers,
  updateCheckins,
  updatePendingRows,
  updateRound,
  updateRuns,
  updateTaskLists,
} from '../state/atoms'
import { appendKept, setKept } from '../util/bounded'
import type { ToolCall } from '../util/input'
import { firstText } from '../util/text'
import { holdCall, writeCalls } from './calls'
import { DEFAULT_EVERY, parseEvery } from './check-in'
import { describe, phaseOf, shownPhase } from './phase'
import { todoPlan, withPlan } from './plan'
import type { Todo } from './plan'
import { NO_ROUND, checkLines, hasNews, joinRound, seenOf, wantsSummary } from './round'
import { closeRun, endOf, hasEnded, isJustEnded, isOpen, openRun, runMs } from './runs'
import { endNotice } from './text/ended'
import { statusText } from './text/status-line'

const PROGRESS_MS = 1000
// How often the newest check-in reads its times again when nothing else in
// it changed: each write draws again every row that reads the list.
const CHECKIN_TIMES_MS = 60_000
const RUNS_KEEP = 80
const CHECKINS_KEEP = 60
// A run whose worker the engine has free or gone ends this long after its
// last sign of life, when the end of its turn never came.
const MISSED_MS = 5000
// Twice the engine's default: an end comes while the user may be reading
// something else.
const END_TOAST_MS = 8000
// The status line takes at least this many columns, however narrow the
// width it was last given.
const STATUS_MIN_COLUMNS = 20

// The check-in interval; the status line as last pinned, which the first
// progress tick of a load pins afresh or clears of a line left from before;
// the transcript's width as its rows were last drawn, else the terminal's
// as a command last ran, which the status line is cut to; and how long each
// worker's last run took.
const progress = runtime.progress

// The check-in interval in minutes, 0 for off.
const everyMin = (): number => progress.everyMin ?? DEFAULT_EVERY

/** How long a worker's last run took, for an end notification that does not say. */
export const lastRunMs = (id: string): number | undefined => progress.ranFor.get(id)

// The main session's turn runs from its start, which sets the orchestrator
// thinking, to its end, which sets it happy; its tool calls set the rest. A
// row placed meanwhile would land amid the text it streams.
const isMainBusy = (o: Orch): boolean => o.mood === 'thinking' || o.mood === 'working' || o.mood === 'delegating'

/** Keeps the conversation's width, which the status line and the placed rows fit. */
export const seeColumns = (columns: number | undefined) => {
  if (columns !== undefined && columns > 0) progress.rowColumns = columns
}
export const seeCommandColumns = (columns: number) => {
  progress.commandColumns = columns
}

/**
 * A worker's run starts at its turn's start, its spawn, a task or a message
 * that wakes it, or else its first call: the hooks a spawn is nested in do
 * not hear its first turn start. A run's todo items are its own.
 */
export async function beginRun($: Engine, id: string) {
  if ((await readRuns($)).some(r => r.id === id && isOpen(r))) return
  if (!(await readWorkers($)).some(w => w.id === id)) return
  const now = await $.clock.now()
  if ((await readTaskLists($)).some(l => l.id === id)) await updateTaskLists($, lists => lists.filter(l => l.id !== id))
  await updateRuns($, list => openRun(list, id, now).slice(-RUNS_KEEP))
  await updateRound($, r => joinRound(r, id, now))
}

/**
 * Before a task or a message reaches a worker that is not busy: a run of it
 * still open missed its end, and ends as the tick would end it, at its last
 * sign of life, so the run the task starts has nothing of an older task's
 * plan or time.
 */
export async function settleRun($: Engine, w: Pick<Worker, 'id' | 'status'>) {
  if (ACTIVE.has(w.status)) return
  await endRun($, w.id, endOf(w.status), true)
}

/**
 * A worker's tool call. One that sets it working shows at once; its count,
 * what it does and its run's phase wait for the pane's next frame
 * (`holdCall`), since a worker makes many calls between two.
 */
export async function noteCall($: Engine, id: string, call: ToolCall) {
  const worker = (await readWorkers($)).find(w => w.id === id)
  if (worker === undefined) return
  const activity = describe(call)
  if (worker.status !== 'working') await patchWorker($, id, () => ({ status: 'working', activity }))
  await beginRun($, id)
  holdCall(id, activity, phaseOf(call), await $.clock.now())
}

/**
 * A plan for the worker's open run, a sign of life too; false when it has
 * none open, as for an agent the crew does not follow.
 */
export async function setPlan($: Engine, id: string, plan: (prev: Plan | undefined) => Plan | undefined): Promise<boolean> {
  await beginRun($, id)
  const now = await $.clock.now()
  let isNoted = false
  await updateRuns($, list =>
    list.map(r => {
      if (r.id !== id || !isOpen(r)) return r
      isNoted = true
      return { ...withPlan(r, plan(r.plan)), touchedAt: now }
    }),
  )
  return isNoted
}

// The todo tools a worker may use of its own accord: their list is its plan
// when it declared none. TaskCreate and TaskUpdate change one item at a
// time, so each worker's items are kept in the state, by the id the engine
// gave, through a reload: the next call names only the item it changes.
export const TODO_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate'])
const TASK_LISTS_KEEP = RUNS_KEEP
const TASK_ITEMS_KEEP = 100

type TaskItem = TaskList['items'][number]

// `item` in place of the one with its key, else after the rest.
const withItem = (items: readonly TaskItem[], item: TaskItem): TaskItem[] =>
  items.some(x => x.key === item.key) ? items.map(x => (x.key === item.key ? item : x)) : [...items, item].slice(-TASK_ITEMS_KEEP)

// A worker's TaskCreate items after a TaskCreate or TaskUpdate call, or
// undefined for a TaskCreate the engine gave no id.
function changedItems(items: readonly TaskItem[], call: Record<string, unknown>, result: unknown): TaskItem[] | undefined {
  if (call.tool === 'TaskCreate') {
    const task = (result as { task?: { id?: unknown } } | undefined)?.task
    if (task?.id === undefined) return undefined
    return withItem(items, { key: String(task.id), status: 'pending', text: firstText(call.activeForm, call.subject) })
  }
  const key = String(call.taskId)
  if (call.status === 'deleted') return items.filter(x => x.key !== key)
  const was = items.find(x => x.key === key)
  return withItem(items, {
    key,
    status: typeof call.status === 'string' ? call.status : (was?.status ?? 'pending'),
    text: firstText(call.activeForm, call.subject, was?.text),
  })
}

/** Reads a worker's plan off its todo list, when it declared none with the progress tool. */
export async function noteTodos($: Engine, id: string, call: Record<string, unknown>, result: unknown) {
  let todos: Todo[]
  if (call.tool === 'TodoWrite') {
    if (!Array.isArray(call.todos)) return
    todos = (call.todos as Record<string, unknown>[]).map(todo => ({ status: String(todo.status), text: firstText(todo.activeForm, todo.content) }))
  } else {
    // Worked out inside the write: two calls of one response may run at once.
    let items: TaskItem[] | undefined
    await updateTaskLists($, lists => {
      items = changedItems(lists.find(l => l.id === id)?.items ?? [], call, result)
      return items === undefined ? lists : appendKept(lists, [{ id, items }], TASK_LISTS_KEEP, l => l.id)
    })
    if (items === undefined) return
    todos = items.map(({ status, text }) => ({ status, text }))
  }
  await setPlan($, id, prev => todoPlan(prev, todos))
}

/**
 * The last open run to end closes the round; its summary waits for the tick.
 * The user hears of the end at once in a toast, wherever they look, and the
 * conversation keeps one line of it: the end bubble of a worker whose report
 * comes to the main conversation, or else a line the tick places, as that
 * bubble lands in another worker's conversation. A run a new task settles
 * (`isLate`) ended unseen a while ago, at its last sign of life, and has
 * neither.
 */
export async function endRun($: Engine, id: string, end: RunEndKind, isLate = false) {
  // The run ends with every call it made, and its last sign of life.
  await writeCalls($)
  const run = (await readRuns($)).find(r => r.id === id && isOpen(r))
  if (run === undefined) return
  const now = await $.clock.now()
  const at = isLate ? Math.min(now, run.touchedAt) : now
  setKept(progress.ranFor, id, at - run.startedAt, RUNS_KEEP)
  const list = await updateRuns($, runs => closeRun(runs, id, end, at))
  if (!list.some(isOpen)) await updateRound($, r => (r.startedAt === 0 || r.closedAt !== 0 ? r : { ...r, closedAt: at }))
  const worker = (await readWorkers($)).find(x => x.id === id)
  if (isLate || worker === undefined) return
  const plan = list.find(r => r.id === id)?.plan
  const line: CheckLine = {
    id,
    name: worker.name,
    phase: run.phase,
    end,
    ms: now - run.startedAt,
    doing: (await readJobs($)).find(j => j.id === id)?.title ?? worker.task,
    tools: run.tools,
    ...(plan === undefined ? {} : { plan }),
  }
  $.ui.toast(endNotice({ ...line, end }), { timeoutMs: END_TOAST_MS })
  if (await reportsElsewhere($, id)) await queueLine($, { kind: 'end', lines: [line] })
}

// A line the tick places once the main session's turn is over.
async function queueLine($: Engine, row: PendingRow) {
  await updatePendingRows($, list => appendKept(list, [row], CHECKINS_KEEP))
}

/**
 * A message between agents lands in a conversation the user does not read:
 * the main one keeps a line of it.
 */
export async function noteMessage($: Engine, note: Note) {
  await queueLine($, { kind: 'message', lines: [], note })
}

// Whether a worker's report goes to another worker, not to the main
// conversation: one another worker started, which is also the only kind a
// worker's message wakes working for it. The main conversation then has no
// end bubble of it.
async function reportsElsewhere($: Engine, id: string): Promise<boolean> {
  return (await readParents($)).some(p => p.id === id)
}

// Who a line of a placed row names, as the crew has it now.
async function crewLookup($: Engine) {
  const list = await readWorkers($)
  const members = await readMembers($)
  const given = await readJobs($)
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
const linesSaid = (lines: readonly CheckLine[]): string =>
  JSON.stringify(lines.map(x => [x.id, x.name, x.phase, x.end, x.doing, x.plan?.step, x.plan?.total]))

/**
 * The round's newest check-in follows the round in place: its lines are read
 * again from the runs, so it never gives an older step or phase than the
 * pane and the status line. Written when what it says changes, and its
 * times once a minute; the rows before it keep what they showed.
 */
async function followCheckIn($: Engine, round: Round, now: number) {
  if (round.startedAt === 0) return
  const newest = (await readCheckins($)).findLast(c => c.kind === 'checkin' || c.kind === 'summary')
  if (newest === undefined || newest.kind !== 'checkin' || newest.at < round.startedAt) return
  const lines = checkLines(round, await readRuns($), await crewLookup($), now)
  const was = newest.shown ?? newest
  if (linesSaid(lines) === linesSaid(was.lines) && now - was.at < CHECKIN_TIMES_MS) return
  const roundMs = (round.closedAt || now) - round.startedAt
  await updateCheckins($, list => list.map(c => (c.id === newest.id ? { ...c, shown: { at: now, roundMs, lines } } : c)))
}

async function placeSummary($: Engine, round: Round) {
  const now = await $.clock.now()
  const lines = checkLines(round, await readRuns($), await crewLookup($), now)
  await placeRow($, { id: rowId(now), kind: 'summary', at: now, roundMs: round.closedAt - round.startedAt, every: everyMin(), isAsked: false, lines })
}

function showStatus($: Engine, text: string) {
  if (text === progress.statusShown) return
  progress.statusShown = text
  $.ui.status(text === '' ? undefined : text)
}

// Ends the runs whose end was missed, pins the status line, and places the
// lines of ends that wait and a check-in or a round's summary when one is
// due, while the main session's turn is not under way.
async function progressTick($: Engine) {
  if (progress.isTicking) return
  progress.isTicking = true
  try {
    const now = await $.clock.now()
    const list = await readWorkers($)
    for (const run of await readRuns($)) {
      if (!isOpen(run) || now - run.touchedAt < MISSED_MS) continue
      const worker = list.find(x => x.id === run.id)
      if (worker !== undefined && ACTIVE.has(worker.status)) continue
      await endRun($, run.id, endOf(worker?.status))
    }
    const all = await readRuns($)
    const given = await readJobs($)
    const statusOf = (id: string): string => list.find(w => w.id === id)?.status ?? 'done'
    const entries = all
      .filter(isOpen)
      .sort((a, b) => a.startedAt - b.startedAt)
      .map(run => ({
        name: list.find(w => w.id === run.id)?.name ?? run.id,
        phase: shownPhase(run, statusOf(run.id)),
        ms: runMs(run, now),
        title: given.find(j => j.id === run.id)?.title ?? list.find(w => w.id === run.id)?.task ?? '',
        ...(run.plan === undefined ? {} : { plan: run.plan }),
      }))
    // The workers of the crew whose run just ended, in the order they did.
    const ended = all
      .filter(hasEnded)
      .filter(r => isJustEnded(r, now) && list.some(w => w.id === r.id))
      .sort((a, b) => a.endedAt - b.endedAt)
      .map(r => ({ name: list.find(w => w.id === r.id)!.name, end: r.end }))
    showStatus($, statusText(entries, Math.max(STATUS_MIN_COLUMNS, (progress.rowColumns || progress.commandColumns) - 2), ended))
    // A row that stands is drawn again, so it follows even while the main turn runs.
    await followCheckIn($, await readRound($), now)

    if (isMainBusy(await readOrch($))) return
    // The lines that wait, before any summary of their round; read first,
    // since a tick that finds none writes nothing.
    let waiting: PendingRow[] = []
    if ((await readPendingRows($)).length > 0) {
      await updatePendingRows($, queued => {
        waiting = [...queued]
        return []
      })
    }
    for (const row of waiting) await placeRow($, { id: rowId(now), at: now, roundMs: 0, every: everyMin(), isAsked: false, ...row })

    const round = await readRound($)
    if (round.startedAt === 0) return
    const every = everyMin() * 60_000
    if (round.closedAt !== 0) {
      if (wantsSummary(round, every)) await placeSummary($, round)
      await updateRound($, () => NO_ROUND)
      return
    }
    if (every === 0 || now < round.lastAt + every) return
    if (hasNews(round.seen, seenOf(round, all, statusOf))) await placeCheckIn($, false)
    else await updateRound($, x => ({ ...x, lastAt: now }))
  } finally {
    progress.isTicking = false
  }
}

/** The check-in cadence the store keeps, and the tick that keeps it and the status line. */
export async function startProgress($: Engine) {
  progress.everyMin = parseEvery(String(await $.store.get(STORE_KEYS.progress))) ?? DEFAULT_EVERY
  $.clock.every(PROGRESS_MS, () => void quiet($, progressTick($), 'progress tick'))
}

/** Sets the minutes between check-ins, 0 for none, and keeps them in the store. */
export async function setEvery($: Engine, minutes: number) {
  progress.everyMin = minutes
  await $.store.set(STORE_KEYS.progress, minutes)
}
