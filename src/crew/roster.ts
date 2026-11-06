// The roster tool's answer: what the crew is doing, gathered for the rows
// src/prompts/roster.ts writes.
import type { Worker } from '../../types'
import { ROSTER_REPORTS, ROSTER_ROWS } from '../config'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { isOpen } from '../progress/runs'
import { noWorker } from '../prompts/results'
import { FULL_ROW_CUT, emptyCrew, rosterList, rosterRow, rowCut } from '../prompts/roster'
import type { RowFacts } from '../prompts/roster'
import { readLook, readParents, readRuns, readTakeovers, readWorkers, readWorktrees } from '../state/atoms'
import { syncAgents, syncCrew } from './sync'
import { ACTIVE, byActivity, findWorker } from './workers'

/**
 * Active workers in full; the rest a line each, the latest few with a cut of
 * their report. Asked by a worker, it sends no held task: from that worker's
 * turn, the send would wake the task's worker working for it.
 */
export async function rosterText($: Engine, key?: string, isMain = true): Promise<string> {
  await quiet($, isMain ? syncCrew($) : syncAgents($), 'roster sync')
  const list = await readWorkers($)
  const look = await readLook($)
  if (list.length === 0) return emptyCrew(look.name)
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
  // One worker in full, with as much of its last report as was kept.
  if (key !== undefined && key.trim() !== '') {
    const worker = findWorker(list, key)
    if (worker === undefined)
      return noWorker(
        key,
        list.map(x => x.address),
      )
    return rosterRow(worker, factsOf(worker), FULL_ROW_CUT)
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
