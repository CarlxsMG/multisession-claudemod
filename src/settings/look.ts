// The orchestrator's look, changed from the pane or a command.
import type { Look } from '../../types'
import type { Engine } from '../engine'
import { normalizeLook } from '../figure/look'
import { STORE_KEYS, readLook, updateLook } from '../state/atoms'
import { cheerLook } from '../ui/pane/animation'
import { queueNote } from './notes'

/**
 * Changes the look (by a patch, or a function of it), keeps it in the store,
 * has the orchestrator cheer, and queues a note when the name or the
 * personality changed.
 */
export async function changeLook($: Engine, patch: Partial<Look> | ((look: Look) => Look)) {
  cheerLook()
  const before = await readLook($)
  const saved = await updateLook($, look => normalizeLook(typeof patch === 'function' ? patch(look) : { ...look, ...patch }))
  await $.store.set(STORE_KEYS.look, saved)
  // The brief carries only the name and the personality.
  if (saved.name !== before.name || saved.vibe !== before.vibe) await queueNote($)
  return saved
}
