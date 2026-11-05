// The words in the bottom border of a crew call's bubble: what its result
// says, read back from the text the model read.
import type { Look, Member } from '../../../types'
import { findWorker } from '../../crew/workers'
import { t } from '../../i18n'
import { readDelegate } from '../../prompts/results'
import { textOf } from '../../util/text'
import { colorOfMember, dim } from './bubble'
import type { Seg } from './bubble'

/**
 * What a crew call's result says, for the bottom border of its bubble, in
 * shorter forms after the first; undefined for a result it cannot read,
 * which then keeps the engine's own drawing under the row. The result of a
 * TaskStop, whose one line says it already, has no words.
 */
export function resultFoots(tool: string, output: unknown, who: Member, members: readonly Member[], look: Look): Seg[][] | undefined {
  const text = textOf(output).trim()
  const words = t().transcript
  if (tool === 'TaskStop') return []
  if (tool === 'SendMessage') {
    const sent = (typeof output === 'object' && output !== null ? output : {}) as Record<string, unknown>
    if (sent.success === false || text === '') return undefined
    if (typeof sent.resumedAgentId === 'string' || /^resuming\b/i.test(text)) {
      return [[dim(words.wakes), { text: who.name, color: colorOfMember(who, look) }], [dim(words.woke)]]
    }
    return [[dim(words.delivered)]]
  }
  const outcome = readDelegate(text)
  if (outcome === undefined) return undefined
  if (outcome.kind === 'held') {
    const by = findWorker(members, outcome.by)
    const name: Seg = { text: outcome.by, ...(by !== undefined ? { color: colorOfMember(by, look) } : {}) }
    return [[dim(words.heldFor), name], [dim(words.held)]]
  }
  const reused = outcome.kind === 'reused'
  const base = reused ? words.reused : words.fresh
  const short = reused ? words.reusedShort : words.fresh
  const busy = outcome.busy
  if (busy.length === 0) return [[dim(base)], [dim(short)]]
  const named = busy.flatMap((name, i): Seg[] => {
    const m = findWorker(members, name)
    const sep = i === 0 ? [] : [dim(i === busy.length - 1 ? words.and : ', ')]
    return [...sep, { text: name, ...(m !== undefined ? { color: colorOfMember(m, look) } : {}) }]
  })
  const warn: Seg = { text: '! ', color: 'warning', bold: true }
  const verb = dim(words.worksHere(busy.length))
  return [
    [dim(`${base} · `), warn, ...named, verb],
    [dim(`${short} · `), warn, ...named, verb],
    [dim(`${short} · `), warn, dim(words.moreHere(busy.length))],
    [dim(short)],
  ]
}
