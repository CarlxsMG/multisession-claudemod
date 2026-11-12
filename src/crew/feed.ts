// What the pane and the conversation's crew rows are drawn from: the
// messages said, the orchestrator's mood, everyone the crew has had, the
// calls of the crew's tools, what each worker was given to do, and what
// each end-of-task row was first drawn with.
import type { LastJob, Member, Msg, MsgTone, NoteFirst, OrchMood } from '../../types'
import { MAIN_ADDRESS } from '../config'
import type { Engine } from '../engine'
import { runtime } from '../runtime'
import { readMembers, readNoteFirst, readOrch, updateCall, updateJobs, updateMembers, updateMessages, updateNoteFirst, updateOrch } from '../state/atoms'
import { appendKept } from '../util/bounded'
import { oneLine } from '../util/text'
import { findWorker } from './workers'

// The newest of each the crew keeps: the messages the pane's feed shows,
// the members and jobs its rows name, and the routes of the workers'
// messages.
const MESSAGES_KEEP = 60
const CAST_KEEP = 120
/** The routes of workers' messages kept, the newest. */
export const ROUTES_KEEP = 60
const NOTE_FIRST_KEEP = 300

// What end-of-task rows drawn since the pane's last frame were first drawn
// with: a drawing may not write the state, so the next frame keeps it.
const firsts = runtime.notes

/** What end-of-task row `id` was first drawn with; undefined before it was. */
export async function firstDrawn($: Engine, id: string): Promise<NoteFirst | undefined> {
  return firsts.held.get(id) ?? (await readNoteFirst($)).find(x => x.id === id)
}

/** What an end-of-task row was first drawn with, held for the pane's next frame (`keepFirstDrawn`). */
export function holdFirstDrawn(first: NoteFirst) {
  firsts.held.set(first.id, first)
}

/** Whether a row's first drawing waits to be kept. */
export const hasHeldFirsts = (): boolean => firsts.held.size > 0

/**
 * Keeps in the state what the rows held were first drawn with, so a row
 * drawn again after a reload names what it named then; one kept already
 * stays as it was.
 */
export async function keepFirstDrawn($: Engine) {
  const taken = [...firsts.held.values()]
  await updateNoteFirst($, list =>
    appendKept(
      list,
      taken.filter(f => !list.some(x => x.id === f.id)),
      NOTE_FIRST_KEEP,
    ),
  )
  for (const f of taken) if (firsts.held.get(f.id) === f) firsts.held.delete(f.id)
}

/** The orchestrator's id in the feed's lines, as the main conversation's address. */
export const ORCH_ID = MAIN_ADDRESS
/** The person's id in the feed's lines: no agent's id or address can be it. */
export const USER_ID = 'user'

/**
 * Someone in a feed line: the name it shows, and the id it is told apart by
 * (`USER_ID` for the person, '' for someone outside the crew).
 */
export type Party = { name: string; id: string }

/** Adds a line to the pane's feed, cut to one line of at most 400 characters. */
export async function say($: Engine, from: Party, to: Party, text: string, tone: MsgTone) {
  const at = await $.clock.now()
  const msg: Msg = { at, from: from.name, to: to.name, fromId: from.id, toId: to.id, text: oneLine(text, 400), tone }
  await updateMessages($, list => appendKept(list, [msg], MESSAGES_KEEP))
}

/** Whether a line's sender (`from`) or recipient is the orchestrator. */
export const isOrchIn = (msg: Msg, side: 'from' | 'to'): boolean => (side === 'from' ? msg.fromId : msg.toId) === ORCH_ID

/** Adds the workers the members list does not know yet, or knows by another name. */
export async function enlist($: Engine, list: readonly Member[]) {
  const known = await readMembers($)
  const fresh = list
    .filter(w => !known.some(m => m.id === w.id && m.name === w.name && m.address === w.address))
    .map(({ id, name, address }) => ({ id, name, address }))
  if (fresh.length === 0) return
  await updateMembers($, ms => appendKept(ms, fresh, CAST_KEEP, m => m.id))
}

/**
 * Marks a call of a crew tool (`id`, its tool_use_id) with the worker the
 * main conversation's reached (`to`): '' until known, and for one that
 * reached no one of the crew or is a worker's own, whose row stays the
 * engine's. A call with no mark is drawn from what its row says, as one
 * from before Claude Code restarted is.
 */
export async function markCall($: Engine, id: string | undefined, to = '') {
  if (!id) return
  await updateCall($, id, () => ({ id, to }))
}

/** What a worker was last given: a task's title, a message's summary. */
export async function setJob($: Engine, id: string, title: string) {
  const job: LastJob = { id, title: oneLine(title, 400) }
  if (job.title === '') return
  await updateJobs($, list => appendKept(list, [job], CAST_KEEP, j => j.id))
}

/** What the crew calls agent `id`: its worker's name, else the name the members list keeps, else the id. */
export const nameOf = (id: string, worker: { name: string } | undefined, members: readonly Member[]): string =>
  worker?.name ?? members.find(m => m.id === id)?.name ?? id

/** A message's summary, else its first line. */
export const gistOf = (summary: unknown, message: unknown): string =>
  typeof summary === 'string' && summary.trim() !== ''
    ? summary
    : (String(message ?? '')
        .split('\n')
        .find(x => x.trim() !== '') ?? '')

/**
 * A SendMessage or TaskStop of the main conversation, marked with the member
 * it reaches, or with none.
 */
export async function markCrewCall($: Engine, id: string | undefined, key: unknown) {
  const w = typeof key === 'string' && key.trim() !== '' ? findWorker(await readMembers($), key) : undefined
  await markCall($, id, w?.id ?? '')
}

/** What a transcript row and a send are matched by. */
export const headOf = (text: string): string => oneLine(text, 160)

/**
 * Sets the orchestrator's mood and what it is doing. A new mood starts now;
 * the same one keeps its start, so its line stays up its while. When
 * neither changes nothing is written, and the pane does not draw again.
 */
export async function setOrch($: Engine, mood: OrchMood, activity: string) {
  const orch = await readOrch($)
  if (orch.mood === mood && orch.activity === activity) return
  const now = await $.clock.now()
  await updateOrch($, o => (o.mood === mood ? { ...o, activity } : { mood, activity, since: now }))
}
