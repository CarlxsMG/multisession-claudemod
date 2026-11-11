// Workers the orchestrator would wait for in vain: one the engine dropped
// while busy, with no end of its run heard, and one that is busy with
// nothing heard from it for a long while. The orchestrator is told of each
// once, in a tool's result or a user message's note.
import type { Silence, Worker } from '../../types'
import { QUIET_MIN } from '../config'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { isOpen } from '../progress/runs'
import { stepText } from '../progress/plan'
import { goneSilent, quietSilent } from '../prompts/results'
import { readDropped, readParents, readRuns, readSilences, readWorkers, updateSilences } from '../state/atoms'
import { ACTIVE } from './workers'

const QUIET_MS = QUIET_MIN * 60_000

/**
 * Notes the busy workers a sync just ended because the engine lists them no
 * more and no end of their run reached the crew: no report will come.
 */
export async function noteGone($: Engine, gone: readonly Worker[], now: number) {
  if (gone.length === 0) return
  const ids = new Set(gone.map(w => w.id))
  await updateSilences($, list => [...list.filter(s => !ids.has(s.id)), ...gone.map((w): Silence => ({ id: w.id, kind: 'gone', since: now }))])
  for (const w of gone) $.ui.toast(t().goneWorker(w.name))
}

/**
 * Notes each busy worker nothing was heard from for `QUIET_MIN` minutes,
 * and forgets the ones heard from since, told or not: a later quiet spell is
 * another one. A worker with a busy agent of its own waits for it, and is
 * not quiet.
 */
export async function watchQuiet($: Engine, now: number) {
  const list = await readWorkers($)
  const parents = await readParents($)
  const busy = new Set(list.filter(w => ACTIVE.has(w.status)).map(w => w.id))
  const waitsForItsOwn = (w: Worker) => parents.some(p => p.parent === w.name && busy.has(p.id))
  const quiet = list.filter(w => busy.has(w.id) && now - w.updatedAt >= QUIET_MS && !waitsForItsOwn(w))
  const heard = (s: Silence) => {
    const w = list.find(x => x.id === s.id)
    return w === undefined || !busy.has(w.id) || w.updatedAt > s.since
  }
  const noted: Worker[] = []
  let isChanged = false
  await updateSilences($, known => {
    noted.length = 0
    const kept = known.filter(s => s.kind !== 'quiet' || !heard(s))
    const fresh = quiet.filter(w => !kept.some(s => s.id === w.id && s.kind === 'quiet'))
    noted.push(...fresh)
    isChanged = fresh.length > 0 || kept.length !== known.length
    return isChanged ? [...kept, ...fresh.map((w): Silence => ({ id: w.id, kind: 'quiet', since: w.updatedAt }))] : known
  })
  for (const w of noted) $.ui.toast(t().quietWorker(w.name, Math.floor((now - w.updatedAt) / 60_000)))
}

// What the orchestrator reads of one, or undefined for a worker the crew has
// no word of any more.
async function wordsOf($: Engine, silences: readonly Silence[], now: number): Promise<{ silence: Silence; text: string }[]> {
  if (silences.length === 0) return []
  const crew = [...(await readWorkers($)), ...(await readDropped($))]
  const runs = await readRuns($)
  return silences.flatMap(silence => {
    const w = crew.find(x => x.id === silence.id)
    if (w === undefined) return []
    if (silence.kind === 'gone') return [{ silence, text: goneSilent(w) }]
    const plan = runs.find(r => r.id === w.id && isOpen(r))?.plan
    const minutes = Math.floor((now - silence.since) / 60_000)
    return [{ silence, text: quietSilent(w, minutes, plan !== undefined ? stepText(plan) : undefined) }]
  })
}

const isSame = (a: Silence, b: Silence) => a.id === b.id && a.kind === b.kind && a.since === b.since

/**
 * Marks them told: a gone worker's leaves the list, a quiet one's stays
 * while the worker stays quiet, so it is not noted again.
 */
export async function markSilentTold($: Engine, told: readonly Silence[]) {
  if (told.length === 0) return
  await updateSilences($, list =>
    list.flatMap(s => {
      if (!told.some(x => isSame(x, s))) return [s]
      return s.kind === 'quiet' ? [{ ...s, isTold: true }] : []
    }),
  )
}

/** The word on the workers no report will come from, or that went quiet, for a tool's result of the main conversation: said once. */
export async function tellSilent($: Engine): Promise<string[]> {
  const untold = (await readSilences($)).filter(s => s.isTold !== true)
  const words = await wordsOf($, untold, await $.clock.now())
  await markSilentTold($, untold)
  return words.map(x => `crew: ${x.text}`)
}

/** The same for a user message's note, with what `markSilentTold` takes once the message went. */
export async function untoldSilent($: Engine): Promise<{ silences: Silence[]; notes: string[] }> {
  const untold = (await readSilences($)).filter(s => s.isTold !== true)
  const words = await wordsOf($, untold, await $.clock.now())
  return { silences: untold, notes: words.map(x => `[crew] ${x.text}`) }
}
