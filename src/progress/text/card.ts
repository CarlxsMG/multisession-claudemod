// The line under a worker's figure, as wide as its card.
import type { Run, WorkerStatus } from '../../../types'
import { cut } from '../../util/text'
import { cardTime } from '../../util/time'
import { cardLabel } from '../../words'
import { stepText } from '../plan'
import { isOpen, runMs } from '../runs'

/**
 * The line under a worker's name on its card, `width` columns: the step of
 * its plan, else how long its run has gone. A step and total too wide for it
 * keep the step and cut the total (10/…), which the status line and the team
 * view give whole.
 */
export function cardLine(run: Run, now: number, width: number): string {
  const plan = run.plan
  if (plan === undefined) return cut(cardTime(runMs(run, now)), width)
  const whole = stepText(plan)
  if (whole.length <= width) return whole
  const step = `${plan.step}/…`
  return step.length <= width ? step : cut(String(plan.step), width)
}

/**
 * What a worker's card says under its name: a worker at work its step, else
 * its run's time; one starting `init` until it declares a plan, one the
 * engine has waiting `wait`, and the rest the word for how they stand.
 */
export function cardText(status: WorkerStatus, run: Run | undefined, now: number, width: number): string {
  const isRunning = run !== undefined && isOpen(run)
  if (isRunning && (status === 'working' || (status === 'starting' && run.plan !== undefined))) return cardLine(run, now, width)
  return cut(cardLabel(status), width)
}
