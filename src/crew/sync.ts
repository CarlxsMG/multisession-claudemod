// The crew kept in step with the engine's list of agents.
import type { AgentInfo } from 'claude-code'

import type { Worker, WorkerStatus } from '../../types'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { readDropped, readRuns, readWorkers, updateDropped, updateWorkers } from '../state/atoms'
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

// The agents the engine has listed in this load.
const everListed = new Set<string>()

// How long a busy worker the engine lists no more has been quiet when its
// end, which never reached the crew, is taken for granted.
const GONE_MS = 60_000

// Whether the engine's status would wake a worker the crew saw finish. It
// does not: the engine ends an agent a while after its last turn (seconds,
// or until background work it owns is over) and then drops it from its
// list, so a busy status read meanwhile would outlive the agent. What does
// wake one (a message, a resume, a turn's start, a tool call) has a hook.
const isRevived = (w: Worker, status: WorkerStatus) => FINISHED.has(w.status) && ACTIVE.has(status)

/**
 * How each busy worker the engine lists no more, and nothing was heard
 * from for `GONE_MS`, ended: as its run did, else stopped once the engine
 * had listed it. The progress tick closes a run left open.
 */
async function goneEnds($: Engine, list: readonly Worker[], infos: readonly AgentInfo[], now: number) {
  const here = new Set(infos.map(info => info.id))
  const quietOnes = list.filter(w => ACTIVE.has(w.status) && !here.has(w.id) && now - w.updatedAt >= GONE_MS)
  const ends = new Map<string, WorkerStatus>()
  if (quietOnes.length === 0) return ends
  const runs = await readRuns($)
  for (const w of quietOnes) {
    const end = runs.find(r => r.id === w.id)?.end || (everListed.has(w.id) ? 'stopped' : '')
    if (end !== '') ends.set(w.id, end)
  }
  return ends
}

/**
 * Brings statuses in line with the engine's own list, and adopts agents
 * started before the mod loaded. One taken off the list stays off until it
 * works again, and then comes back as it was. A busy one the engine dropped
 * takes its end (see goneEnds).
 */
export async function syncAgents($: Engine) {
  const infos = await $.agent.list()
  for (const info of infos) everListed.add(info.id)
  const list = await readWorkers($)
  const shelf = new Map((await readDropped($)).map(w => [w.id, w]))
  const changed = infos.filter(info => {
    const w = list.find(x => x.id === info.id)
    if (w !== undefined) {
      const status = STATUS_OF[info.status] ?? w.status
      return w.status !== status && !isRevived(w, status)
    }
    return !shelf.has(info.id) || ACTIVE.has(STATUS_OF[info.status] ?? 'working')
  })
  const now = await $.clock.now()
  const ends = await goneEnds($, list, infos, now)
  if (changed.length === 0 && ends.size === 0) return
  // A stranger takes a name no other member has, the engine's when that
  // fits, which stays its address unless another member has it.
  const strangers = changed.filter(info => !list.some(w => w.id === info.id) && !shelf.has(info.id))
  const taken = strangers.length > 0 ? await takenNow($, list) : new Set<string>()
  const named = new Map(strangers.map(info => [info.id, nameOf(taken, info)] as const))
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
        // Its end may have come since the list was read.
        if (!isRevived(next[at]!, status)) next[at] = { ...next[at]!, status, updatedAt: now }
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
    for (const [id, end] of ends) {
      const at = next.findIndex(w => w.id === id)
      const w = next[at]
      // Heard from since the list was read: not gone.
      if (w === undefined || !ACTIVE.has(w.status) || now - w.updatedAt < GONE_MS) continue
      next[at] = { ...w, status: end, activity: '', updatedAt: now }
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
