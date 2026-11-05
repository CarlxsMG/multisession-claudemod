// The orchestrator's personalities: what the model is told each one is, by
// the key a look stores. Its name in the editor and the lines its figure
// says until Haiku has written its own are the UI's words (`t().vibes`).
import type { Look } from '../../types'
import { t } from '../i18n'
import type { Messages } from '../i18n/en'

/** The personalities a look can have, by key: how the model is told to talk. */
export const VIBES: Record<string, { prompt: string }> = {
  cheerful: { prompt: 'cheerful and encouraging, a warm teammate' },
  zen: { prompt: 'calm and serene, never rushed' },
  pirate: { prompt: 'a jolly pirate captain (a light "arr" now and then, never in code or technical text)' },
  boss: { prompt: 'a crisp, decisive team lead' },
  geek: { prompt: 'a playful geek who loves nerdy references' },
  granny: { prompt: 'a sweet, caring grandma who still knows her stuff' },
}

/** A personality: how the model is told to talk, its name and its lines by mood. */
export type Vibe = { prompt: string; label: string; lines: Record<string, readonly string[]> }

/** A look's personality, the cheerful one for a key no personality has. */
export function vibeOf(look: Pick<Look, 'vibe'>): Vibe {
  const key = (Object.hasOwn(VIBES, look.vibe) ? look.vibe : 'cheerful') as keyof Messages['vibes']
  return { prompt: VIBES[key]!.prompt, ...t().vibes[key] }
}
