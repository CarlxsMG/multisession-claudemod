// The crew kept in step with the engine's list of agents.
import type { Worker } from '../../types'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { readDropped, readWorkers, updateDropped, updateWorkers } from '../state/atoms'
import { enlist } from './feed'
import { release } from './takeover'
import { ACTIVE, FINISHED, STATUS_OF, claimName, makeWorker, prune, shelve, takenNames, takenNow } from './workers'

/** Takes the workers that finished off the list, onto the shelf. */
export async function clearFinished($: Engine) {
  const gone = (await readWorkers($)).filter(w => FINISHED.has(w.status))
  await shelve($, gone)
  const ids = new Set(gone.map(w => w.id))
  await updateWorkers($, list => list.filter(w => !ids.has(w.id)))
}

/**
 * Brings statuses in line with the engine's own list, and adopts agents
 * started before the mod loaded. One taken off the list stays off until it
 * works again, and then comes back as it was.
 */
export async function syncAgents($: Engine) {
  const infos = await $.agent.list()
  const list = await readWorkers($)
  const shelf = new Map((await readDropped($)).map(w => [w.id, w]))
  const changed = infos.filter(info => {
    const w = list.find(x => x.id === info.id)
    if (w !== undefined) return w.status !== (STATUS_OF[info.status] ?? w.status)
    return !shelf.has(info.id) || ACTIVE.has(STATUS_OF[info.status] ?? 'working')
  })
  if (changed.length === 0) return
  // A stranger takes a name no other member has, the engine's when that
  // fits, which stays its address unless another member has it.
  const strangers = changed.filter(info => !list.some(w => w.id === info.id) && !shelf.has(info.id))
  const taken = strangers.length > 0 ? await takenNow($, list) : new Set<string>()
  const named = new Map(strangers.map(info => [info.id, nameOf(taken, info)] as const))
  const now = await $.clock.now()
  const cwd = await $.session.cwd()
  const back = new Set<string>()
  const out: Worker[] = []
  const saved = await updateWorkers($, current => {
    back.clear()
    out.length = 0
    const next = [...current]
    for (const info of changed) {
      const status = STATUS_OF[info.status] ?? 'working'
      const at = next.findIndex(w => w.id === info.id)
      const kept = shelf.get(info.id)
      if (at >= 0) {
        next[at] = { ...next[at]!, status, updatedAt: now }
      } else if (kept !== undefined) {
        back.add(info.id)
        next.push({ ...kept, status, updatedAt: now })
      } else {
        const { name, address } = named.get(info.id) ?? nameOf(takenNames([...next, ...shelf.values()]), info)
        next.push(
          makeWorker(
            {
              id: info.id,
              name,
              address,
              task: info.description,
              type: info.type,
              cwd,
              status,
              model: '',
              asked: null,
            },
            now,
          ),
        )
      }
    }
    return prune(next, out)
  })
  if (back.size > 0) await updateDropped($, list => list.filter(w => !back.has(w.id)))
  await shelve($, out)
  await enlist($, saved)
}

// The name and address an agent the crew did not start takes.
function nameOf(taken: ReadonlySet<string>, info: { id: string; name?: string }): { name: string; address: string } {
  const claim = claimName(taken, info.name || undefined)
  return { name: claim.name, address: info.name && claim.isWantedFree ? info.name : info.id }
}

/** The engine's statuses, then the marks they lift. */
export async function syncCrew($: Engine) {
  await quiet($, syncAgents($), 'sync')
  await release($)
}
