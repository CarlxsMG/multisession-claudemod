// The pane between drawings: the timers that repaint its figures in place,
// type out its bubbles and keep the crew in step, and what its drawings
// leave them.
import { PANE } from '../../config'
import { relayIfDue } from '../../crew/relay'
import { syncCrew } from '../../crew/sync'
import { releaseIfDue } from '../../crew/takeover'
import { quiet } from '../../engine'
import type { Engine } from '../../engine'
import type { Cells } from '../../figure/raster'
import { hasHeldCalls, writeCalls } from '../../progress/calls'
import { runtime } from '../../runtime'
import { ensureLines } from '../../settings/mood-lines'
import { updatePaneTick } from '../../state/atoms'

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
 * is drawn at; the frame of the last change to the look, which the preview
 * cheers for; and whether a surface that draws the pane as a page (the
 * desktop app, an editor, a phone) has it open: no blit reaches its
 * figures, so the pane is drawn again now and then to move them and its ages.
 */
export const pane: { readonly frame: number; readonly changedFrame: number; readonly asPage: boolean } = state

/** The look just changed: the preview cheers for it. */
export function cheerLook() {
  state.changedFrame = state.frame
}

/** The pane closed: none of its rasters is repainted, and no bubble types. */
export function forgetPane() {
  forgetRasters()
  state.typingUntil = 0
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
 * What the pane's main view, just drawn, owes the clock: a redraw at
 * `napDue`, when the first worker it showed napping leaves the row or an
 * end it showed stops standing out, and the typing tick's until
 * `typingUntil`, while a bubble types out (0 for none of either).
 */
export function oweRedraws(dues: { napDue: number; typingUntil: number }) {
  state.napDue = dues.napDue
  state.typingUntil = dues.typingUntil
}

/**
 * The pane's render reads the tick: a new one draws the pane again, and
 * nothing else.
 */
export function redrawPane($: Engine) {
  return quiet($, updatePaneTick($, n => n + 1), 'redraw')
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
    void $.ui.blit({ requestId: PANE, key, cells })
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
  // A napping worker leaves the row, and an end stops standing out, when its
  // time is up, not a redraw later.
  else if (state.napDue !== 0) {
    const due = state.napDue
    void $.clock.now().then(now => {
      if (now < due || state.napDue !== due) return
      state.napDue = 0
      return redrawPane($)
    })
  }
  // The workers' calls since the last frame, in one write.
  if (hasHeldCalls()) void writeCalls($)
  relayIfDue($)
  // The engine's statuses now and then, and the marks of woken workers whose
  // run ended at the next tick after it did.
  if (state.frame % SYNC_FRAMES === 0) void quiet($, syncCrew($), 'sync')
  else releaseIfDue($)
  if (state.frame % LINES_FRAMES === LINES_PHASE) void quiet($, ensureLines($), 'mood lines')
}

/** While a bubble types out, each tick of its own timer draws the pane again. */
export function typeTick($: Engine) {
  if (state.typingUntil === 0) return
  void $.clock.now().then(now => {
    if (now >= state.typingUntil) state.typingUntil = 0
    return redrawPane($)
  })
}
