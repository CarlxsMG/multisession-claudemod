// The crew's state: the session's atoms, and the keys of what the store
// keeps for the user. Both outlive a reload and an update of the plugin, and
// `types/index.d.ts` declares each state key, so no key changes; a value
// whose fields change takes a new shape tag instead.
import { atom, read, update } from 'claude-code'
import type { Atom, StateDollar } from 'claude-code'

import { DEFAULT_LOOK } from '../figure/look'
import { NO_ROUND } from '../progress/round'

/**
 * The keys of what the store keeps for the user across sessions and
 * versions of the plugin: what an earlier version stored is read under the
 * same key, so a key never changes.
 */
export const STORE_KEYS = { look: 'look', isOn: 'isOn', lines: 'lines', toldBy: 'toldBy', progress: 'progress' } as const

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload. A variable says what its atom
// holds; its key, the name the state stored it under, stays as it was
// (`pendingNote` is `note`, `members` is `cast`, `pendingRows` is `due`,
// `paneTick` is `beat`).
const look = atom({ plugin: 'crew', key: 'look' } as const, DEFAULT_LOOK, { shape: 'look-3' })
const workers = atom({ plugin: 'crew', key: 'workers' } as const, [], { shape: 'workers-2' })
// Workers the user cleared or the list let go, kept whole: the engine still
// lists them a while, and one that wakes comes back with its history.
const dropped = atom({ plugin: 'crew', key: 'dropped' } as const, [], { shape: 'dropped-1' })
// The workers that work in a git worktree of their own, by id.
const worktrees = atom({ plugin: 'crew', key: 'worktrees' } as const, [], { shape: 'worktrees-1' })
// The agents another worker started, with that worker's name.
const parents = atom({ plugin: 'crew', key: 'parents' } as const, [], { shape: 'parents-1' })
const messages = atom({ plugin: 'crew', key: 'messages' } as const, [], { shape: 'messages-2' })
const orch = atom({ plugin: 'crew', key: 'orch' } as const, { mood: 'idle', activity: '', since: 0 }, { shape: 'orch-1' })
const view = atom({ plugin: 'crew', key: 'view' } as const, 'main')
const editTab = atom({ plugin: 'crew', key: 'tab' } as const, 'persona')
const moodLines = atom({ plugin: 'crew', key: 'lines' } as const, { sig: '', moods: {} }, { shape: 'lines-1' })
const isOn = atom({ plugin: 'crew', key: 'isOn' } as const, true)
// The orchestrator's brief as this load froze it, and the settings the
// user's next message carries a "[crew]" note of (null for none).
const brief = atom({ plugin: 'crew', key: 'brief' } as const, '', { shape: 'brief-1' })
const pendingNote = atom({ plugin: 'crew', key: 'note' } as const, null, { shape: 'note-2' })
const limits = atom({ plugin: 'crew', key: 'limits' } as const, [], { shape: 'limits-1' })
const modelLimits = atom({ plugin: 'crew', key: 'modelLimits' } as const, [], { shape: 'limits-1' })
// What the conversation's crew rows are drawn from. Each changes seldom, as
// every row that reads one is drawn again when it does: everyone the crew
// has had, the calls of the crew's tools, where workers' messages went.
const members = atom({ plugin: 'crew', key: 'cast' } as const, [], { shape: 'cast-1' })
const calls = atom({ plugin: 'crew', key: 'calls' } as const, [], { shape: 'calls-1' })
const routes = atom({ plugin: 'crew', key: 'routes' } as const, [], { shape: 'routes-1' })
// Agents the worker that started them woke with a message, whose run
// reports there, and the tasks that wait for them meanwhile.
const takeovers = atom({ plugin: 'crew', key: 'takeovers' } as const, [], { shape: 'takeovers-1' })
// Workers' messages to a free teammate, which the next tick sends on from
// the main conversation.
const relays = atom({ plugin: 'crew', key: 'relays' } as const, [], { shape: 'relays-1' })
// What each worker was last given to do, which the line of its end names.
const jobs = atom({ plugin: 'crew', key: 'jobs' } as const, [], { shape: 'jobs-1' })
// The crew rows of the conversation a press opened whole, by request id.
const opened = atom({ plugin: 'crew', key: 'opened' } as const, [], { shape: 'opened-1' })
// The main session's model as the engine names it, which the pane's top line
// shows ('' until read).
const mainModel = atom({ plugin: 'crew', key: 'model' } as const, '', { shape: 'model-1' })
// Each worker's current or latest run, the round the runs make up, and the
// rows placed in the conversation about them. Only the pane's team view and
// the placed rows read these: none of it reaches a model.
const runs = atom({ plugin: 'crew', key: 'runs' } as const, [], { shape: 'runs-1' })
const round = atom({ plugin: 'crew', key: 'round' } as const, NO_ROUND, { shape: 'round-1' })
const checkins = atom({ plugin: 'crew', key: 'checkins' } as const, [], { shape: 'checkins-1' })
// The lines that wait for the main session's turn to end, to be placed, in
// the order they came: ends of runs whose report goes to another worker,
// and messages between agents.
const pendingRows = atom({ plugin: 'crew', key: 'due' } as const, [], { shape: 'due-1' })
// Moved on to redraw the pane alone: an invalidate would draw every crew row
// of the conversation again too.
const paneTick = atom({ plugin: 'crew', key: 'beat' } as const, 0)
// The agents the engine has listed, which tells a busy worker it dropped from
// one it has yet to list.
const listed = atom({ plugin: 'crew', key: 'listed' } as const, [], { shape: 'listed-1' })
// What calls under way leave for the hooks that follow them, which a
// reload of the plugin's code may come between: what delegate meant each
// new worker to be, the Agent calls that asked for a worktree, each
// worker's last SendMessage and its TaskCreate items, and what each
// end-of-task row was first drawn with.
const intents = atom({ plugin: 'crew', key: 'intents' } as const, [], { shape: 'intents-1' })
const isolated = atom({ plugin: 'crew', key: 'isolated' } as const, [], { shape: 'isolated-1' })
const sendGists = atom({ plugin: 'crew', key: 'sendGists' } as const, [], { shape: 'sendGists-1' })
const taskLists = atom({ plugin: 'crew', key: 'taskLists' } as const, [], { shape: 'taskLists-1' })
const noteFirst = atom({ plugin: 'crew', key: 'noteFirst' } as const, [], { shape: 'noteFirst-1' })
// The shells and Monitors the session's agents left running in the
// background, which the crew stops once their worker is done.
const background = atom({ plugin: 'crew', key: 'background' } as const, [], { shape: 'background-1' })
// The compaction the orchestrator or the threshold asked for, until a safe
// moment runs it, and when the crew last ran one.
const compaction = atom({ plugin: 'crew', key: 'compactAsk' } as const, { ask: null, lastAt: 0 }, { shape: 'compactAsk-1' })
// The tasks a delegate call asked to give once another worker's run ends,
// and the ones that could not be given, until the orchestrator is told.
const waiting = atom({ plugin: 'crew', key: 'waiting' } as const, [], { shape: 'waiting-1' })

// What an atom holds, as a change to it takes and gives it.
type Change<A> = A extends Atom<infer T> ? (value: T) => T : never

/**
 * Every read and write of an atom goes through these, beside the atoms: the
 * validator finds the state a module touches only where `read` and `update`
 * take an atom declared in that same file.
 */
export function readLook($: StateDollar) {
  return read($, look)
}

export function updateLook($: StateDollar, change: Change<typeof look>) {
  return update($, look, change)
}

export function readWorkers($: StateDollar) {
  return read($, workers)
}

export function updateWorkers($: StateDollar, change: Change<typeof workers>) {
  return update($, workers, change)
}

export function readDropped($: StateDollar) {
  return read($, dropped)
}

export function updateDropped($: StateDollar, change: Change<typeof dropped>) {
  return update($, dropped, change)
}

export function readWorktrees($: StateDollar) {
  return read($, worktrees)
}

export function updateWorktrees($: StateDollar, change: Change<typeof worktrees>) {
  return update($, worktrees, change)
}

export function readParents($: StateDollar) {
  return read($, parents)
}

export function updateParents($: StateDollar, change: Change<typeof parents>) {
  return update($, parents, change)
}

export function readMessages($: StateDollar) {
  return read($, messages)
}

export function updateMessages($: StateDollar, change: Change<typeof messages>) {
  return update($, messages, change)
}

export function readOrch($: StateDollar) {
  return read($, orch)
}

export function updateOrch($: StateDollar, change: Change<typeof orch>) {
  return update($, orch, change)
}

export function readView($: StateDollar) {
  return read($, view)
}

export function updateView($: StateDollar, change: Change<typeof view>) {
  return update($, view, change)
}

export function readEditTab($: StateDollar) {
  return read($, editTab)
}

export function updateEditTab($: StateDollar, change: Change<typeof editTab>) {
  return update($, editTab, change)
}

export function readMoodLines($: StateDollar) {
  return read($, moodLines)
}

export function updateMoodLines($: StateDollar, change: Change<typeof moodLines>) {
  return update($, moodLines, change)
}

export function readIsOn($: StateDollar) {
  return read($, isOn)
}

export function updateIsOn($: StateDollar, change: Change<typeof isOn>) {
  return update($, isOn, change)
}

export function readBrief($: StateDollar) {
  return read($, brief)
}

export function updateBrief($: StateDollar, change: Change<typeof brief>) {
  return update($, brief, change)
}

export function readPendingNote($: StateDollar) {
  return read($, pendingNote)
}

export function updatePendingNote($: StateDollar, change: Change<typeof pendingNote>) {
  return update($, pendingNote, change)
}

export function readLimits($: StateDollar) {
  return read($, limits)
}

export function updateLimits($: StateDollar, change: Change<typeof limits>) {
  return update($, limits, change)
}

export function readModelLimits($: StateDollar) {
  return read($, modelLimits)
}

export function updateModelLimits($: StateDollar, change: Change<typeof modelLimits>) {
  return update($, modelLimits, change)
}

export function readMembers($: StateDollar) {
  return read($, members)
}

export function updateMembers($: StateDollar, change: Change<typeof members>) {
  return update($, members, change)
}

export function readCalls($: StateDollar) {
  return read($, calls)
}

export function updateCalls($: StateDollar, change: Change<typeof calls>) {
  return update($, calls, change)
}

export function readRoutes($: StateDollar) {
  return read($, routes)
}

export function updateRoutes($: StateDollar, change: Change<typeof routes>) {
  return update($, routes, change)
}

export function readTakeovers($: StateDollar) {
  return read($, takeovers)
}

export function updateTakeovers($: StateDollar, change: Change<typeof takeovers>) {
  return update($, takeovers, change)
}

export function updateRelays($: StateDollar, change: Change<typeof relays>) {
  return update($, relays, change)
}

export function readJobs($: StateDollar) {
  return read($, jobs)
}

export function updateJobs($: StateDollar, change: Change<typeof jobs>) {
  return update($, jobs, change)
}

export function readOpened($: StateDollar) {
  return read($, opened)
}

export function updateOpened($: StateDollar, change: Change<typeof opened>) {
  return update($, opened, change)
}

export function readMainModel($: StateDollar) {
  return read($, mainModel)
}

export function updateMainModel($: StateDollar, change: Change<typeof mainModel>) {
  return update($, mainModel, change)
}

export function readRuns($: StateDollar) {
  return read($, runs)
}

export function updateRuns($: StateDollar, change: Change<typeof runs>) {
  return update($, runs, change)
}

export function readRound($: StateDollar) {
  return read($, round)
}

export function updateRound($: StateDollar, change: Change<typeof round>) {
  return update($, round, change)
}

export function readCheckins($: StateDollar) {
  return read($, checkins)
}

export function updateCheckins($: StateDollar, change: Change<typeof checkins>) {
  return update($, checkins, change)
}

export function readPendingRows($: StateDollar) {
  return read($, pendingRows)
}

export function updatePendingRows($: StateDollar, change: Change<typeof pendingRows>) {
  return update($, pendingRows, change)
}

export function readPaneTick($: StateDollar) {
  return read($, paneTick)
}

export function updatePaneTick($: StateDollar, change: Change<typeof paneTick>) {
  return update($, paneTick, change)
}

export function readListed($: StateDollar) {
  return read($, listed)
}

export function updateListed($: StateDollar, change: Change<typeof listed>) {
  return update($, listed, change)
}

export function readIntents($: StateDollar) {
  return read($, intents)
}

export function updateIntents($: StateDollar, change: Change<typeof intents>) {
  return update($, intents, change)
}

export function readIsolated($: StateDollar) {
  return read($, isolated)
}

export function updateIsolated($: StateDollar, change: Change<typeof isolated>) {
  return update($, isolated, change)
}

export function readSendGists($: StateDollar) {
  return read($, sendGists)
}

export function updateSendGists($: StateDollar, change: Change<typeof sendGists>) {
  return update($, sendGists, change)
}

export function readTaskLists($: StateDollar) {
  return read($, taskLists)
}

export function updateTaskLists($: StateDollar, change: Change<typeof taskLists>) {
  return update($, taskLists, change)
}

export function readNoteFirst($: StateDollar) {
  return read($, noteFirst)
}

export function updateNoteFirst($: StateDollar, change: Change<typeof noteFirst>) {
  return update($, noteFirst, change)
}

export function readBackground($: StateDollar) {
  return read($, background)
}

export function updateBackground($: StateDollar, change: Change<typeof background>) {
  return update($, background, change)
}

export function readCompaction($: StateDollar) {
  return read($, compaction)
}

export function updateCompaction($: StateDollar, change: Change<typeof compaction>) {
  return update($, compaction, change)
}

export function readWaiting($: StateDollar) {
  return read($, waiting)
}

export function updateWaiting($: StateDollar, change: Change<typeof waiting>) {
  return update($, waiting, change)
}
