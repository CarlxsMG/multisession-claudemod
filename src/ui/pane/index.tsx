// The crew's pane: how it opens, and the view it draws.
import type { HookFor } from 'claude-code'

import { PANE } from '../../config'
import type { Engine } from '../../engine'
import { t } from '../../i18n'
import { runtime } from '../../runtime'
import { readLook, readPaneTick, readRuns, readView, readWorkers } from '../../state/atoms'
import { hasApp } from '../../usage/limits'
import { forgetPane, noticeLook, oweRedraws, pageGone, pane } from './animation'
import { drawEditor } from './editor'
import { drawMain } from './main'
import { drawTeam } from './team'
import { startSprites, workerKit } from './widgets'
import type { PaneContext, PaneEvent } from './widgets'

/** Opens the pane beside the conversation, focused when asked. */
export function openPane($: Engine, focus?: boolean) {
  return $.ui.open({ id: PANE, title: t().pane.title, columns: 48, ...(focus ? { focus: true } : {}) })
}

// Set when the session started with no surface attached, headless or before
// the desktop app attached: the pane opens with the first that does.
const opening = runtime.paneOpen

/** Opens the pane where a surface is attached, and with none, once one attaches. */
export async function openPaneWhenShown($: Engine) {
  const surfaces = await $.session.surfaces().catch(() => [])
  if (surfaces.length === 0) opening.isDue = true
  else void openPane($)
}

/** A surface attached: the pane opens if the session's start could not open it. */
export function openPaneOnAttach($: Engine) {
  if (!opening.isDue) return
  opening.isDue = false
  void openPane($)
}

/**
 * The pane, as the view the person picked: the editor, the whole team, or
 * the orchestrator with its crew and their messages, whose drawing leaves
 * the clock the redraws it owes.
 */
export async function drawPane($: Engine, e: PaneEvent) {
  const ui = $.ui.resolve(e)
  await readPaneTick($)
  const now = await $.clock.now()
  const look = await readLook($)
  noticeLook(look)
  const sprite = startSprites(ui, e.surface)
  const ctx: PaneContext = { ui, sprite, look, now, width: e.props.bodyColumns, height: e.props.scroll.bodyRows, surface: e.surface }

  const page = await readView($)
  if (page === 'edit') return drawEditor($, ctx)
  const crew = { ...ctx, kit: workerKit($, ctx, await readWorkers($), await readRuns($)) }
  if (page === 'crew') return drawTeam($, crew)
  const { view, ...dues } = await drawMain($, crew)
  oweRedraws($, { ...dues, now })
  return view
}

type OnCloseHook = HookFor<'ui.close'>
/** Forgets what the pane drew when it closes. */
export function onClose($: Engine, e: Parameters<OnCloseHook>[1], next: Parameters<OnCloseHook>[2]) {
  if (e.id === PANE) forgetPane()
  return next(e)
}

type OnDetachHook = HookFor<'session.detach'>
/**
 * An app that leaves takes the pane's page with it, often with no close of
 * the pane: once no app draws the session, the timer stops drawing the pane
 * again for a page.
 */
export async function onDetach($: Engine, e: Parameters<OnDetachHook>[1], next: Parameters<OnDetachHook>[2]) {
  const left = await next(e)
  if (pane.asPage && !(await hasApp($))) pageGone()
  return left
}
