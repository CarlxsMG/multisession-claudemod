// A worker's message or hand-back, and the notification of its end, each
// a bubble:
//  ╭─ Pip → Nova ───╮
//  │ 42 tests pass. │
//  ╰────────────────╯
//  ╭─ Pip → Nova · ✓ done · 2m 5s ─╮
//  │ Fix the tests                 │
//  ╰───────────────────────────────╯
//  ╭─ Bolt → Nova · × failed · step 2/4 · 3m 0s ─╮
//  │ Review the README                           │
//  ╰─────────────────────────────────────────────╯
import type { MatchedHook } from 'claude-code'

import { firstDrawn, headOf, holdFirstDrawn } from '../../crew/feed'
import { findWorker } from '../../crew/workers'
import { unrecognized } from '../../engine'
import type { Engine } from '../../engine'
import { nameColorOf } from '../../figure/accent'
import { t } from '../../i18n'
import { stepText } from '../../progress/plan'
import { lastRunMs, seeColumns } from '../../progress/tracker'
import { readJobs, readLook, readMembers, readParents, readRoutes, readRuns } from '../../state/atoms'
import { took } from '../../util/time'
import { REPORT_ROWS, anyWorker, bubbleCap, bubbleRows, colorOfMember, endSeg, isMarkedEnd, rowWidth } from './bubble'
import type { Seg } from './bubble'
import { crewBubble } from './draw'
import { dim } from './foots'
import { messageSender, notedAgent } from './recover'

type DrawUserMessageHook = MatchedHook<'ui.render', { component: 'UserMessage'; surface: 'terminal' }>
/** Draws a worker's message or report to the main conversation as a bubble from it. */
export async function drawUserMessage($: Engine, e: Parameters<DrawUserMessageHook>[1], next: Parameters<DrawUserMessageHook>[2]) {
  const props = e.props
  seeColumns(e.viewport?.columns)
  if (props.origin.kind === 'composer') return next(e)
  const isNote = props.origin.kind === 'task-notification'
  // Only a notification carries a task: a row with one under another kind
  // is the engine's to draw, and its kind has a new name.
  if (!isNote && props.task !== undefined) unrecognized($, 'task notification origin', props.origin.kind)
  const key = isNote ? props.task?.id : props.from?.name
  if (key === undefined || key.trim() === '') return next(e)
  const members = await readMembers($)
  const known = isNote ? members.find(m => m.id === key) : findWorker(members, key)
  // One the session has no record of may be a worker of a conversation from
  // before Claude Code restarted: what its row says of it.
  const who = known ?? (isNote ? notedAgent(key, props.text, props.task?.type) : messageSender(key, props.origin.kind))
  if (who === undefined) return next(e)
  const look = await readLook($)
  const color = colorOfMember(who, look)
  const reportsTo = (await readParents($)).find(x => x.id === who.id)?.parent
  if (isNote) {
    // The end of a task is a status: who to whom, how it ended and how
    // long it took in the top border, what it was on one line inside. The
    // row keeps the title it was first drawn with, so a redraw never names
    // a later task; with none recorded the bubble is its two borders.
    let first = await firstDrawn($, e.requestId)
    if (first === undefined) {
      const plan = (await readRuns($)).findLast(r => r.id === who.id)?.plan
      const isCut = props.task?.status === 'failed' || props.task?.status === 'killed'
      const ran = lastRunMs(who.id)
      first = {
        id: e.requestId,
        title: (await readJobs($)).find(j => j.id === who.id)?.title ?? '',
        ...(ran !== undefined ? { ms: ran } : {}),
        step: isCut && plan !== undefined ? t().progress.step(stepText(plan)) : '',
      }
      holdFirstDrawn(first)
    }
    const title = first.title
    const status = props.task?.status ?? ''
    if (status.trim() !== '' && !isMarkedEnd(status)) unrecognized($, 'task notification status', status)
    const end = endSeg(status)
    const parent = reportsTo !== undefined ? findWorker(members, reportsTo) : undefined
    const names: Seg[] = [
      who.name !== '' ? { text: who.name, color, bold: true } : anyWorker(),
      dim(' → '),
      reportsTo === undefined
        ? { text: look.name, color: nameColorOf(look), bold: true }
        : { text: reportsTo, bold: true, ...(parent !== undefined ? { color: colorOfMember(parent, look) } : {}) },
      ...(end !== undefined ? [dim(' · '), end] : []),
    ]
    // The notification's own time; where it has none, the run's as the
    // crew measured it, when that reads as more than nothing.
    const ms = props.task?.durationMs ?? (first.ms !== undefined && first.ms >= 1000 ? first.ms : undefined)
    const edge = props.task?.status === 'failed' ? 'warning' : color
    const cap = bubbleCap(rowWidth(e.viewport?.columns))
    const tail = [first.step, ms !== undefined ? took(ms) : ''].filter(x => x !== '').join(' · ')
    return crewBubble($, e, $.ui.resolve(e), props.isExpanded, 1, (rows, mark) => bubbleRows(names, tail, title, rows, cap, edge, [], mark))
  }
  // A message went where its send said; anything else, to whoever started
  // the worker.
  const route = (await readRoutes($)).find(r => r.from === who.id && r.head === headOf(props.text))
  const toOrch = route !== undefined ? route.to === '' : reportsTo === undefined
  const toName = toOrch ? look.name : (route?.to ?? reportsTo ?? '')
  const toMember = toOrch ? undefined : findWorker(members, toName)
  const toColor = toOrch ? nameColorOf(look) : toMember !== undefined ? colorOfMember(toMember, look) : 'text'
  const names: Seg[] = [
    { text: who.name, color, bold: true },
    { text: ' → ', dim: true },
    { text: toName, color: toColor, bold: true },
  ]
  const cap = bubbleCap(rowWidth(e.viewport?.columns))
  return crewBubble($, e, $.ui.resolve(e), props.isExpanded, REPORT_ROWS, (rows, mark) => bubbleRows(names, '', props.text, rows, cap, color, [], mark))
}
