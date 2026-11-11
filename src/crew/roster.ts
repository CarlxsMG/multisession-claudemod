// The roster tool's answer: what the crew is doing, gathered for the rows
// src/prompts/roster.ts writes.
import type { Worker } from '../../types'
import { REPORTS_KEEP, ROSTER_FULL_REPORT_CUT, ROSTER_REPORTS, ROSTER_ROWS } from '../config'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { isOpen } from '../progress/runs'
import { noWorker } from '../prompts/results'
import { FULL_ROW_CUT, emptyCrew, rosterList, rosterRow, rowCut } from '../prompts/roster'
import type { RowFacts } from '../prompts/roster'
import { readDropped, readLook, readParents, readReports, readRuns, readTakeovers, readWorkers, readWorktrees, updateReports } from '../state/atoms'
import { appendKept } from '../util/bounded'
import { lines } from '../util/text'
import { syncAgents, syncCrew } from './sync'
import { ACTIVE, byActivity, findWorker } from './workers'

/**
 * Keeps a worker's report whole, with its line breaks, among the latest
 * `REPORTS_KEEP`: after a compaction of the main conversation the roster is
 * where the orchestrator reads it again, without waking the worker. A run
 * that ended with nothing said leaves none of an earlier run's.
 */
export async function keepReport($: Engine, id: string, answer: string) {
  const text = lines(answer, ROSTER_FULL_REPORT_CUT)
  await updateReports($, list => (text === '' ? list.filter(r => r.id !== id) : appendKept(list, [{ id, text }], REPORTS_KEEP, r => r.id)))
}

/**
 * Active workers in full; the rest a line each, the latest few with a cut of
 * their report. Asked by a worker, it sends no held task: from that worker's
 * turn, the send would wake the task's worker working for it.
 */
export async function rosterText($: Engine, key?: string, isMain = true): Promise<string> {
  await quiet($, isMain ? syncCrew($) : syncAgents($), 'roster sync')
  const list = await readWorkers($)
  const look = await readLook($)
  const isOne = key !== undefined && key.trim() !== ''
  // One the list let go is still the crew's: asked for by name, it is shown
  // from the shelf, where it stays until something wakes it.
  const one = isOne ? (findWorker(list, key) ?? findWorker(await readDropped($), key)) : undefined
  if (list.length === 0 && one === undefined) return emptyCrew(look.name)
  const inWorktree = new Set(await readWorktrees($))
  const parents = new Map((await readParents($)).map(p => [p.id, p]))
  const woken = new Map((await readTakeovers($)).map(t => [t.id, t]))
  // The one part of progress a model reads: an active worker's step, so the
  // orchestrator can say how it goes without waking anyone.
  const plans = new Map((await readRuns($)).flatMap(r => (isOpen(r) && r.plan !== undefined ? [[r.id, r.plan] as const] : [])))
  const now = await $.clock.now()
  const factsOf = ({ id, status }: Worker): RowFacts => ({
    isActive: ACTIVE.has(status),
    takeover: woken.get(id),
    parent: parents.get(id),
    isInWorktree: inWorktree.has(id),
    plan: plans.get(id),
    now,
  })
  // One worker in full, with its last report whole when it is among the
  // latest kept, else the line the worker keeps of it.
  if (isOne) {
    if (one === undefined)
      return noWorker(
        key,
        list.map(x => x.address),
      )
    const report = (await readReports($)).find(r => r.id === one.id)?.text
    return rosterRow(one, { ...factsOf(one), ...(report === undefined ? {} : { report }) }, FULL_ROW_CUT)
  }
  const sorted = [...list].sort(byActivity)
  const reported = new Set(
    sorted
      .filter(w => !ACTIVE.has(w.status) && w.answer)
      .slice(0, ROSTER_REPORTS)
      .map(w => w.id),
  )
  const rows = sorted.slice(0, ROSTER_ROWS).map(w => rosterRow(w, factsOf(w), rowCut(ACTIVE.has(w.status), reported.has(w.id))))
  return rosterList(look.name, list.length, rows)
}
