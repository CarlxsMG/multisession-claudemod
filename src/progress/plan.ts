// The plan a worker declares with the progress tool, or reads from its todo
// list: the step it is on, how much is done and what the rest may take. Of
// the crew's progress a model reads only the progress tool's reply
// (src/prompts/results.ts) and, in the roster, an active worker's step.
import type { Plan, Run } from '../../types'
import { t } from '../i18n'
import { flat } from '../util/text'
import { shortTime } from '../util/time'

/** The plan with every step done. */
export const finishPlan = (p: Plan): Plan => ({ ...p, step: p.total, done: p.total })

/**
 * The plan a progress call declares. Step 0 declares it; starting a step
 * means the ones before it are done. A step past the total stretches it.
 */
export function declarePlan(prev: Plan | undefined, step: number, total: number, doing: string): Plan {
  const s = Math.max(0, Math.floor(step))
  const t = Math.max(1, Math.floor(total), s)
  return { step: s, total: t, done: Math.max(0, s - 1), first: prev?.from === 'tool' ? prev.first : t, doing: flat(doing), from: 'tool' }
}

/**
 * A todo list's item, as TodoWrite or TaskCreate and TaskUpdate keep it:
 * `text` what the item is doing while in progress.
 */
export type Todo = { status: string; text: string }

/**
 * A todo list read as a plan, for a worker that declared none: the items
 * completed are done, and the one in progress is the step it is on. A plan
 * from the progress tool always wins; an empty list is no plan.
 */
export function todoPlan(prev: Plan | undefined, todos: readonly Todo[]): Plan | undefined {
  if (prev?.from === 'tool') return prev
  const list = todos.filter(t => t.status !== 'deleted')
  if (list.length === 0) return undefined
  const done = list.filter(t => t.status === 'completed').length
  const current = list.find(t => t.status === 'in_progress')
  return {
    step: Math.min(list.length, done + (current === undefined ? 0 : 1)),
    total: list.length,
    done,
    first: prev?.from === 'todos' ? prev.first : list.length,
    doing: flat(current?.text ?? ''),
    from: 'todos',
  }
}

/** A run with its plan, or with none. */
export const withPlan = (run: Run, plan: Plan | undefined): Run => {
  const { plan: _, ...rest } = run
  return plan === undefined ? rest : { ...rest, plan }
}

/** A step of its total: `3/5`. */
export const stepText = (p: Pick<Plan, 'step' | 'total'>): string => `${p.step}/${p.total}`

/** Whether the plan has more steps than it first gave. */
export const hasGrown = (p: Pick<Plan, 'total' | 'first'>): boolean => p.total > p.first

/**
 * The share of the steps done, never of the time: a cell a step up to ten,
 * then each cell a tenth.
 */
export function stepBar(p: Pick<Plan, 'done' | 'total'>): string {
  const cells = Math.min(p.total, 10)
  const full = Math.min(cells, Math.round((p.done / p.total) * cells))
  return '█'.repeat(full) + '░'.repeat(cells - full)
}

/** The share of the steps done, in words. */
export const stepShare = (p: Pick<Plan, 'done' | 'total'>): string => t().progress.share(Math.round((p.done / p.total) * 100))

/**
 * What the steps left would take at the pace of those done: nothing until a
 * step is done, and always marked as the guess it is.
 */
export function stepsLeft(p: Pick<Plan, 'done' | 'total'>, ms: number): string | undefined {
  if (p.done < 1 || p.done >= p.total) return undefined
  return t().progress.left(shortTime((ms / p.done) * (p.total - p.done)))
}
