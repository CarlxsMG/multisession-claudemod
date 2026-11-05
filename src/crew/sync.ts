// The crew kept in step with the engine's list of agents.
import type { Worker } from '../../types'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { readDropped, readWorkers, updateDropped, updateWorkers } from '../state/atoms'
import { cap } from '../util/text'
import { enlist } from './feed'
import { release } from './takeover'
import { ACTIVE, FINISHED, STATUS_OF, makeWorker, nextName, prune, shelve } from './workers'

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
        const name = info.name ? cap(info.name) : nextName([...next, ...shelf.values()])
        next.push(
          makeWorker(
            {
              id: info.id,
              name,
              address: info.name ?? info.id,
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

/** The engine's statuses, then the marks they lift. */
export async function syncCrew($: Engine) {
  await quiet($, syncAgents($), 'sync')
  await release($)
}
