// The engine as the crew's helpers take it, every call on `$`.
import type { EngineInterface } from 'claude-code'

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
