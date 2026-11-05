// The language the crew's UI speaks: the crew's `language` option, or with
// `auto` Claude Code's own `language` setting, English for any other. The
// models' text is English whatever it is.
import type { Engine } from '../engine'
import { quiet } from '../engine'

export type Locale = 'en' | 'es'

let chosen: Locale | 'auto' = 'auto'
let current: Locale = 'en'

/** The locale a Claude Code `language` setting names (`spanish`, `Español`, `es_ES`…), undefined for one the crew lacks. */
export function localeOfLanguage(language: unknown): Locale | undefined {
  if (typeof language !== 'string') return undefined
  // Accents dropped, in either Unicode form, and `es_ES` read as `es-ES`.
  const name = language.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/_/g, '-')
  if (/^es\b|^spa|espanol|castellano/.test(name)) return 'es'
  if (/^en\b|^eng|ingles/.test(name)) return 'en'
  return undefined
}

/** Takes the crew's `language` option as the plugin loads: `en`, `es`, or `auto`. */
export function chooseLocale(option: unknown) {
  chosen = option === 'en' || option === 'es' ? option : 'auto'
  if (chosen !== 'auto') current = chosen
}

/** Settles the session's locale: the option chosen, else Claude Code's language, else English. */
export async function settleLocale($: Engine) {
  if (chosen !== 'auto') {
    current = chosen
    return
  }
  current = localeOfLanguage(await quiet($, $.settings.read({ key: 'language' }), 'language setting')) ?? 'en'
}

/** The locale the UI speaks now. */
export const localeNow = (): Locale => current

/** A locale's language as a prompt in English names it. */
export const LANGUAGE_NAME: Record<Locale, string> = { en: 'English', es: 'Spanish' }

/** Sets the locale outright: for a test that reads one language. */
export function setLocale(locale: Locale) {
  current = locale
}
