// The crew's pane: how it opens, and the view it draws.
import type { HookFor } from 'claude-code'

import { PANE } from '../../config'
import type { Engine } from '../../engine'
import { readLook, readPaneTick, readRuns, readView, readWorkers } from '../../state/atoms'
import { forgetPane } from './animation'
import { drawEditor } from './editor'
import { drawMain } from './main'
import { drawTeam } from './team'
import { startSprites, workerKit } from './widgets'
import type { PaneEvent } from './widgets'

/** Opens the pane beside the conversation, focused when asked. */
export function openPane($: Engine, focus?: boolean) {
  return $.ui.open({ id: PANE, title: 'Crew', columns: 48, ...(focus ? { focus: true } : {}) })
}

// Set when the session started with no surface attached, headless or before
// the desktop app attached: the pane opens with the first that does.
let isOpenDue = false

/** Opens the pane where a surface is attached, and with none, once one attaches. */
export async function openPaneWhenShown($: Engine) {
  const surfaces = await $.session.surfaces().catch(() => [])
  if (surfaces.length === 0) isOpenDue = true
  else void openPane($)
}

/** A surface attached: the pane opens if the session's start could not open it. */
export function openPaneOnAttach($: Engine) {
  if (!isOpenDue) return
  isOpenDue = false
  void openPane($)
}

/**
 * The pane, as the view the person picked: the editor, the whole team, or
 * the orchestrator with its crew and their messages.
 */
export async function drawPane($: Engine, e: PaneEvent) {
  const ui = $.ui.resolve(e)
  await readPaneTick($)
  const now = await $.clock.now()
  const look = await readLook($)
  const width = e.props.bodyColumns
  const height = e.props.scroll.bodyRows
  const sprite = startSprites(ui, e.surface)

  const page = await readView($)
  if (page === 'edit') return drawEditor($, ui, sprite, look, width, height)
  const kit = workerKit($, ui, sprite, look, now, await readWorkers($), await readRuns($))
  if (page === 'crew') return drawTeam($, ui, kit, now, width)
  return drawMain($, ui, sprite, kit, look, now, width, height)
}

type OnCloseHook = HookFor<'ui.close'>
/** Forgets what the pane drew when it closes. */
export function onClose($: Engine, e: Parameters<OnCloseHook>[1], next: Parameters<OnCloseHook>[2]) {
  if (e.id === PANE) forgetPane()
  return next(e)
}
