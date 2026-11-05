// The orchestrator's delegate and SendMessage to a worker, a bubble; its
// TaskStop, one line:
//  ╭─ Nova → Pip · Fix the tests ─╮
//  │ Run the tests and fix what…  │
//  ╰──────────────────────────────╯
//  ● Nova × Pip
import type { MatchedHook } from 'claude-code'

import type { Member } from '../../../types'
import { DELEGATE } from '../../config'
import type { Engine } from '../../engine'
import { nameColorOf } from '../../figure/accent'
import { readCalls, readLook, readMembers } from '../../state/atoms'
import { oneLine } from '../../util/text'
import { PLAIN, TASK_ROWS, anyWorker, bubbleCap, bubbleRows, colorOfMember, rowWidth } from './bubble'
import type { Seg } from './bubble'
import { crewBubble } from './draw'
import { resultFoots } from './foots'
import { calledWorker, reachedWorker } from './recover'

// Who a crew call's row names, and the members its bottom border may name:
// the worker the session marked the call with, or, for a finished call the
// session has no record of (one from before Claude Code restarted), the one
// its own input and result name, and no other: a member of this session
// by that name may be another agent. Undefined: the engine's row.
async function rowWorker(
  $: Engine,
  props: { tool_use_id: string; tool: string; input: unknown; output?: unknown; isRunning: boolean },
): Promise<{ who: Member | undefined; members: readonly Member[] } | undefined> {
  const call = (await readCalls($)).find(c => c.id === props.tool_use_id)
  if (call === undefined) {
    const who = props.isRunning || props.output === undefined ? undefined : calledWorker(props.tool, props.input, props.output)
    return who !== undefined ? { who, members: [who] } : undefined
  }
  const members = await readMembers($)
  const who = members.find(m => m.id === call.to)
  // Only a delegate call runs before its worker is known; a call marked
  // with none reached no one of the crew, or is a worker's own.
  if (who === undefined && (props.tool !== DELEGATE || !props.isRunning)) return undefined
  return { who, members }
}

type DrawToolUseHook = MatchedHook<'ui.render', { component: 'ToolUse'; surface: 'terminal'; props: { tool: string[] } }>
/** Draws the main conversation's crew calls as the crew's rows: who gives whom what. */
export async function drawToolUse($: Engine, e: Parameters<DrawToolUseHook>[1], next: Parameters<DrawToolUseHook>[2]) {
  const props = e.props
  if (props.isErrored || props.isInterrupted) return next(e)
  const reached = await rowWorker($, props)
  if (reached === undefined) return next(e)
  const { who, members } = reached
  const look = await readLook($)
  const input = (typeof props.input === 'object' && props.input !== null ? props.input : {}) as Record<string, unknown>
  const field = (key: string): string => (typeof input[key] === 'string' ? (input[key] as string) : '')
  const color = who !== undefined ? colorOfMember(who, look) : PLAIN
  if (props.tool === 'TaskStop') {
    // One line: a bubble would only frame it.
    const { Text } = $.ui.resolve(e)
    return (
      <Text wrap="truncate-end">
        <Text color={color} dimColor={props.isRunning}>
          {'● '}
        </Text>
        <Text bold color={nameColorOf(look)}>
          {look.name}
        </Text>
        <Text color="error"> × </Text>
        <Text bold color={color}>
          {who?.name ?? ''}
        </Text>
      </Text>
    )
  }
  const isDelegate = props.tool === DELEGATE
  const label = isDelegate ? field('title').trim() || oneLine(field('task'), 48) : oneLine(field('summary'), 60)
  const names: Seg[] = [
    { text: look.name, color: nameColorOf(look), bold: true },
    { text: ' → ', dim: true },
    who !== undefined ? { text: who.name, color, bold: true } : anyWorker(),
  ]
  // Once it answered, what the result says goes in the bottom border.
  const foots = who !== undefined && !props.isRunning && props.output !== undefined ? resultFoots(props.tool, props.output, who, members, look) : undefined
  const cap = bubbleCap(rowWidth(e.viewport?.columns))
  const text = field(isDelegate ? 'task' : 'message')
  return crewBubble($, e, $.ui.resolve(e), props.isExpanded === true, TASK_ROWS, (rows, mark) => bubbleRows(names, label, text, rows, cap, color, foots, mark))
}

const NO_ONE: Member = { id: '', name: '', address: '' }

type DrawToolResultHook = MatchedHook<'ui.render', { component: 'ToolResult'; surface: 'terminal'; props: { tool: string[] } }>
/**
 * The result under a crew row: said in the row itself, so nothing here. A
 * result it cannot read, an error and ctrl+o keep the engine's text.
 */
export async function drawToolResult($: Engine, e: Parameters<DrawToolResultHook>[1], next: Parameters<DrawToolResultHook>[2]) {
  const props = e.props
  if (props.isExpanded === true || props.isErrored) return next(e)
  const look = await readLook($)
  const call = (await readCalls($)).find(c => c.id === props.tool_use_id)
  if (call === undefined) {
    // A call from before a restart, whose row says what its result did:
    // whatever worker it names, the border's words read the same.
    if (!reachedWorker(props.tool, props.output) || resultFoots(props.tool, props.output, NO_ONE, [], look) === undefined) return next(e)
  } else {
    const members = await readMembers($)
    const who = members.find(m => m.id === call.to)
    if (who === undefined || resultFoots(props.tool, props.output, who, members, look) === undefined) return next(e)
  }
  const { Box } = $.ui.resolve(e)
  return <Box />
}
