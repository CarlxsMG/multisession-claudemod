// What the pane's views draw with.
import type { Elements, MatchedHook } from 'claude-code'

import type { Look, Run, RunEndKind, Worker } from '../../../types'
import { ACTIVE, byActivity } from '../../crew/workers'
import type { Engine } from '../../engine'
import { accentHex, accentOf } from '../../figure/accent'
import type { Anim } from '../../figure/anim'
import { diamond, diamondSvg } from '../../figure/diamond'
import { toCells, toSvg } from '../../figure/raster'
import type { Picture } from '../../figure/raster'
import { t } from '../../i18n'
import { hasEnded, isJustEnded } from '../../progress/runs'
import { END } from '../../words'
import { drawnAsPage, forgetRasters, keepRaster, pane } from './animation'

type PaneHook = MatchedHook<'ui.render', { component: 'Pane'; requestId: 'crew' }>
/** The pane's render event. */
export type PaneEvent = Parameters<PaneHook>[1]
/** The elements the pane draws with, on whichever surface it is open. */
export type PaneUi = Elements[PaneEvent['surface']]

/**
 * The pane's figures for one drawing. Every surface's table names every
 * element, and one the surface does not draw reaches it as an empty box: the
 * figures go by the surface. On the terminal each is cells, a raster the
 * timer repaints in place, and the last drawing's are forgotten; where the
 * pane is a page, an SVG.
 */
export function startSprites(ui: PaneUi, surface: PaneEvent['surface']) {
  const { Text } = ui
  const Raster = 'Raster' in ui && surface === 'terminal' ? ui.Raster : undefined
  const Svg = 'Svg' in ui && surface !== 'terminal' ? ui.Svg : undefined
  if (Raster) forgetRasters()
  else drawnAsPage()
  return (key: string, make: (f: number) => Picture, scale: number, alt: string, svg = (f: number) => toSvg(make(f), 5 * scale)) => {
    if (Raster) {
      const draw = (f: number) => toCells(make(f), scale)
      const cells = draw(pane.frame)
      keepRaster(key, draw, cells.cells)
      return <Raster key={key} columns={cells.columns} rows={cells.rows} cells={cells.cells} />
    }
    if (Svg) return <Svg source={svg(pane.frame)} alt={alt} />
    return <Text>{alt}</Text>
  }
}

/** What `startSprites` gives: a figure drawn as the surface shows it. */
export type Sprite = ReturnType<typeof startSprites>

/**
 * What every view of the pane draws with, for one drawing. `$` goes beside it,
 * as the first argument: the validator refuses `$` inside an object.
 */
export type PaneContext = {
  ui: PaneUi
  sprite: Sprite
  look: Look
  now: number
  width: number
  height: number
}

/**
 * A framed ON/OFF switch, one press target. Its word is padded so the frame
 * keeps its width when it flips, which holds in the monospaced face only.
 */
export function toggle(ui: PaneUi, key: string, label: string, value: boolean, onPress: () => void) {
  const { Box, Text, Button } = ui
  const said = value ? t().pane.on : t().pane.off
  return (
    <Box key={`${key}-frame`} borderStyle="round" borderColor={value ? 'success' : 'inactive'} hover={{ borderColor: 'claude' }}>
      <Button key={key} plain label={`${label}: ${said}`} onPress={onPress}>
        <Text> {label} </Text>
        <Text bold mono color={value ? 'success' : 'inactive'}>
          {said.padEnd(3)}
        </Text>
        <Text> </Text>
      </Button>
    </Box>
  )
}

/** How long a message's envelope shows by a figure. */
export const MAIL_SHOWN_MS = 6000
// How long a worker that finished cheers, its run's end long gone.
const DONE_CHEER_MS = 15_000
/** The orchestrator's figure moves the same way on every surface. */
export const ORCH_SEED = 7

// A worker whose run just ended (`ended`) cheers for it, or shows that it
// failed or was stopped, whatever the engine has it as since.
function workerAnim(worker: Worker, now: number, ended?: RunEndKind): Anim {
  if (ended !== undefined) return ended === 'done' ? 'happy' : ended
  switch (worker.status) {
    // A free worker naps until it is given something: its zZ says so.
    case 'idle':
      return 'sleep'
    case 'done':
      return now - worker.updatedAt < DONE_CHEER_MS ? 'happy' : 'done'
    default:
      return worker.status
  }
}

const mailOf = (w: Worker, now: number): 'in' | 'out' | undefined => (now - w.lastMsgAt < MAIL_SHOWN_MS ? (w.lastMsgIn ? 'in' : 'out') : undefined)

/**
 * What both views draw the workers with: each one's figure, posed by its
 * status and by how its latest run ended while that end is fresh, and its
 * name, which opens its transcript.
 */
export function workerKit($: Engine, ctx: PaneContext, list: Worker[], runs: readonly Run[]) {
  const { ui, sprite, look, now } = ctx
  const { Button, Text } = ui
  const active = list.filter(w => ACTIVE.has(w.status))
  const ordered = [...list].sort(byActivity)
  const statusColor = (w: Worker) => (w.status === 'failed' || w.status === 'done' ? END[w.status].color : 'text')
  // How each worker's latest run ended, while that end is fresh.
  const lastRun = new Map(runs.map(r => [r.id, r]))
  const justEnded = (w: Worker): RunEndKind | undefined => {
    const r = lastRun.get(w.id)
    return r !== undefined && hasEnded(r) && isJustEnded(r, now) ? r.end : undefined
  }
  const figure = (worker: Worker, status: string) => {
    const mail = mailOf(worker, now)
    const wAnim = workerAnim(worker, now, justEnded(worker))
    const accent = parseInt(accentHex(worker, look).slice(1), 16)
    const pose = (f: number) => ({ anim: wAnim, frame: f, seed: worker.seed, ...(mail ? { mail } : {}) })
    return sprite(
      `w-${worker.id}`,
      f => diamond(worker.seed, accent, pose(f)),
      1,
      `${worker.name}: ${status}`,
      f => diamondSvg(worker.seed, accent, pose(f)),
    )
  }
  // A Box's width counts cells of the monospaced face, and the desktop app
  // draws Text in a proportional one unless told: a card is as wide as its
  // figure, and a name as long as it holds fits only in the monospaced face.
  const nameButton = (w: Worker) => (
    <Button key={`view-${w.id}`} plain label={t().pane.view(w.name)} onPress={() => void $.ui.view({ agentId: w.id })}>
      <Text bold mono color={accentOf(w, look)} wrap="truncate-end">
        {w.name}
      </Text>
    </Button>
  )

  return { list, active, ordered, statusColor, lastRun, justEnded, figure, nameButton }
}

/** The crew as the pane's views show it. */
export type WorkerKit = ReturnType<typeof workerKit>

/**
 * The context of a view that shows the crew. The editor draws with
 * `PaneContext` alone: reading the workers would draw it again on their every
 * change.
 */
export type CrewContext = PaneContext & { kit: WorkerKit }
