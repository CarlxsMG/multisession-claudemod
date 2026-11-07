// The title Claude Code's own list of agents shows a crew agent by: its
// task's, after the name the crew calls it, so that list tells the workers
// apart as the pane does. The crew's own records keep the bare title.
import { isWorkerName } from '../persona/names'

// "(Mika) " ahead of a title: the name, and what the title is after it.
const NAMED = /^\(([^()\s]+)\) (.*)$/su

/**
 * The title without a name ahead of it: `name`'s, or with none given any
 * that could be a worker's (an agent from before a reload is known only by
 * the title its spawn left).
 */
export function bareTitle(title: string, name?: string): string {
  const m = NAMED.exec(title)
  if (m === null) return title
  const isNamed = name !== undefined ? m[1]!.toLowerCase() === name.toLowerCase() : isWorkerName(m[1]!)
  return isNamed ? m[2]! : title
}

/** The title with `name` ahead, once: "(Mika) Fix the tests". An empty one stays empty. */
export function namedTitle(name: string, title: string): string {
  const bare = bareTitle(title, name)
  return name === '' || bare === '' ? title : `(${name}) ${bare}`
}
