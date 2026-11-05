// The lines Haiku writes for the orchestrator's personality, asked for from
// the timer.
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { linesPrompt, linesSig, parseMoodLines } from '../persona/lines'
import { STORE_KEYS, readLook, readMoodLines, readView, updateMoodLines } from '../state/atoms'

// A batch is some sixty short lines; one Haiku has not written by then is
// asked for again in another session.
const LINES_MAX_TOKENS = 900
const LINES_TIMEOUT_MS = 30_000

// The personality Haiku is writing lines for now, and one it could not:
// neither is asked for again in this session.
let writingSig = ''
let failedSig = ''

/**
 * Has Haiku write a batch of lines for the current personality, once: the
 * batch is kept across sessions and only a new name, phrase or personality
 * asks for another. Never while the person is still editing it.
 */
export async function ensureLines($: Engine) {
  if ((await readView($)) === 'edit') return
  const look = await readLook($)
  const sig = linesSig(look)
  if (sig === writingSig || sig === failedSig || (await readMoodLines($)).sig === sig) return
  writingSig = sig
  const ask = { model: 'haiku', prompt: linesPrompt(look), maxTokens: LINES_MAX_TOKENS, effort: 'low', timeoutMs: LINES_TIMEOUT_MS } as const
  const reply = await quiet($, $.model.complete(ask), 'mood lines')
  writingSig = ''
  const moods = reply?.isAnswered ? parseMoodLines(reply.text) : undefined
  if (moods === undefined) {
    failedSig = sig
    return
  }
  // Lines for a personality changed meanwhile are left unused.
  if (linesSig(await readLook($)) !== sig) return
  const saved = await updateMoodLines($, () => ({ sig, moods }))
  await $.store.set(STORE_KEYS.lines, saved)
}
