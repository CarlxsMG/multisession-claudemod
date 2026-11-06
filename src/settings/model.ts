// The model the main session runs on, which the user changes with /model, the
// picker or the settings.
import type { Engine } from '../engine'
import { readMainModel, updateMainModel } from '../state/atoms'

/**
 * Reads the main session's model, or takes the one a switch names: the pane
 * alone is drawn again, and only when it changed.
 */
export async function readModel($: Engine, id = '') {
  const now = id !== '' ? id : await $.session.model().catch(() => '')
  if (now !== '' && now !== (await readMainModel($))) await updateMainModel($, () => now)
}
