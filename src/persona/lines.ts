// What the orchestrator says beside its figure: the personality's fixed lines
// plus a batch Haiku writes once per personality, picked so a mood keeps its
// line for a while and the next mood says something else.
import type { Look } from '../../types'
import { LANGUAGE_NAME, localeNow } from '../i18n/locale'
import { hash } from '../util/random'
import { flat } from '../util/text'
import { vibeOf } from './vibes'

const MOODS = ['idle', 'thinking', 'working', 'delegating', 'happy', 'sleep'] as const

/** Lines by mood. */
export type Moods = Record<string, string[]>

// A line stays up this long before the next one of the same mood.
const ROTATE_MS = 25_000
const MAX_CHARS = 32

/** Which personality a batch was written for, and in which language. */
export const linesSig = (look: Look): string => `${localeNow()}|${look.name}|${look.vibe}|${look.phrase}`

/** What Haiku is asked for, for a batch of lines in the voice of a look. */
export function linesPrompt(look: Look): string {
  const vibe = vibeOf(look)
  return `Write short status lines in ${LANGUAGE_NAME[localeNow()]} for ${look.name}, a pixel-art mascot who is ${vibe.prompt}. Its catchphrase: "${look.phrase}".
Moods: idle (waiting for the user), thinking, working (doing a task itself), delegating (handing a task to a teammate called {w}: every delegating line must contain {w}), happy (a task just finished), sleep (idle for a long time).
Write 8 lines per mood, each at most ${MAX_CHARS - 4} characters, varied and in character, no emoji, no quotation marks.
Reply with JSON only: {"idle":[...],"thinking":[...],"working":[...],"delegating":[...],"happy":[...],"sleep":[...]}`
}

/** The reply's lines by mood, or undefined when it holds none to use. */
export function parseMoodLines(text: string): Moods | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const moods: Moods = {}
  for (const mood of MOODS) {
    const list = (raw as Record<string, unknown>)[mood]
    moods[mood] = (Array.isArray(list) ? list : [])
      .filter((x): x is string => typeof x === 'string')
      .map(flat)
      .filter(x => x !== '' && x.length <= MAX_CHARS && (mood !== 'delegating' || x.includes('{w}')))
      .slice(0, 10)
  }
  return MOODS.some(m => moods[m]!.length > 0) ? moods : undefined
}

/**
 * The line a figure says in a mood: its personality's and Haiku's, its
 * catchphrase most while idle, another every `ROTATE_MS`.
 */
export function pickLine(look: Look, mood: string, since: number, now: number, crewmate: string, extra: Moods): string {
  const vibe = vibeOf(look)
  const pool = [...(vibe.lines[mood] ?? []), ...(extra[mood] ?? [])]
  // The person's own catchphrase comes up most while idle.
  if (mood === 'idle') pool.unshift(look.phrase, look.phrase, look.phrase)
  if (pool.length === 0) return look.phrase
  const turn = Math.floor(Math.max(0, now - since) / ROTATE_MS)
  return pool[(hash(`${since}|${mood}`) + turn) % pool.length]!.replace('{w}', crewmate)
}
