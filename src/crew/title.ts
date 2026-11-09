// The title Claude Code's own list of agents shows a crew agent by: its
// task's, after the name the crew calls it, so that list tells the workers
// apart as the pane does. The crew's own records keep the bare title.
import { WORKER_NAMES, isWorkerName } from '../persona/names'

// "(Mika) " ahead of a title: the name, and what the title is after it.
const NAMED = /^\(([^()\s]+)\) (.*)$/su
const POOL = new Set(WORKER_NAMES.map(n => n.toLowerCase()))

/**
 * The title without the names ahead of it: `name`'s, a crew member's of
 * `crew` (lowercase) or one of the pool's, or with no name given any that
 * could be a worker's (an agent from before a reload is known only by the
 * title its spawn left). Models copy the named titles they see into the next
 * they write, another worker's name ahead included, so every such name goes.
 */
export function bareTitle(title: string, name?: string, crew: ReadonlySet<string> = new Set()): string {
  let rest = title
  for (let m = NAMED.exec(rest); m !== null; m = NAMED.exec(rest)) {
    const ahead = m[1]!.toLowerCase()
    const isNamed = name !== undefined ? ahead === name.toLowerCase() || crew.has(ahead) || POOL.has(ahead) : isWorkerName(m[1]!)
    if (!isNamed) break
    rest = m[2]!
  }
  return rest
}

/** The name ahead of a title, in lowercase: "mika" for "(Mika) Fix the tests"; undefined for a bare one. */
export const nameAhead = (title: string): string | undefined => NAMED.exec(title)?.[1]?.toLowerCase()

/**
 * The title with `name` ahead, once, in place of any crew name ahead of it
 * (see `bareTitle`): "(Mika) Fix the tests". An empty one stays empty.
 */
export function namedTitle(name: string, title: string, crew: ReadonlySet<string> = new Set()): string {
  const bare = bareTitle(title, name, crew)
  return name === '' || bare === '' ? title : `(${name}) ${bare}`
}
