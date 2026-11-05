// The crew's part in every spawn: the worker it puts on the list, and what
// its agent hears first, where it works and on which model.
import type { HookFor } from 'claude-code'

import type { ParentLink, Worker } from '../../types'
import type { Engine } from '../engine'
import { modelAlias } from '../model-label'
import { beginRun, settleRun } from '../progress/tracker'
import { forkPreamble, gitRules, workerPreamble } from '../prompts/worker'
import {
  readDropped,
  readIsOn,
  readLook,
  readWorkers,
  readWorktrees,
  updateParents,
  updateWorkers,
  updateWorktrees,
} from '../state/atoms'
import { samePath } from '../util/path'
import { cap, oneLine } from '../util/text'
import { freeName, intended } from './delegate'
import { ORCH_ID, enlist, say, setJob } from './feed'
import { FINISHED, findWorker, makeWorker, patchWorker, prune, shelve, unshelve } from './workers'

/**
 * The Agent calls that asked for a worktree, by tool_use_id: their agent
 * works there, not in the repository the worktree was made from.
 */
export const isolated = new Set<string>()

type OnSpawnHook = HookFor<'agent.spawn'>
/**
 * Puts each agent the session starts on the crew's list, with the crew's
 * brief ahead of its prompt, and runs one delegate meant where delegate
 * meant it to.
 */
export async function onSpawn($: Engine, e: Parameters<OnSpawnHook>[1], next: Parameters<OnSpawnHook>[2]) {
  if (e.workflow !== undefined) return next(e)
  if (e.resume !== undefined) {
    // A resumed agent had ended, whatever the crew's record of it says.
    const id = e.resume.agentId
    const was = findWorker([...(await readWorkers($)), ...(await readDropped($))], id)
    await settleRun($, { id, status: was !== undefined && FINISHED.has(was.status) ? was.status : 'done' })
    const resumed = await next(e)
    await unshelve($, e.resume.agentId)
    await patchWorker($, e.resume.agentId, () => ({ status: 'working' }))
    await beginRun($, e.resume.agentId)
    return resumed
  }
  const look = await readLook($)
  const list = await readWorkers($)
  const sessionCwd = await $.session.cwd()
  // Only a worker `delegate` started, or handed to the orchestrator to
  // start, is the crew's to hand more work to.
  const byPrompt = e.name === undefined && !e.fork ? [...intended].find(([, m]) => m.task === e.prompt.trim()) : undefined
  const key = e.name?.toLowerCase() ?? byPrompt?.[0]
  const intent = key !== undefined ? intended.get(key) : undefined
  const isCrew = intent !== undefined && !e.fork
  // A worker's own spawn reports to it, and runs where it does.
  const parent = e.parentAgentId !== undefined ? list.find(w => w.id === e.parentAgentId) : undefined
  const reportsTo = parent?.name ?? look.name
  const cwd = e.cwd ?? intent?.cwd ?? parent?.cwd ?? sessionCwd
  if (key !== undefined) intended.delete(key)
  const given = e.name ?? key
  const name = given !== undefined ? cap(given) : await freeName($, list)
  const inWorktree = new Set(await readWorktrees($))
  // Its own worktree, or the one of the worker that starts it, where it
  // starts too unless the call sends it elsewhere.
  const own = isolated.delete(e.tool_use_id)
  const shared = !own && e.cwd === undefined && parent !== undefined && inWorktree.has(parent.id)
  const worktree = own || shared
  // Delegate's workers hear the crew's preamble in either mode; with
  // delegation off, the Agent tool's agents start as they were asked.
  const briefed = isCrew || (await readIsOn($))
  const prompt = !briefed
    ? e.prompt
    : e.fork
      ? forkPreamble(reportsTo, e.parentAgentId === undefined ? gitRules(cwd, name.toLowerCase()) : '') + e.prompt
      : workerPreamble(name, look.name, reportsTo, cwd, list, own ? 'own' : shared ? 'parent' : undefined, inWorktree) + e.prompt
  // A crew worker runs on the session's model, even of a type whose own
  // definition names another. The Agent tool's `model` takes an alias only,
  // so the session's id goes as its family; one that names none is left to
  // the agent's definition.
  const inherited = intent !== undefined && !e.model ? modelAlias(e.parentModel) : undefined
  const model = inherited !== undefined ? { model: inherited } : {}
  // One the orchestrator started for delegate runs where delegate meant it
  // to, which its Agent call cannot say, and in the background as
  // delegate's own do.
  const intendedRun = isCrew && intent.task !== undefined
    ? { background: true, ...(e.cwd === undefined && !samePath(cwd, sessionCwd) ? { cwd } : {}) }
    : {}
  const started = await next({ ...e, prompt, ...model, ...intendedRun })
  if (started.agentId === undefined) return started
  const id = started.agentId
  const now = await $.clock.now()
  const task = e.description || oneLine(e.prompt, 60)
  const out: Worker[] = []
  const saved = await updateWorkers($, current => {
    out.length = 0
    const known = current.find(w => w.id === id)
    const fields = {
      name,
      address: e.name ?? id,
      task,
      // Spelled as delegate was asked, which its reuse compares with.
      type: intent?.type || e.subagentType || '',
      cwd,
      model: started.model ?? '',
      asked: isCrew ? (e.model ?? '') : null,
    }
    return known !== undefined
      ? current.map(w => (w.id === id ? { ...w, ...fields, status: 'starting' as const } : w))
      : prune([...current, makeWorker({ id, status: 'starting', ...fields }, now)], out)
  })
  await shelve($, out)
  await enlist($, saved)
  // Forks too; the marks of workers gone for good go, those of the shelf stay.
  const kept = new Set([...saved, ...(await readDropped($))].map(w => w.id))
  await updateWorktrees($, ids => [...ids.filter(x => x !== id && kept.has(x)), ...(worktree ? [id] : [])])
  const mine: ParentLink[] = parent ? [{ id, parent: parent.name, fork: e.fork }] : []
  await updateParents($, ps => [...ps.filter(x => x.id !== id && kept.has(x.id)), ...mine])
  await say($, { name: reportsTo, id: parent?.id ?? ORCH_ID }, { name, id }, task, parent ? 'worker' : 'orch')
  await setJob($, id, task)
  await beginRun($, id)
  return started
}
