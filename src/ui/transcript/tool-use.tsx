// The orchestrator's delegate and SendMessage to a worker, a bubble; its
// TaskStop, one line:
//  ╭─ Nova → Pip · Fix the tests ─╮
//  │ Run the tests and fix what…  │
//  ╰──────────────────────────────╯
//  ● Nova × Pip
import type { MatchedHook } from 'claude-code'

import { DELEGATE } from '../../config'
import type { Engine } from '../../engine'
import { nameColorOf } from '../../figure/accent'
import { readCalls, readLook, readMembers } from '../../state/atoms'
import { oneLine } from '../../util/text'
import { TASK_ROWS, bubbleCap, bubbleRows, colorOfMember, rowWidth } from './bubble'
import type { Seg } from './bubble'
import { crewBubble } from './draw'
import { resultFoots } from './foots'

type DrawToolUseHook = MatchedHook<'ui.render', { component: 'ToolUse'; surface: 'terminal'; props: { tool: string[] } }>
/** Draws the main conversation's crew calls as the crew's rows: who gives whom what. */
export async function drawToolUse($: Engine, e: Parameters<DrawToolUseHook>[1], next: Parameters<DrawToolUseHook>[2]) {
  const props = e.props
  if (props.isErrored || props.isInterrupted) return next(e)
  // Only the main conversation's calls are marked: a worker's own keep the
  // engine's row.
  const call = (await readCalls($)).find(c => c.id === props.tool_use_id)
  if (call === undefined) return next(e)
  const who = (await readMembers($)).find(m => m.id === call.to)
  // Only a delegate call runs before its worker is known.
  if (who === undefined && (props.tool !== DELEGATE || !props.isRunning)) return next(e)
  const look = await readLook($)
  const input = (typeof props.input === 'object' && props.input !== null ? props.input : {}) as Record<string, unknown>
  const field = (key: string): string => (typeof input[key] === 'string' ? (input[key] as string) : '')
  const color = who !== undefined ? colorOfMember(who, look) : 'inactive'
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
    who !== undefined ? { text: who.name, color, bold: true } : { text: 'crew', dim: true },
  ]
  // Once it answered, what the result says goes in the bottom border.
  const foots = who !== undefined && !props.isRunning && props.output !== undefined ? resultFoots(props.tool, props.output, who, await readMembers($), look) : undefined
  const cap = bubbleCap(rowWidth(e.viewport?.columns))
  const text = field(isDelegate ? 'task' : 'message')
  return crewBubble($, e, $.ui.resolve(e), props.isExpanded === true, TASK_ROWS, (rows, mark) => bubbleRows(names, label, text, rows, cap, color, foots, mark))
}

type DrawToolResultHook = MatchedHook<'ui.render', { component: 'ToolResult'; surface: 'terminal'; props: { tool: string[] } }>
/**
 * The result under a crew row: said in the row itself, so nothing here. A
 * result it cannot read, an error and ctrl+o keep the engine's text.
 */
export async function drawToolResult($: Engine, e: Parameters<DrawToolResultHook>[1], next: Parameters<DrawToolResultHook>[2]) {
  const props = e.props
  if (props.isExpanded === true || props.isErrored) return next(e)
  const call = (await readCalls($)).find(c => c.id === props.tool_use_id)
  if (call === undefined) return next(e)
  const members = await readMembers($)
  const who = members.find(m => m.id === call.to)
  if (who === undefined || resultFoots(props.tool, props.output, who, members, await readLook($)) === undefined) return next(e)
  const { Box } = $.ui.resolve(e)
  return <Box />
}
