// The pane's main view: the orchestrator, its crew's cards and their
// messages.
import type { Look, Msg, Orch, Worker } from '../../../types'
import { ORCH_ID, USER_ID, isOrchIn } from '../../crew/feed'
import { ACTIVE, napLeavesAt, napsAway } from '../../crew/workers'
import type { Engine } from '../../engine'
import { accentOf, nameColorOf } from '../../figure/accent'
import type { Anim } from '../../figure/anim'
import { W as FIGURE_W, pictureRows } from '../../figure/catalog'
import { picture } from '../../figure/critter'
import { DIAMOND_ROWS, DIAMOND_W } from '../../figure/diamond'
import { t } from '../../i18n'
import { fitModel, modelLabel } from '../../model-label'
import { pickLine } from '../../persona/lines'
import { vibeOf } from '../../persona/vibes'
import { JUST_ENDED_MS, isOpen } from '../../progress/runs'
import { cardText } from '../../progress/text/card'
import { setMode } from '../../settings/notes'
import { readIsOn, readLimits, readMainModel, readMessages, readModelLimits, readMoodLines, readOrch, updateView } from '../../state/atoms'
import { LIMITS_SHOWN, limitColor, limitLabel } from '../../usage/limits'
import { wrapText } from '../../util/text'
import { END, cardLabel, statusLabel } from '../../words'
import { drawFeed } from './feed'
import { MAIL_SHOWN_MS, ORCH_SEED, toggle } from './widgets'
import type { CrewContext, WorkerKit } from './widgets'

// How long the orchestrator cheers when its turn ends, and how long it
// waits idle before it naps.
const ORCH_CHEER_MS = 6000
const ORCH_NAP_MS = 180_000

// A turn ends happy, then idles: the nap counts from the end of the cheer.
function orchAnim(orch: Orch, now: number): Anim {
  const idleFor = orch.mood === 'happy' ? now - orch.since - ORCH_CHEER_MS : orch.mood === 'idle' ? now - orch.since : undefined
  if (idleFor === undefined) return orch.mood
  return idleFor < 0 ? 'happy' : idleFor > ORCH_NAP_MS ? 'sleep' : 'idle'
}

// A line's sender or recipient in its color: the person's, the
// orchestrator's or its worker's, found by id.
const lineColors =
  (look: Look, list: readonly Worker[]) =>
  (msg: Msg, side: 'from' | 'to'): string => {
    const id = side === 'from' ? msg.fromId : msg.toId
    if (id === USER_ID) return 'suggestion'
    if (id === ORCH_ID) return nameColorOf(look)
    const w = list.find(x => x.id === id)
    return w ? accentOf(w, look) : 'text'
  }

// The orchestrator's name on top, its personality and the model the main
// session runs; below, the figure and what it says, with its two controls
// under it, flush right, beside the usage, whose rows are padded to line
// up and so monospaced: the desktop app's text is otherwise proportional.
// With it, the rows it takes (`headRows`).
async function drawHeader($: Engine, ctx: CrewContext, msgs: readonly Msg[]) {
  const { ui, sprite, kit, look, now, width } = ctx
  const { Box, Text, Button } = ui
  const { list, active } = kit
  const orch = await readOrch($)
  const isOn = await readIsOn($)
  const extra = await readMoodLines($)
  // The session's window, the week's, and below them each model's week.
  const usage = [...(await readLimits($)), ...(await readModelLimits($))].slice(0, LIMITS_SHOWN)

  const anim = orchAnim(orch, now)
  const latest = [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const lastMsg = msgs[msgs.length - 1]
  const orchMail =
    lastMsg !== undefined && now - lastMsg.at < MAIL_SHOWN_MS && (isOrchIn(lastMsg, 'from') || isOrchIn(lastMsg, 'to'))
      ? isOrchIn(lastMsg, 'to')
        ? 'in'
        : 'out'
      : undefined

  // What the orchestrator runs takes up to two lines beside its figure. The
  // figure's top row is room for a hop and the marks, so the bubble starts
  // above its head, and the controls go below, flush right: level with the
  // podium when nothing else is said, a few rows lower when the column runs
  // past the figure.
  const doing = orch.activity !== '' && anim !== 'idle' && anim !== 'sleep' ? wrapText(orch.activity, Math.max(10, width - FIGURE_W - 2), 2) : []
  // The bubble and the controls take three rows each.
  const headRows = Math.max(pictureRows(true), 6 + doing.length + (list.length > 0 ? 1 : 0))

  const persona = vibeOf(look).label
  const modelName = fitModel(modelLabel(await readMainModel($)), width - look.name.length - persona.length - 6)
  const header = (
    <Box flexDirection="column">
      <Text bold color={nameColorOf(look)} wrap="truncate-end">
        {look.name} <Text color="text">· {persona}</Text>
        {modelName !== '' && <Text dimColor>{` · ${modelName}`}</Text>}
      </Text>
      <Box flexDirection="row" gap={2}>
        {sprite(
          'orch',
          f => picture(look, { anim, frame: f, seed: ORCH_SEED, podium: true, ...(orchMail ? { mail: orchMail } : {}) }),
          1,
          t().pane.orchAlt(look.name),
        )}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} justifyContent="space-between">
          <Box flexDirection="column">
            <Box borderStyle="round" borderColor={nameColorOf(look)} paddingX={1} alignSelf="flex-start">
              <Text italic>{pickLine(look, anim, orch.since, now, latest?.name ?? t().pane.anyWorker, extra.moods)}</Text>
            </Box>
            {doing.map(line => (
              <Text dimColor wrap="truncate-end">
                {line}
              </Text>
            ))}
            {list.length > 0 && (
              <Text dimColor wrap="truncate-end">
                {t().pane.count(list.length, active.length)}
              </Text>
            )}
          </Box>
          <Box flexDirection="row" justifyContent="flex-end" columnGap={1}>
            {usage.length > 0 && (
              <Box flexDirection="column" justifyContent="center">
                {usage.map(x => (
                  <Text mono>
                    <Text dimColor>{(limitLabel(x.kind) ?? x.kind.toLowerCase().slice(0, 5)).padEnd(5)}</Text>
                    <Text color={limitColor(x.percent)}>{`${x.percent}%`.padStart(4)}</Text>
                  </Text>
                ))}
              </Box>
            )}
            {toggle(ui, 'mode', t().pane.delegate, isOn, () => void setMode($, !isOn))}
            <Box key="edit-frame" borderStyle="round" borderColor="inactive" hover={{ borderColor: 'claude' }}>
              <Button key="edit" plain label={t().pane.customize} onPress={() => void updateView($, () => 'edit')}>
                <Text bold> {t().pane.edit} </Text>
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
  return { header, headRows }
}

// The next redraw the clock owes, 0 for none: a nap that takes a worker off
// the row, or an end that stops standing out.
function nextNapDue(inRow: readonly Worker[], kit: WorkerKit, now: number): number {
  const { lastRun, justEnded } = kit
  const dues = inRow.flatMap(w => {
    const r = lastRun.get(w.id)
    const leavesAt = napLeavesAt(w)
    return [...(leavesAt !== undefined ? [leavesAt] : []), ...(r !== undefined && justEnded(w) !== undefined ? [r.endedAt + JUST_ENDED_MS] : [])].filter(
      at => at > now,
    )
  })
  return dues.length > 0 ? Math.min(...dues) : 0
}

// One row of cards as wide as their figures, a column apart, as many as
// the width takes (nine in 46 columns), for every worker but those that
// napped away; when they do not all fit, the last place says how many
// more there are, framed as tall as a diamond and a name and as wide as
// that count needs, and opens the whole team; it has no label, which the
// desktop app would draw in place of the count. With it, the rows it takes
// (`crewRows`) and the redraw it owes the clock (`napDue`).
function drawCardRow($: Engine, ctx: CrewContext) {
  const { ui, kit, now, width } = ctx
  const { Box, Text, Button } = ui
  const { ordered, statusColor, lastRun, justEnded, figure, nameButton } = kit
  const inRow = ordered.filter(w => justEnded(w) !== undefined || !napsAway(w, now))
  // Under its name a working worker's card gives its plan's step, else its
  // run's time, and any other a word of four letters: what it is doing and
  // the pane's own words for its status do not fit, and the team view and
  // the check-ins say them whole. A run that just ended has its word stand
  // out, in the color of how it ended, so an end is seen at a glance. Both
  // are in the monospaced face, as the name is, so four letters fill the
  // card's four cells on a surface whose text is proportional.
  const openRuns = new Map([...lastRun.values()].filter(isOpen).map(r => [r.id, r]))
  const perRow = Math.max(1, Math.floor((width + 1) / (DIAMOND_W + 1)))
  const moreWidth = (k: number) => Math.max(DIAMOND_W, `+${inRow.length - k}`.length + 2)
  let fits = perRow - 1
  while (fits > 0 && fits * (DIAMOND_W + 1) + moreWidth(fits) > width) fits--
  const shown = inRow.length > perRow ? inRow.slice(0, fits) : inRow
  const hidden = inRow.length - shown.length
  const crew = inRow.length > 0 && (
    <Box flexDirection="row" columnGap={1}>
      {shown.map(worker => {
        const status = ACTIVE.has(worker.status) && worker.activity ? worker.activity : statusLabel(worker.status)
        const ended = justEnded(worker)
        return (
          <Box flexDirection="column" width={DIAMOND_W}>
            {figure(worker, status)}
            {nameButton(worker)}
            {ended !== undefined ? (
              <Text wrap="truncate-end" mono bold inverse color={END[ended].color}>
                {cardLabel(ended)}
              </Text>
            ) : (
              worker.status !== 'idle' && (
                <Text wrap="truncate-end" mono color={statusColor(worker)} dimColor={!ACTIVE.has(worker.status)}>
                  {cardText(worker.status, openRuns.get(worker.id), now, DIAMOND_W)}
                </Text>
              )
            )}
          </Box>
        )
      })}
      {hidden > 0 && (
        <Box
          key="crew-all-frame"
          width={moreWidth(shown.length)}
          height={DIAMOND_ROWS + 1}
          borderStyle="round"
          borderColor="inactive"
          hover={{ borderColor: 'claude' }}
          justifyContent="center"
          alignItems="center"
        >
          <Button key="crew-all" plain onPress={() => void updateView($, () => 'crew')}>
            <Text bold>{`+${hidden}`}</Text>
          </Button>
        </Box>
      )}
    </Box>
  )
  // A card is its figure, the name and the line under it, then a gap.
  const crewRows = inRow.length === 0 ? 0 : DIAMOND_ROWS + 3
  return { crew, crewRows, napDue: nextNapDue(inRow, kit, now) }
}

/**
 * The orchestrator, the model it runs on and its two controls; under them a
 * row of cards for the crew, then their messages (`view`). With it, the
 * redraws it owes the clock: when the first worker it shows napping leaves
 * the row or an end it shows stops standing out (`napDue`), and until when
 * a bubble types out (`typingUntil`), 0 for none.
 */
export async function drawMain($: Engine, ctx: CrewContext) {
  const { ui, kit, look, height } = ctx
  const { Box } = ui
  const msgs = await readMessages($)
  const { header, headRows } = await drawHeader($, ctx, msgs)
  const { crew, crewRows, napDue } = drawCardRow($, ctx)
  // Bubbles fill the rows the orchestrator and the crew leave, newest last.
  const feedRows = height - 1 - headRows - crewRows - 1
  const { feed, typingUntil } = drawFeed(ctx, msgs, feedRows, lineColors(look, kit.list))

  const view = (
    <Box flexDirection="column" gap={1}>
      {header}
      {crew}
      {feed}
    </Box>
  )
  return { view, napDue, typingUntil }
}
