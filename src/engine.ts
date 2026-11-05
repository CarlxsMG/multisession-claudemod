// The engine as the crew's helpers take it, every call on `$`.
import type { EngineInterface } from 'claude-code'

import { runtime } from './runtime'

/** The engine every helper takes as `$`. */
export type Engine = EngineInterface

/**
 * `work`'s value, or undefined when it fails: the failure goes to the debug
 * log, named by `where`. For an engine call or a record whose failure must
 * not break the turn or the timer it runs in.
 */
export async function quiet<T>($: Engine, work: Promise<T>, where: string): Promise<T | undefined> {
  try {
    return await work
  } catch (err) {
    $.ui.log(`crew: ${where}: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    return undefined
  }
}

// One line a kind says its wording changed, and the load's later ones add
// nothing.
const logged = runtime.logged

/**
 * Logs to the debug log, once a load for each `kind`, an engine text or
 * answer the crew reads that is in no shape it knows (`detail`, as it
 * came): what reads it falls back, and the line says the wording changed.
 */
export function unrecognized($: Engine, kind: string, detail: string) {
  if (logged.unrecognized.has(kind)) return
  logged.unrecognized.add(kind)
  $.ui.log(`crew: unrecognized ${kind}: ${detail}`, { to: 'debug' })
}
