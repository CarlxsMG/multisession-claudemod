// The background tasks the session's agents leave running, with the engine:
// recorded as their calls are answered, forgotten when the engine no longer
// runs them, and stopped once their worker is done, at the end of the
// session, or when the person presses Stop in the pane. Each is matched to
// its process, whose id the pane shows; on Windows, what a stopped shell
// started and left running is ended after it.
import type { HookFor, ToolCallResult } from 'claude-code'

import type { BackgroundTask } from '../../types'
import { quiet, unrecognized } from '../engine'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { readBackground, updateBackground } from '../state/atoms'
import { oneLine } from '../util/text'
import { isTaskRunning, orphansToKill, parsePs, parseSnapshot, rootOf } from './orphans'
import type { Proc } from './orphans'
import { addTask, dropTask, isDueForStop, isGone, keepLive, markStopFailed, ownerEnded, ownerResumed, stoppedId, taskOfCall } from './tasks'

// How much of a command a toast names.
const TOAST_COMMAND = 40
// The process table, as the orphans of a stopped shell are looked for in it.
const SNAPSHOT = [
  'powershell',
  '-NoProfile',
  '-Command',
  'Get-CimInstance Win32_Process | Select ProcessId,ParentProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress',
]
const SNAPSHOT_TIMEOUT_MS = 8000
const KILL_TIMEOUT_MS = 5000
// The waits before each look for what a stopped shell left running, after
// TaskStop answered: the engine ends the shell and what it holds over a few
// seconds, and a process whose shell still lives is no orphan yet.
const REAP_WAITS_MS = [1000, 2000, 5000]
// The process table elsewhere, its dates in English.
const PS = ['ps', '-A', '-o', 'pid=,ppid=,lstart=,args=']
// How long after a task is recorded its process is looked for: the shell
// has started it by then.
const PID_AFTER_MS = 1500

/** A recorded task a TaskStop is about to stop, with the process table read just before (none when it could not be). */
export type Stopping = { task: BackgroundTask; before: readonly Proc[] | undefined }

/**
 * What a TaskStop call that is not the crew's own is about to stop, before
 * the engine runs it: on Windows, a recorded task and the process table, so
 * what its shell leaves can be ended after it. Undefined elsewhere, and for
 * a task the crew did not record.
 */
export async function beforeTaskStop($: Engine, input: unknown): Promise<Stopping | undefined> {
  const id = stoppedId(input)
  const task = (await readBackground($)).find(x => x.id === id)
  if (task === undefined || !(await isWindows($))) return undefined
  const table = await readTable($)
  return { task, before: 'procs' in table ? table.procs : undefined }
}

/**
 * Records what a call of `BACKGROUND_TOOLS` did, once the engine answered
 * it: a shell or a Monitor it left running, or a task a TaskStop ended,
 * after which what its shell left running is ended (`stopping`, from
 * `beforeTaskStop`).
 */
export async function noteBackground($: Engine, tool: string, input: unknown, agentId: string | undefined, done: ToolCallResult, stopping?: Stopping) {
  if (done.deny !== undefined || done.isError === true) return
  if (tool === 'TaskStop') {
    const id = stoppedId(input)
    if (id !== '' && (await readBackground($)).some(x => x.id === id)) await updateBackground($, list => dropTask(list, id))
    if (stopping !== undefined && stopping.task.id === id) void quiet($, reapOrphans($, stopping.task, stopping.before), 'orphan reap')
    return
  }
  const task = taskOfCall(tool, input, done.result, agentId, await $.clock.now())
  if (task === undefined) return
  await updateBackground($, list => addTask(list, task))
  void quiet($, findPid($, task), 'background pid')
}

// The process table on any system, or undefined when it cannot be read.
async function anySnapshot($: Engine): Promise<Proc[] | undefined> {
  if (await isWindows($)) return snapshot($)
  const ran = await quiet($, $.process.run(PS, { timeoutMs: SNAPSHOT_TIMEOUT_MS, env: { LC_ALL: 'C' } }), 'process snapshot')
  if (ran === undefined || ran.exitCode !== 0) return undefined
  const procs = parsePs(ran.stdout)
  return procs.length > 0 ? procs : undefined
}

// Puts on `task`'s entry the id of its root process (`rootOf`), a moment
// after it was recorded, while it is still listed and has none.
async function findPid($: Engine, task: BackgroundTask) {
  await $.clock.sleep(PID_AFTER_MS)
  if (!(await readBackground($)).some(x => x.id === task.id && x.pid === undefined)) return
  const procs = await anySnapshot($)
  if (procs === undefined) return
  const list = await readBackground($)
  const taken = list.flatMap(x => (x.pid !== undefined ? [x.pid] : []))
  const pid = rootOf(procs, task.command, task.startedAt, taken)
  if (pid !== undefined) await updateBackground($, all => all.map(x => (x.id === task.id && x.pid === undefined ? { ...x, pid } : x)))
}

/** Marks the tasks of `agentId` as left by its turn, which just ended. */
export async function backgroundTurnEnded($: Engine, agentId: string) {
  if (!(await readBackground($)).some(x => x.agentId === agentId)) return
  const now = await $.clock.now()
  await updateBackground($, list => ownerEnded(list, agentId, now))
}

/** Marks the tasks of `agentId` as its own again: its turn started. */
export async function backgroundTurnStarted($: Engine, agentId: string) {
  if (!(await readBackground($)).some(x => x.agentId === agentId && x.ownerDoneAt !== undefined)) return
  await updateBackground($, list => ownerResumed(list, agentId))
}

// Keeps the registry to what the engine still runs, from the list of work in
// flight a Stop or SubagentStop carries; an engine that sends none leaves it.
async function pruneTo($: Engine, live: readonly { id: string }[] | undefined) {
  if (!Array.isArray(live)) return
  const list = await readBackground($)
  if (list.length === 0) return
  const now = await $.clock.now()
  const kept = keepLive(
    list,
    live.map(x => x.id),
    now,
  )
  if (kept.length !== list.length) await updateBackground($, () => kept)
}

type OnStopHook = HookFor<'classic.Stop'>
/** Forgets the tasks the engine no longer runs, when the main conversation's turn stops. */
export async function onStop($: Engine, e: Parameters<OnStopHook>[1], next: Parameters<OnStopHook>[2]) {
  await quiet($, pruneTo($, e.background_tasks), 'background prune')
  return next(e)
}

type OnSubagentStopHook = HookFor<'classic.SubagentStop'>
/** Forgets the tasks the engine no longer runs, when an agent's turn stops. */
export async function onSubagentStop($: Engine, e: Parameters<OnSubagentStopHook>[1], next: Parameters<OnSubagentStopHook>[2]) {
  await quiet($, pruneTo($, e.background_tasks), 'background prune')
  return next(e)
}

// Windows alone: elsewhere ending a shell ends what it started.
async function isWindows($: Engine): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
}

// The Windows process table now, or why it could not be read.
async function readTable($: Engine): Promise<{ procs: Proc[] } | { error: string }> {
  try {
    const ran = await $.process.run(SNAPSHOT, { timeoutMs: SNAPSHOT_TIMEOUT_MS })
    if (ran.exitCode !== 0) return { error: `exit ${ran.exitCode}: ${oneLine(ran.stderr, 80)}` }
    const procs = parseSnapshot(ran.stdout)
    return procs.length > 0 ? { procs } : { error: `no processes in: ${oneLine(ran.stdout, 80)}` }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// The process table now, or undefined when it cannot be read.
async function snapshot($: Engine): Promise<Proc[] | undefined> {
  const table = await readTable($)
  return 'procs' in table ? table.procs : undefined
}

// Ends, with their trees, the processes `task`'s stopped shell left running
// (`orphansToKill`), looking again a few times (`REAP_WAITS_MS`) while any of
// the task's processes still runs, against the table as it was before the
// stop when it was read. What ends is logged; what does not, and a table
// never read, said in a toast.
async function reapOrphans($: Engine, task: BackgroundTask, before: readonly Proc[] | undefined) {
  const what = oneLine(task.command, TOAST_COMMAND) || task.id
  const ended: number[] = []
  const missed: number[] = []
  let unread: string | undefined
  for (const wait of REAP_WAITS_MS) {
    await $.clock.sleep(wait)
    const table = await readTable($)
    if ('error' in table) {
      unread = table.error
      continue
    }
    unread = undefined
    const after = table.procs
    for (const pid of orphansToKill(before ?? [], after, task.command, task.startedAt)) {
      if (ended.includes(pid) || missed.includes(pid)) continue
      const ran = await quiet($, $.process.run(['taskkill', '/PID', String(pid), '/T', '/F'], { timeoutMs: KILL_TIMEOUT_MS }), 'taskkill')
      if (ran !== undefined && ran.exitCode === 0) ended.push(pid)
      else missed.push(pid)
    }
    if (!isTaskRunning(before ?? [], after, task.command, task.startedAt, [...ended, ...missed])) break
  }
  if (ended.length > 0) $.ui.log(`crew: ended what background task ${task.id} left running: ${ended.join(', ')}`, { to: 'debug' })
  if (missed.length > 0) $.ui.toast(t().background.orphansLeft(what, missed.join(', ')))
  if (unread !== undefined) $.ui.toast(t().background.tableUnread(what, unread))
}

/**
 * How a stop is asked for: by the crew on its own (`auto`), which asks the
 * person nothing and keeps a task it may not stop for the person; by the
 * person's press (`press`), which may ask them; or as the session ends
 * (`end`), quietly.
 */
export type StopHow = 'auto' | 'press' | 'end'

/**
 * Stops `task` with a TaskStop call: forgets it once stopped or found over.
 * A stop that fails or is refused keeps it, says so in a toast, and, when
 * the crew tried on its own, is not tried again on its own. On Windows,
 * but at the session's end, what the stopped shell left running is ended
 * after it, without holding up the caller.
 */
export async function stopTask($: Engine, task: BackgroundTask, how: StopHow) {
  const failed = async (reason: string) => {
    if (how === 'end') return
    if (how === 'auto') {
      const now = await $.clock.now()
      await updateBackground($, list => markStopFailed(list, task.id, now))
    }
    $.ui.toast(t().background.stopFailed(oneLine(task.command, TOAST_COMMAND) || task.id, reason))
  }
  try {
    if (how !== 'press') {
      // Nothing the person did not ask for opens a dialog: a stop the rules
      // do not let through without asking waits for their press.
      const verdict = await $.tool.check({ tool: 'TaskStop', input: { task_id: task.id } })
      if (verdict.decision !== 'allow') return await failed(verdict.reason ?? t().background.refused)
    }
    const isReaped = how !== 'end' && (await isWindows($))
    const before = isReaped ? await snapshot($) : undefined
    const done = await $.tool.call({ tool: 'TaskStop', task_id: task.id })
    if (done.deny !== undefined) return await failed(done.deny)
    if (done.isError === true && !isGone(done.text ?? '')) {
      unrecognized($, 'TaskStop error', done.text ?? '')
      return await failed(oneLine(done.text ?? '', 80))
    }
    await updateBackground($, list => dropTask(list, task.id))
    if (isReaped) void quiet($, reapOrphans($, task, before), 'orphan reap')
  } catch (err) {
    await failed(err instanceof Error ? err.message : String(err))
  }
}

/** Stops each task whose worker is done (`isDueForStop`): for the progress tick. */
export async function sweepBackground($: Engine, now: number) {
  for (const task of (await readBackground($)).filter(x => isDueForStop(x, now))) await stopTask($, task, 'auto')
}

type OnSessionEndHook = HookFor<'session.end'>
/** Stops every task an agent left running as the session ends; the main conversation's stay. */
export async function onSessionEnd($: Engine, e: Parameters<OnSessionEndHook>[1], next: Parameters<OnSessionEndHook>[2]) {
  const left = (await quiet($, readBackground($), 'background read')) ?? []
  await Promise.all(left.filter(x => x.agentId !== undefined).map(x => stopTask($, x, 'end')))
  return next(e)
}
