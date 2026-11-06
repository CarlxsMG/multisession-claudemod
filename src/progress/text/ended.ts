// A run that ended, said in one line.
import type { CheckLine, RunEndKind } from '../../../types'
import { t } from '../../i18n'
import { flat } from '../../util/text'
import { took } from '../../util/time'
import { END, endVerb } from '../../words'
import { stepText } from '../plan'
import type { Piece } from './pieces'

/** What a run's end line says: who, how it ended, the task, its time and plan. */
export type EndLine = Pick<CheckLine, 'id' | 'name' | 'doing' | 'ms' | 'plan'> & { end: RunEndKind }

/**
 * A run's end in one line, the toast's and the conversation's alike: who, how,
 * the task and how long it took; one that failed or was stopped says the step
 * it stopped on, as one done did them all.
 *  ✓ Pip finished: Fix the tests · 12m 5s
 *  × Bolt failed: Review the README · step 2/4 · 3m 0s
 */
export function endPieces(x: EndLine): Piece[] {
  const title = flat(x.doing)
  return [
    { text: `${END[x.end].mark} `, role: x.end },
    { text: x.name, role: 'name', id: x.id },
    { text: ` ${endVerb(x.end)}`, role: x.end },
    ...(title === '' ? [] : [{ text: `: ${title}`, role: 'doing' as const }]),
    ...(x.plan !== undefined && x.end !== 'done' ? [{ text: ` · ${t().progress.step(stepText(x.plan))}`, role: 'step' as const }] : []),
    { text: ` · ${took(x.ms)}`, role: 'time' },
  ]
}

/** The same line as plain text, for the toast. */
export const endNotice = (x: EndLine): string =>
  endPieces(x)
    .map(p => p.text)
    .join('')
