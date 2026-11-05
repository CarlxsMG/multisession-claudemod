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
