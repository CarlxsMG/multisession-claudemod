// The UI's words in the locale it speaks now. Read them at the moment they
// show, never into a module constant: the locale settles once the session
// starts.
import { en } from './en'
import type { Messages } from './en'
import { es } from './es'
import { localeNow } from './locale'

const TABLES: Record<ReturnType<typeof localeNow>, Messages> = { en, es }

/** The UI's words in the locale it speaks now. */
export const t = (): Messages => TABLES[localeNow()]

/** A `/crew` verb, as the code names it. */
export type Verb = keyof Messages['command']['verbs']

/**
 * The verb a word typed after `/crew` names, in any locale's words: a
 * person may type the verbs of the language they think in.
 */
export function verbOf(word: string): Verb | undefined {
  const typed = word.toLowerCase()
  for (const words of Object.values(TABLES)) {
    for (const [verb, said] of Object.entries(words.command.verbs)) if (said.includes(typed)) return verb as Verb
  }
  return undefined
}

/** The units `/crew progress` takes after its minutes, in every locale's words. */
export const minuteUnits = (): string[] => [...new Set(Object.values(TABLES).flatMap(words => words.command.minutes))]
