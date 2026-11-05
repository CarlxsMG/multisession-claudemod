// The crew's settings as the orchestrator's model hears of them: delegation
// on or off, the brief this load froze, and the "[crew]" note a change
// queues for the next user message, kept per conversation in the store.
import type { CrewSettings, Look } from '../../types'
import type { Engine } from '../engine'
import { orchestratorPrompt } from '../prompts/orchestrator'
import { runtime } from '../runtime'
import { STORE_KEYS, readBrief, readIsOn, readLook, updateBrief, updateIsOn, updatePendingNote } from '../state/atoms'
import { setKept } from '../util/bounded'

/** Turns delegation on or off, keeps it in the store, and queues a note when it changed. */
export async function setMode($: Engine, value: boolean) {
  const was = await readIsOn($)
  await updateIsOn($, () => value)
  await $.store.set(STORE_KEYS.isOn, value)
  if (value !== was) await queueNote($)
}

/**
 * A changed tool description or prompt section rewrites the whole prompt
 * cache, so both keep the brief this load froze; later changes reach the
 * model as one note beside the user's next message, with the latest state.
 */
export async function freezeBrief($: Engine): Promise<string> {
  const text = orchestratorPrompt(await readLook($), await readIsOn($))
  await updateBrief($, () => text)
  return text
}

const settingsOf = (look: Look, on: boolean): CrewSettings => ({ on, name: look.name, vibe: look.vibe })

/** Whether two notes tell the same. */
export const sameSettings = (a: CrewSettings, b: CrewSettings): boolean => a.on === b.on && a.name === b.name && a.vibe === b.vibe

const isCrewSettings = (x: unknown): x is CrewSettings => {
  const settings = x as Partial<CrewSettings> | null
  return typeof settings?.on === 'boolean' && typeof settings.name === 'string' && typeof settings.vibe === 'string'
}

/** Has the next user message carry a note with the settings as they are. */
export async function queueNote($: Engine) {
  const told = settingsOf(await readLook($), await readIsOn($))
  await updatePendingNote($, () => told)
}

// The last note each conversation got, by session id: a conversation reads
// only its own, so one resumed is told what changed since its last note, and
// a new one is told nothing its brief already says. The store keeps it for
// this many conversations.
const TOLD_KEEP = 100

/** The conversation's id, which its last note is kept by ('' when unknown). */
export function sessionKey($: Engine): Promise<string> {
  return $.session.id().catch(() => '')
}

async function toldMap($: Engine): Promise<Record<string, unknown>> {
  const stored = await $.store.get(STORE_KEYS.toldBy)
  return typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {}
}

/** Keeps the note conversation `id` was last told. */
export async function saveTold($: Engine, id: string, told: CrewSettings) {
  const map = new Map(Object.entries(await toldMap($)))
  setKept(map, id, told, TOLD_KEEP)
  await $.store.set(STORE_KEYS.toldBy, Object.fromEntries(map))
}

// The conversation the last check was for: a new id (a start, a resume, a
// /clear) is checked once against what that conversation was last told, or,
// never told, against the brief it reads.
const checks = runtime.told

/** `isLoad`: checked again on a load, whatever the last check was for. */
export async function checkConversation($: Engine, isLoad = false) {
  const id = await sessionKey($)
  if (!isLoad && id === checks.checked) return
  checks.checked = id
  const told = (await toldMap($))[id]
  const look = await readLook($)
  const on = await readIsOn($)
  const stale = isCrewSettings(told) ? !sameSettings(told, settingsOf(look, on)) : orchestratorPrompt(look, on) !== (await readBrief($))
  if (stale) await queueNote($)
}
