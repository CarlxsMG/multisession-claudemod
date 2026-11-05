// The colours of names: the orchestrator's as its look sets it, and each
// worker's accent, never the orchestrator's.
import type { Look, Worker } from '../../types'
import { NAME_COLORS } from './catalog'
import { paintColor } from './color256'

// Workers' names take the accents the orchestrator's can.
const ACCENTS = NAME_COLORS.slice(1).map(([, c]) => c)

const nameColor = (look: Look): string => NAME_COLORS[look.nameColor]?.[1] ?? 'claude'
/** The orchestrator's name color, as the pane paints it. */
export const nameColorOf = (look: Look): string => paintColor(nameColor(look))

// A worker's color, never the one the orchestrator's name took: as written,
// and as the pane paints it.
export const accentHex = (w: Pick<Worker, 'seed'>, look: Look): string => {
  const free = ACCENTS.filter(c => c !== nameColor(look))
  return free[w.seed % free.length]!
}
export const accentOf = (w: Pick<Worker, 'seed'>, look: Look): string => paintColor(accentHex(w, look))
