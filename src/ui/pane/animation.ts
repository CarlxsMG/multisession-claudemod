// The pane between drawings: the timers that repaint its figures in place,
// type out its bubbles and keep the crew in step, and what its drawings
// leave them.
import type { Look } from '../../../types'
import { PANE } from '../../config'
import { relayIfDue } from '../../crew/relay'
import { hasHeldFirsts, hasHeldOrch, keepFirstDrawn, writeHeldOrch } from '../../crew/feed'
import { syncCrew } from '../../crew/sync'
import { releaseIfDue } from '../../crew/takeover'
import { waitingIfDue } from '../../crew/waiting'
import { quiet } from '../../engine'
import type { Engine } from '../../engine'
import type { Cells } from '../../figure/raster'
import { hasHeldCalls, writeCalls } from '../../progress/calls'
import { runtime } from '../../runtime'
import { ensureLines } from '../../settings/mood-lines'
import { updatePaneTick } from '../../state/atoms'
import { APPLE_TYPE_TICK_MS, TYPE_TICK_MS } from './feed'

// What the timer and the pane's drawings leave each other. The rasters the
// pane drew last, by key, each with how to draw any frame, are repainted in
// place without a render pass; the cells each shows now, drawn or blitted,
// keep a frame that changes nothing from being sent.
const state = runtime.pane

// What the timer does every so many frames (`TICK_MS` each): draw the pane
// again for its ages, sync the crew with the engine, and look for a batch of
// lines to ask for, out of step with the other two.
const REDRAW_FRAMES = 12
const SYNC_FRAMES = 8
const LINES_FRAMES = 25
const LINES_PHASE = 3

/**
 * What the pane's drawings read of the timer: its frame, which every figure
 * is drawn at; the frame a drawing first showed the look as it is, which the
 * preview cheers for; and whether a surface that draws the pane as a page (the
 * desktop app, an editor, a phone) has it open: no blit reaches its
 * figures, so the pane is drawn again now and then to move them and its ages.
 */
export const pane: { readonly frame: number; readonly changedFrame: number; readonly asPage: boolean } = state

/**
 * A drawing shows `look`: the preview cheers when it is not the one the last
 * drawing showed. A load's first drawing has nothing to compare it with, so
 * a start or a reload is no change.
 */
export function noticeLook(look: Look) {
  const shown = JSON.stringify(look)
  if (state.lookShown !== '' && state.lookShown !== shown) state.changedFrame = state.frame
  state.lookShown = shown
}

/** The pane closed: none of its rasters is repainted, no bubble types, and no nap is waited for. */
export function forgetPane() {
  forgetRasters()
  stopTyping()
  forgetNap()
  state.asPage = false
}

/** A drawing on the terminal starts: the last one's rasters are repainted no more. */
export function forgetRasters() {
  state.mounted.clear()
  state.blitted.clear()
}

/** A raster the drawing shows, `cells` now: the timer repaints it with `draw` at each frame. */
export function keepRaster(key: string, draw: (frame: number) => Cells, cells: string) {
  state.mounted.set(key, draw)
  state.blitted.set(key, cells)
}

/** A surface draws the pane as a page. */
export function drawnAsPage() {
  state.asPage = true
}

/** No app draws the session any more: the pane is not drawn again for a page. */
export function pageGone() {
  state.asPage = false
}

/**
 * What the pane's main view, drawn at `now`, owes the clock: a redraw at
 * `napDue`, when the first worker it showed napping leaves the row or an
 * end it showed stops standing out, and the typing tick's until
 * `typingUntil`, while a bubble types out (0 for none of either).
 */
export function oweRedraws($: Engine, dues: { napDue: number; typingUntil: number; now: number }) {
  oweNap($, dues.napDue, dues.now)
  state.typingUntil = dues.typingUntil
  if (dues.typingUntil === 0) stopTyping()
  else startTyping($)
}

// One timer waits for the nap that is due, so the row changes on time and
// no frame asks the clock in between. A drawing that owes the same moment
// keeps it; another moment, earlier or later, replaces it.
function oweNap($: Engine, due: number, now: number) {
  if (due === state.napDue) return
  forgetNap()
  if (due === 0) return
  state.napDue = due
  state.napTimer = $.clock.after(Math.max(0, due - now), () => {
    if (state.napDue !== due) return
    state.napTimer = undefined
    state.napDue = 0
    // The drawing this asks for owes the next nap, if one is.
    void redrawPane($)
  })
}

/** No nap is waited for, and its timer stops: the pane closed, or a session starts. */
export function forgetNap() {
  state.napTimer?.cancel()
  state.napTimer = undefined
  state.napDue = 0
}

/** Whether the session runs in Terminal.app, whose bubbles type out at a pace of their own. */
export function typeForTerminal(isAppleTerminal: boolean) {
  state.isAppleTerminal = isAppleTerminal
}

// The timer that types bubbles out runs only while one does: the rest of a
// session it would wake the process for nothing, about eleven times a second.
// The drawing that shows a bubble starts it, so the bubble's first frame comes
// a period later and not at the pane's next tick.
function startTyping($: Engine) {
  if (state.typer !== undefined) return
  state.typer = $.clock.every(state.isAppleTerminal ? APPLE_TYPE_TICK_MS : TYPE_TICK_MS, () => typeTick($))
}

/** No bubble types out from now on, and the timer that types them stops. */
export function stopTyping() {
  state.typer?.cancel()
  state.typer = undefined
  state.typingUntil = 0
}

/**
 * The pane's render reads the tick: a new one draws the pane again, and
 * nothing else.
 */
export function redrawPane($: Engine) {
  return quiet(
    $,
    updatePaneTick($, n => n + 1),
    'redraw',
  )
}

/**
 * One frame of the pane's timer: the figures move in place, and now and then
 * the pane is drawn again, the crew synced, and lines asked for.
 */
export function tick($: Engine) {
  state.frame += 1
  const { mounted, blitted } = state
  for (const [key, draw] of mounted) {
    const cells = draw(state.frame).cells
    if (blitted.get(key) === cells) continue
    blitted.set(key, cells)
    void $.ui
      .blit({ requestId: PANE, key, cells })
      .then(r => {
        // Not taken: the next frame is sent whatever it holds.
        if (r.deny !== undefined && state.blitted.get(key) === cells) state.blitted.delete(key)
      })
      .catch(() => {
        state.mounted.delete(key)
        state.blitted.delete(key)
      })
  }
  // Ages, naps and fading cheers are read off the clock: redraw now and then.
  if (state.frame % REDRAW_FRAMES === 0 && (mounted.size > 0 || state.asPage)) void redrawPane($)
  // The workers' calls since the last frame, in one write, what the
  // orchestrator's last call said it does, and the first drawings of the
  // end-of-task rows drawn since.
  if (hasHeldCalls()) void writeCalls($)
  if (hasHeldOrch()) void quiet($, writeHeldOrch($), 'orch')
  if (hasHeldFirsts()) void quiet($, keepFirstDrawn($), 'first drawn')
  relayIfDue($)
  // The engine's statuses now and then, and the marks of woken workers whose
  // run ended, and the tasks that waited for a run, at the next tick after
  // it did.
  if (state.frame % SYNC_FRAMES === 0) void quiet($, syncCrew($), 'sync')
  else {
    releaseIfDue($)
    waitingIfDue($)
  }
  if (state.frame % LINES_FRAMES === LINES_PHASE) void quiet($, ensureLines($), 'mood lines')
}

// While a bubble types out, each tick of its own timer draws the pane again,
// the last of them with the bubble whole.
function typeTick($: Engine) {
  void $.clock.now().then(now => {
    if (now >= state.typingUntil) stopTyping()
    return redrawPane($)
  })
}
