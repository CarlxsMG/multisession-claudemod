// The pane between drawings: the timer that repaints its figures in place
// and keeps the crew in step, and what its drawings leave the timer.
import { PANE } from '../../config'
import { relayIfDue } from '../../crew/relay'
import { syncCrew } from '../../crew/sync'
import { releaseIfDue } from '../../crew/takeover'
import { quiet } from '../../engine'
import type { Engine } from '../../engine'
import type { Cells } from '../../figure/raster'
import { hasHeldCalls, writeCalls } from '../../progress/calls'
import { ensureLines } from '../../settings/mood-lines'
import { updatePaneTick } from '../../state/atoms'

/**
 * Rasters the pane drew last, by key, each with how to draw any frame: the
 * timer repaints them in place without a render pass.
 */
export const mounted = new Map<string, (frame: number) => Cells>()
/**
 * The cells each of them shows now, drawn or blitted: a frame that changes
 * nothing is not sent.
 */
export const blitted = new Map<string, string>()

// What the timer does every so many frames (`TICK_MS` each): draw the pane
// again for its ages, sync the crew with the engine, and look for a batch of
// lines to ask for, out of step with the other two.
const REDRAW_FRAMES = 12
const SYNC_FRAMES = 8
const LINES_FRAMES = 25
const LINES_PHASE = 3

/** What the timer and the pane's drawings leave each other. */
export const pane = {
  // The timer's frame: every figure is drawn at it.
  frame: 0,
  // Whether a surface that draws the pane as a page (the desktop app, an
  // editor, a phone) has it open: no blit reaches its figures, so the pane
  // is drawn again now and then to move them and its ages.
  asPage: false,
  // The frame of the last change to the look: the preview cheers for it.
  changedFrame: -100,
  // Until when the pane's last drawing had a bubble still typing out.
  typingUntil: 0,
  // When the first worker the pane's last drawing showed napping leaves the
  // row, or a run's end it showed stops standing out (0 for none).
  napDue: 0,
}

/** The look just changed: the preview cheers for it. */
export function cheerLook() {
  pane.changedFrame = pane.frame
}

/** The pane closed: none of its rasters is repainted, and no bubble types. */
export function forgetPane() {
  mounted.clear()
  blitted.clear()
  pane.typingUntil = 0
  pane.asPage = false
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
  pane.frame += 1
  for (const [key, draw] of mounted) {
    const cells = draw(pane.frame).cells
    if (blitted.get(key) === cells) continue
    blitted.set(key, cells)
    void $.ui.blit({ requestId: PANE, key, cells })
      .then(r => {
        // Not taken: the next frame is sent whatever it holds.
        if (r.deny !== undefined && blitted.get(key) === cells) blitted.delete(key)
      })
      .catch(() => {
        mounted.delete(key)
        blitted.delete(key)
      })
  }
  // Ages, naps and fading cheers are read off the clock: redraw now and then.
  if (pane.frame % REDRAW_FRAMES === 0 && (mounted.size > 0 || pane.asPage)) void redrawPane($)
  // A napping worker leaves the row, and an end stops standing out, when its
  // time is up, not a redraw later.
  else if (pane.napDue !== 0) {
    const due = pane.napDue
    void $.clock.now().then(now => {
      if (now < due || pane.napDue !== due) return
      pane.napDue = 0
      return redrawPane($)
    })
  }
  // The workers' calls since the last frame, in one write.
  if (hasHeldCalls()) void writeCalls($)
  relayIfDue($)
  // The engine's statuses now and then, and the marks of woken workers whose
  // run ended at the next tick after it did.
  if (pane.frame % SYNC_FRAMES === 0) void quiet($, syncCrew($), 'sync')
  else releaseIfDue($)
  if (pane.frame % LINES_FRAMES === LINES_PHASE) void quiet($, ensureLines($), 'mood lines')
}
