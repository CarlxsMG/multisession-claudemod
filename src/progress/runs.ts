// A worker's runs, one to a task: opened as it starts, counted call by call,
// closed with how it ended, and how long each took.
import type { Phase, Run, RunEndKind, WorkerStatus } from '../../types'
import { appendKept } from '../util/bounded'
import { samePath } from '../util/path'
import { nextPhase } from './phase'
import { finishPlan } from './plan'

/** Whether a run is still going. */
export const isOpen = (r: Pick<Run, 'endedAt'>): boolean => r.endedAt === 0

/** Whether a run has ended, so its `end` says how. */
export const hasEnded = (run: Run): run is Run & { end: RunEndKind } => run.end !== ''

/**
 * How a run ends, going by its worker's status: a worker that failed or was
 * stopped says so; any other status, or no worker at all, is a run that finished.
 */
export const endOf = (status: WorkerStatus | undefined): RunEndKind => (status === 'failed' || status === 'stopped' ? status : 'done')

/** A run for `id` from `now`, unless one is open already. */
export function openRun(list: readonly Run[], id: string, now: number): Run[] {
  if (list.some(r => r.id === id && isOpen(r))) return [...list]
  const run: Run = { id, startedAt: now, endedAt: 0, end: '', tools: 0, phase: 'thinking', phaseAt: now, touchedAt: now }
  return [...list.filter(r => r.id !== id), run]
}

/**
 * One more call of an open run, and the phase it leaves. A call written
 * after a later sign of life, a plan's step, keeps that one as the last.
 */
export function countCall(list: readonly Run[], id: string, kind: Phase | undefined, now: number): Run[] {
  return list.map(r => (r.id === id && isOpen(r) ? { ...r, tools: r.tools + 1, touchedAt: Math.max(r.touchedAt, now), ...nextPhase(r, kind, now) } : r))
}

/** How many files a run keeps as edited, the latest. */
export const EDITS_KEEP = 40

/**
 * An open run with `paths` among the files it edited: one it has already
 * stays where it was, so the list is in the order each was first edited.
 */
export function addEdits(list: readonly Run[], id: string, paths: readonly string[]): Run[] {
  return list.map(r => {
    if (r.id !== id || !isOpen(r)) return r
    const known = r.edited ?? []
    const fresh = paths.filter((path, i) => !known.some(k => samePath(k, path)) && paths.findIndex(p => samePath(p, path)) === i)
    return fresh.length === 0 ? r : { ...r, edited: appendKept(known, fresh, EDITS_KEEP) }
  })
}

/**
 * A run that ends done has done its plan, whether or not the worker said so
 * step by step; one that failed or was stopped keeps the step it stopped on.
 */
export function closeRun(list: readonly Run[], id: string, end: RunEndKind, now: number): Run[] {
  return list.map(r => {
    if (r.id !== id || !isOpen(r)) return r
    const closed: Run = { ...r, endedAt: now, end }
    return end === 'done' && closed.plan !== undefined ? { ...closed, plan: finishPlan(closed.plan) } : closed
  })
}

/** How long a run has run, or ran. */
export const runMs = (r: Pick<Run, 'startedAt' | 'endedAt'>, now: number): number => Math.max(0, (isOpen(r) ? now : r.endedAt) - r.startedAt)

/**
 * How long a run's end stands out: the card's word for it, the figure's
 * cheer and its mark on the status line.
 */
export const JUST_ENDED_MS = 30_000

/** Whether a run ended a moment ago, so its end still stands out. */
export const isJustEnded = (r: Pick<Run, 'endedAt' | 'end'>, now: number): boolean => !isOpen(r) && r.end !== '' && now - r.endedAt < JUST_ENDED_MS
