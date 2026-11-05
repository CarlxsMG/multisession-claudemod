// A worker's run in the team view.
import type { Run } from '../../../types'
import { t } from '../../i18n'
import { shortTime, took } from '../../util/time'
import { hasGrown, stepBar, stepShare, stepText, stepsLeft } from '../plan'
import { isOpen, runMs } from '../runs'

// A run's line of the team view: its time and calls, or those of the last.
function runSummary(run: Run, now: number): string {
  const calls = t().progress.calls(run.tools)
  return isOpen(run) ? `${shortTime(runMs(run, now))} · ${calls}` : `${t().progress.lastRun(took(runMs(run, now)))} · ${calls}`
}

/**
 * A run's lines of the team view: with a plan, while it runs, its step and
 * phase, the share of the steps done, and what the rest may take.
 *  step 3/5 · editing · 6m
 *  ██░░░ 40 % of the steps
 *  ≈9m more (estimated)
 */
export function teamLines(run: Run, phase: string, now: number): string[] {
  const plan = run.plan
  if (plan === undefined) return [runSummary(run, now)]
  if (!isOpen(run)) return [`${runSummary(run, now)} · ${t().progress.steps(stepText(plan))}`]
  const ms = runMs(run, now)
  const left = stepsLeft(plan, ms)
  return [
    `${t().progress.step(stepText(plan))}${hasGrown(plan) ? ` · ${t().progress.grown}` : ''} · ${phase} · ${shortTime(ms)}`,
    `${stepBar(plan)} ${stepShare(plan)}`,
    ...(left === undefined ? [] : [left]),
  ]
}
