// The files each busy worker's run has edited: what a delegate result's
// heads-up names, and the word a worker reads when it edits a file another
// worker's run in flight has edited. Only the editing tools are seen: a file
// changed through the shell is not, so no overlap named is not none there.
import type { Engine } from '../engine'
import { heldEdits } from '../progress/calls'
import { isOpen } from '../progress/runs'
import { sameFile } from '../prompts/worker'
import { runtime } from '../runtime'
import { readMembers, readRuns, readWorkers } from '../state/atoms'
import { appendKept } from '../util/bounded'
import { samePath } from '../util/path'

// The pairs of workers and files a word was said of in this load, the
// latest: a worker hears of each once.
const told = runtime.edits
const TOLD_KEEP = 300

/**
 * The files each worker's open run has edited so far, by the worker's id, in
 * the order it first edited them: what the runs keep, and the edits held
 * for the next write of the workers' calls.
 */
export async function editsInFlight($: Engine): Promise<Map<string, string[]>> {
  const edits = new Map<string, string[]>()
  for (const run of await readRuns($)) if (isOpen(run) && run.edited !== undefined) edits.set(run.id, [...run.edited])
  for (const [id, paths] of heldEdits()) {
    const known = edits.get(id) ?? []
    edits.set(id, [...known, ...paths.filter(path => !known.some(k => samePath(k, path)))])
  }
  return edits
}

/**
 * What the worker `id` reads after it edited `path`, when another worker's
 * run in flight has edited that file: who, and to settle it between them.
 * Undefined when no other has, or when it heard of that worker and file
 * before.
 */
export async function overlapNote($: Engine, id: string, path: string): Promise<string | undefined> {
  const others = [...(await editsInFlight($))].filter(([other, paths]) => other !== id && paths.some(p => samePath(p, path)))
  if (others.length === 0) return undefined
  const members = [...(await readWorkers($)), ...(await readMembers($))]
  for (const [other] of others) {
    if (told.warned.some(w => w.id === id && w.other === other && samePath(w.path, path))) continue
    const who = members.find(m => m.id === other)
    if (who === undefined) continue
    told.warned = appendKept(told.warned, [{ id, other, path }], TOLD_KEEP)
    return sameFile(who.name, who.address, path)
  }
  return undefined
}
