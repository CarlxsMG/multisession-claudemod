// What the orchestrator's model reads: the brief in its system prompt, and
// the note a message carries when the settings changed.
import type { HookFor } from 'claude-code'

import { ORCH_ID, USER_ID, say } from '../crew/feed'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { crewNote } from '../prompts/orchestrator'
import { heldMissedNote } from '../prompts/results'
import { checkConversation, freezeBrief, sameSettings, saveTold, sessionKey } from '../settings/notes'
import { readBrief, readLook, readPendingNote, readTakeovers, readWorkers, updatePendingNote, updateTakeovers } from '../state/atoms'
import { unwrapPasted } from '../util/text'

type ComposePromptHook = HookFor<'prompt.compose'>
/**
 * Adds the orchestrator's brief to the main conversation's system prompt, as
 * this load froze it.
 */
export async function composePrompt($: Engine, e: Parameters<ComposePromptHook>[1], next: Parameters<ComposePromptHook>[2]) {
  const composed = await next(e)
  if (e.traits.includes('teammate')) return composed
  const text = (await readBrief($)) || (await freezeBrief($))
  return { sections: [...composed.sections, { id: 'crew:orchestrator', text, scope: 'session' as const }] }
}

type OnSubmitHook = HookFor<'prompt.submit'>
/** Puts the user's message in the feed, and sends the pending "[crew]" notes with it. */
export async function onSubmit($: Engine, e: Parameters<OnSubmitHook>[1], next: Parameters<OnSubmitHook>[2]) {
  if (e.origin.kind !== 'composer' || e.command !== undefined || e.isMeta) return next(e)
  if (e.text.trim()) await say($, { name: t().user, id: USER_ID }, { name: (await readLook($)).name, id: ORCH_ID }, unwrapPasted(e.text), 'user')
  // After a /clear or a resume the conversation is another one.
  await checkConversation($)
  const pending = await readPendingNote($)
  // Held tasks that did not reach their worker while no crew tool was called
  // to say so: the orchestrator still waits for that worker's report.
  const missed = (await readTakeovers($)).filter(mark => mark.missed !== undefined && mark.isTold !== true)
  if (pending === null && missed.length === 0) return next(e)
  const workers = await readWorkers($)
  const missedNotes = missed.map(m =>
    heldMissedNote(workers.find(w => w.id === m.id) ?? { name: m.id, address: m.id }, m.held.length, m.missed ?? ''),
  )
  // Context is attached on the way down; the text stays the user's.
  const notes = [...(pending !== null ? [crewNote(pending)] : []), ...missedNotes]
  const entered = await next({ ...e, context: [...(e.context ?? []), ...notes] })
  if (entered.drop !== undefined) return entered
  if (missed.length > 0) {
    const told = new Set(missed.map(m => m.id))
    await updateTakeovers($, list => list.map(mark => (told.has(mark.id) ? { ...mark, isTold: true } : mark)))
  }
  if (pending === null) return entered
  await updatePendingNote($, n => (n !== null && sameSettings(n, pending) ? null : n))
  await saveTold($, await sessionKey($), pending)
  return entered
}
