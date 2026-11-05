import { expect, test } from 'claude-code/testing'

import { ACCS, COLORS, EYES, FACIALS, HAIRS, MOUTHS, NAME_COLORS, SHIRTS, SKINS } from '../../src/figure/catalog'
import { verbOf } from '../../src/i18n'
import { en } from '../../src/i18n/en'
import { es } from '../../src/i18n/es'
import { localeOfLanguage } from '../../src/i18n/locale'
import { parseEvery } from '../../src/progress/check-in'
import { VIBES } from '../../src/persona/vibes'

test('every part and colour a look picks has its name in every locale, and no name is left over', () => {
  const parts = { hair: HAIRS, eyes: EYES, mouth: MOUTHS, facial: FACIALS, shirt: SHIRTS, acc: ACCS }
  const ids = [...new Set([...SKINS, ...COLORS, ...NAME_COLORS].map(([id]) => id))].sort()
  for (const words of [en, es]) {
    for (const [key, table] of Object.entries(parts)) expect(Object.keys(words.parts[key as keyof typeof parts])).toEqual(Object.keys(table))
    expect(Object.keys(words.colors).sort()).toEqual(ids)
  }
})

test('every personality has its name in every locale and five lines a mood, each delegating line naming its worker', () => {
  for (const words of [en, es]) {
    expect(Object.keys(words.vibes)).toEqual(Object.keys(VIBES))
    for (const vibe of Object.values(words.vibes)) {
      expect(vibe.label).not.toBe('')
      expect(Object.keys(vibe.lines)).toEqual(['idle', 'thinking', 'working', 'delegating', 'happy', 'sleep'])
      for (const lines of Object.values(vibe.lines)) expect(lines).toHaveLength(5)
      for (const line of vibe.lines.delegating) expect(line).toContain('{w}')
    }
  }
})

test("Claude Code's language setting names a locale however it is written, and none the crew lacks", () => {
  // `Español` and `Inglés` carry their accent as a combining mark.
  const spanish = ['spanish', 'Spanish', ' Spanish ', 'español', 'Español', 'ESPAÑOL', 'Español', 'espanol', 'castellano', 'es', 'ES', 'es-ES', 'es_ES']
  const english = ['english', 'English', 'ENGLISH', 'inglés', 'Inglés', 'Inglés', 'ingles', 'en', 'EN', 'en-GB', 'en_US']
  for (const language of spanish) expect(localeOfLanguage(language)).toBe('es')
  for (const language of english) expect(localeOfLanguage(language)).toBe('en')
  for (const language of ['french', 'japanese', '', undefined, 3]) expect(localeOfLanguage(language)).toBeUndefined()
})

test("every locale gives each /crew verb its words, a word of any locale's names its verb, and none names two", () => {
  const verbs = Object.keys(en.command.verbs)
  const named = new Map<string, string>()
  for (const words of [en, es]) {
    expect(Object.keys(words.command.verbs)).toEqual(verbs)
    for (const [verb, said] of Object.entries(words.command.verbs)) {
      expect(said.length).toBeGreaterThan(0)
      for (const word of said) {
        expect(named.get(word) ?? verb).toBe(verb)
        named.set(word, verb)
        expect(verbOf(word)).toBe(verb)
        expect(verbOf(word.toUpperCase())).toBe(verb)
      }
    }
  }
  for (const word of ['', 'nope', 'edits']) expect(verbOf(word)).toBeUndefined()
})

test("the minutes /crew progress takes are written in any locale's units", () => {
  for (const words of [en, es]) for (const unit of words.command.minutes) expect(parseEvery(`5${unit}`)).toBe(5)
  expect(parseEvery('5 minutos')).toBe(5)
  expect(parseEvery('5')).toBe(5)
  expect(parseEvery('5 horas')).toBeUndefined()
  expect(parseEvery('4m')).toBeUndefined()
})

test('the words under a card are the same in every locale: four columns hold no translation of them', () => {
  for (const words of [en, es]) expect(words.pane.card).toEqual(en.pane.card)
})
