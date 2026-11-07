// The pane's feed: the crew's messages, the newest typing out as bubbles,
// as in a chat.
import type { Msg } from '../../../types'
import { t } from '../../i18n'
import { oneLine, wrapText } from '../../util/text'
import { ago } from '../../util/time'
import type { PaneContext } from './widgets'

const BUBBLE_CHARS = 220
const BUBBLE_LINES = 4
const TYPE_MS_PER_CHAR = 28
const TYPE_MAX_MS = 2400
/** How often typing bubbles grow, outside Terminal.app. */
export const TYPE_TICK_MS = 90
/**
 * Terminal.app draws each redraw as it comes, with no synchronized output:
 * fewer of them while a bubble types out.
 */
export const APPLE_TYPE_TICK_MS = 180

// A bubble takes at most this share of the pane's width, and at least this
// many columns.
const FEED_SHARE = 0.85
const FEED_MIN_COLUMNS = 20

type Typed = { msg: Msg; text: string; start: number; end: number }

// Messages type out one after another, as in a chat: each starts when it
// arrived or when the one before it finished, whichever is later.
function typeSchedule(msgs: readonly Msg[]): Typed[] {
  let free = 0
  return msgs.map(msg => {
    const text = oneLine(msg.text, BUBBLE_CHARS)
    // The person's own words are in the conversation already: no typing.
    if (msg.tone === 'user') return { msg, text, start: msg.at, end: msg.at }
    const start = Math.max(msg.at, free)
    const end = start + Math.min(TYPE_MAX_MS, text.length * TYPE_MS_PER_CHAR)
    free = end
    return { msg, text, start, end }
  })
}

// The first `count` characters of wrapped lines, joined by single spaces.
function revealed(lines: readonly string[], count: number): string[] {
  const out: string[] = []
  let left = count
  for (const line of lines) {
    if (left <= 0) break
    out.push(line.slice(0, left))
    left -= line.length + 1
  }
  return out.length > 0 ? out : ['']
}

/**
 * The messages under the crew, in the rows it leaves (`feedRows`): the two
 * newest the crew wrote as bubbles, typing out, the rest one line each; and
 * until when the last of them types out (0 when none does). The newest is
 * first, so what just happened is at the top without scrolling.
 */
export function drawFeed(ctx: PaneContext, msgs: readonly Msg[], feedRows: number, colorOf: (msg: Msg, side: 'from' | 'to') => string) {
  const { ui, now, width } = ctx
  const { Box, Text } = ui
  const typed = typeSchedule(msgs)
  const lastTyped = typed[typed.length - 1]
  const typingUntil = lastTyped !== undefined && lastTyped.end > now ? lastTyped.end : 0
  const widest = Math.max(FEED_MIN_COLUMNS, Math.floor(width * FEED_SHARE))
  // Text columns: the frame takes four, the typing cursor one.
  const inner = widest - 5
  // The two newest messages the crew wrote are bubbles; the rest, and the
  // person's own, one line each, so more of the history fits.
  const picked: { entry: Typed; lines?: string[] }[] = []
  let used = 0
  let bubbles = 0
  for (let i = typed.length - 1; i >= 0; i--) {
    const entry = typed[i]!
    if (entry.start > now) continue
    const lines = entry.msg.tone !== 'user' && bubbles < 2 ? wrapText(entry.text, inner, BUBBLE_LINES) : undefined
    const rows = lines ? lines.length + 2 : 1
    if (picked.length > 0 && used + rows > feedRows) break
    if (lines) bubbles++
    picked.unshift({ entry, lines })
    used += rows
  }

  // One quiet line, lined up with the names in the bubbles' borders:
  //  ─ Nova → Pip · 2m  “…”
  const aside = (msg: Msg) => {
    const color = colorOf(msg, 'from')
    return (
      <Text wrap="truncate-end" mono>
        <Text color={color}> ─ </Text>
        <Text bold color={color}>
          {msg.tone === 'user' ? t().userLine : msg.from}
        </Text>
        <Text color={color}> → </Text>
        <Text bold color={colorOf(msg, 'to')}>
          {msg.to}
        </Text>
        <Text dimColor>{` · ${ago(now, msg.at, t().now)}  “${msg.text}”`}</Text>
      </Text>
    )
  }

  // Drawn by hand so who speaks to whom rides in the top border:
  // ╭─ Nova → Pip · 2m ───╮
  // Its rows line up by counting characters, so each is in the monospaced
  // face: the desktop app draws Text in a proportional one unless told, and
  // there the side borders would fall wherever the words before them end.
  const bubble = ({ entry, lines }: { entry: Typed; lines: string[] }) => {
    const msg = entry.msg
    const count = now >= entry.end ? entry.text.length : Math.floor((entry.text.length * (now - entry.start)) / (entry.end - entry.start))
    const isTyping = count < entry.text.length
    const showing = isTyping ? revealed(lines, count) : lines
    const color = colorOf(msg, 'from')
    const age = ago(now, msg.at, t().now)
    const fixed = msg.from.length + age.length + 6
    const to = oneLine(msg.to, Math.max(4, widest - 6 - fixed))
    const label = fixed + to.length
    const room = Math.max(Math.max(...lines.map(x => x.length)) + 1, label + 2)
    return (
      <Box flexDirection="column" alignItems="flex-start">
        <Text wrap="truncate-end" mono>
          <Text color={color}>╭─ </Text>
          <Text bold color={color}>
            {msg.from}
          </Text>
          <Text dimColor> → </Text>
          <Text bold color={colorOf(msg, 'to')}>
            {to}
          </Text>
          <Text dimColor> · {age}</Text>
          <Text color={color}> {'─'.repeat(room - label - 1)}╮</Text>
        </Text>
        {showing.map((line, i) => (
          <Text wrap="truncate-end" mono>
            <Text color={color}>│ </Text>
            <Text>{(line + (isTyping && i === showing.length - 1 ? '▌' : '')).padEnd(room)}</Text>
            <Text color={color}> │</Text>
          </Text>
        ))}
        <Text color={color} mono>{`╰${'─'.repeat(room + 2)}╯`}</Text>
      </Box>
    )
  }

  // The rows went to the newest messages first, so the order is set only
  // after they are picked.
  const shown = [...picked].reverse()
  const feed = shown.length > 0 && <Box flexDirection="column">{shown.map(({ entry, lines }) => (lines ? bubble({ entry, lines }) : aside(entry.msg)))}</Box>
  return { feed, typingUntil }
}
