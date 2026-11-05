// The crew's part of the status line.
import type { Phase, Plan, RunEnd } from '../../../types'
import { END, statusLabel } from '../../ui/labels'
import { cut, flat } from '../../util/text'
import { shortTime } from '../../util/time'
import { phaseLabel } from '../phase'
import { stepText } from '../plan'

/**
 * A busy worker on the status line. `title`: what it was given, which the
 * line gives while it has room.
 */
export type Entry = { name: string; phase: Phase; ms: number; plan?: Plan; title?: string }
/** A worker whose run just ended, by how. */
export type Ended = { name: string; end: Exclude<RunEnd, ''> }

// A task's title on the status line, at most this wide.
const STATUS_TITLE = 24

/**
 * The status line: every active worker that fits, then how many did not; a
 * worker with a plan gives its step in place of its phase, and while there is
 * room each says what it is on, and the workers that just ended how. Short of
 * room the titles go first, then the ends, then the workers that do not fit.
 *  crew · Pip 3/5 6m Fix the tests · Bolt reading 4m Review README · ✓ Nube done
 *  crew · Pip editing 6m · Bolt 1/4 4m · +2
 */
export function statusText(entries: readonly Entry[], width: number, ended: readonly Ended[] = []): string {
  if (entries.length === 0 && ended.length === 0) return ''
  const part = (x: Entry, isTitled: boolean): string => {
    const base = `${x.name} ${x.plan === undefined ? phaseLabel(x.phase) : stepText(x.plan)} ${shortTime(x.ms)}`
    const title = isTitled && x.title !== undefined ? flat(x.title) : ''
    return title === '' ? base : `${base} ${cut(title, STATUS_TITLE)}`
  }
  const marks = ended.map(x => `${END[x.end].mark} ${x.name} ${statusLabel(x.end)}`)
  for (const isTitled of [true, false]) {
    const text = `crew · ${[...entries.map(x => part(x, isTitled)), ...marks].join(' · ')}`
    if (text.length <= width) return text
  }
  if (entries.length === 0) return cut(`crew · ${marks.join(' · ')}`, width)
  const parts = entries.map(x => part(x, false))
  for (let k = parts.length; k >= 1; k--) {
    const rest = parts.length - k
    const text = `crew · ${parts.slice(0, k).join(' · ')}${rest > 0 ? ` · +${rest}` : ''}`
    if (text.length <= width) return text
  }
  return cut(`crew · ${parts[0]!}${parts.length > 1 ? ` · +${parts.length - 1}` : ''}`, width)
}
