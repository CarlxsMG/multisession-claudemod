// A look: the orchestrator's default, one read from the store or a share
// code made whole, and a random one.
import type { Look } from '../../types'
import { t } from '../i18n'
import { VIBES } from '../persona/vibes'
import { pick, rng } from '../util/random'
import { ACCS, ALL_COLORS, COLORS, EYES, FACIALS, HAIR_COLORS, HAIRS, MOUTHS, NAME_COLORS, SHIRTS, SKINS } from './catalog'

/** The orchestrator's look until the user makes one; `defaultLook` gives its phrase in the UI's language. */
export const DEFAULT_LOOK: Look = {
  name: 'Nova',
  nameColor: 0,
  phrase: 'Let’s go!',
  vibe: 'cheerful',
  skin: 3,
  hair: 'short',
  hairColor: 10,
  facial: 'none',
  eyes: 'shine',
  mouth: 'smile',
  blush: true,
  shirt: 'hoodie',
  shirtColor: 5,
  pants: 10,
  shoes: 10,
  acc: 'none',
  accColor: 14,
}

/** The default look, its catchphrase in the language the UI speaks now. */
export const defaultLook = (): Look => ({ ...DEFAULT_LOOK, phrase: t().defaultPhrase })

// A table's own key only: a share code is anyone's text, and `constructor` or
// `__proto__` is in every object.
const oneOf = (table: Record<string, unknown>, value: unknown, fallback: string): string =>
  typeof value === 'string' && Object.hasOwn(table, value) ? value : fallback

const indexIn = (list: readonly unknown[], value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < list.length
    ? value
    : fallback

const text = (value: unknown, fallback: string, max: number): string =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : fallback

/** Fills in and clamps a look read from the store or a share code. */
export function normalizeLook(raw: unknown): Look {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const d = defaultLook()
  return {
    name: text(r.name, d.name, 16),
    nameColor: indexIn(NAME_COLORS, r.nameColor, d.nameColor),
    phrase: text(r.phrase, d.phrase, 60),
    vibe: oneOf(VIBES, r.vibe, d.vibe),
    skin: indexIn(SKINS, r.skin, d.skin),
    hair: oneOf(HAIRS, r.hair, d.hair),
    hairColor: indexIn(COLORS, r.hairColor, d.hairColor),
    facial: oneOf(FACIALS, r.facial, d.facial),
    eyes: oneOf(EYES, r.eyes, d.eyes),
    mouth: oneOf(MOUTHS, r.mouth, d.mouth),
    blush: typeof r.blush === 'boolean' ? r.blush : d.blush,
    shirt: oneOf(SHIRTS, r.shirt, d.shirt),
    shirtColor: indexIn(COLORS, r.shirtColor, d.shirtColor),
    pants: indexIn(COLORS, r.pants, d.pants),
    shoes: indexIn(COLORS, r.shoes, d.shoes),
    acc: oneOf(ACCS, r.acc, d.acc),
    accColor: indexIn(COLORS, r.accColor, d.accColor),
  }
}

/** A random look; `keep` carries the name, phrase and personality over. */
export function randomLook(seed: number, keep?: Look): Look {
  const next = rng(seed)
  const look: Look = {
    ...(keep ?? DEFAULT_LOOK),
    skin: Math.floor(next() * SKINS.length),
    hair: pick(next, Object.keys(HAIRS)),
    hairColor: pick(next, HAIR_COLORS),
    facial: next() < 0.2 ? pick(next, ['mustache', 'beard', 'goatee']) : 'none',
    eyes: pick(next, Object.keys(EYES)),
    mouth: pick(next, ['smile', 'smile', 'grin', 'small', 'open', 'tongue']),
    blush: next() < 0.5,
    shirt: pick(next, Object.keys(SHIRTS)),
    shirtColor: pick(next, ALL_COLORS),
    pants: pick(next, [0, 4, 12, 16, 17, 17]),
    shoes: pick(next, [0, 5, 6, 11, 16]),
    acc: pick(next, ['none', 'none', 'cap', 'beanie', 'glasses', 'headphones', 'bow', 'flower', 'shades']),
    accColor: pick(next, ALL_COLORS),
  }
  return look
}

/** A random look for the person's dice: `keep`'s name, phrase and personality on new parts. */
export const randomLookFor = (keep: Look): Look => randomLook(Math.floor(Math.random() * 0xffffffff), keep)
