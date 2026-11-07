// The name of the worker that started a background shell or Monitor, ahead
// of its description, so Claude Code's own list of what runs tells whose it
// is, as it does for the crew's agents. The crew's registry of background
// tasks records the call as the model sent it, bare.
import type { Engine } from '../engine'
import { readWorkers } from '../state/atoms'
import { oneLine } from '../util/text'
import { namedTitle } from './title'

// How much of the command stands in for a description the call left out.
const COMMAND_GIST = 40

type ShellCall = { tool: string; agentId?: string; command?: string; description?: string; run_in_background?: boolean }

/**
 * Whether the call leaves a task in Claude Code's list of what runs: a
 * Bash or PowerShell call run in the background, or any Monitor.
 */
export function isListedCall(e: ShellCall): boolean {
  return e.tool === 'Monitor' || ((e.tool === 'Bash' || e.tool === 'PowerShell') && e.run_in_background === true)
}

/**
 * The description `name`'s call shows in that list: its own, or a short
 * form of its command when it has none, with the name ahead once.
 */
export function shellTitle(name: string, description: string | undefined, command: string | undefined): string {
  const own = typeof description === 'string' ? description.trim() : ''
  const title = own !== '' ? own : oneLine(typeof command === 'string' ? command : '', COMMAND_GIST)
  return namedTitle(name, title)
}

/**
 * Passes on a worker's background shell or Monitor with its name ahead of
 * the description; the main conversation's calls, a foreground shell and an
 * agent the crew does not follow go on as they are.
 */
export async function nameShell<E extends ShellCall, R>($: Engine, e: E, next: (e: E) => R | Promise<R>): Promise<R> {
  if (e.agentId === undefined || !isListedCall(e)) return next(e)
  const worker = (await readWorkers($)).find(w => w.id === e.agentId)
  if (worker === undefined) return next(e)
  const description = shellTitle(worker.name, e.description, e.command)
  return next(description === '' || description === e.description ? e : { ...e, description })
}
