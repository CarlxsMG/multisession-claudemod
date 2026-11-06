// A look as a code to paste: `CREW1.` and its JSON in base64. Codes already
// shared keep working, so the prefix and the fields stay as they are.
import type { Look } from '../../types'
import { fromBase64, toBase64 } from '../util/base64'
import { DEFAULT_LOOK, normalizeLook } from './look'

const CODE_PREFIX = 'CREW1.'

// `normalizeLook` would fill in what holds no field of a look with the default,
// and a code replaces the whole look. One field is enough: a code that holds
// only some of them still imports.
const holdsLook = (raw: unknown): boolean => typeof raw === 'object' && raw !== null && Object.keys(DEFAULT_LOOK).some(field => Object.hasOwn(raw, field))

/** A look as a code the user can share: `CREW1.` and the look in base64. */
export function lookCode(look: Look): string {
  const json = new TextEncoder().encode(JSON.stringify(look))
  return CODE_PREFIX + toBase64(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The look a share code holds, wherever it sits in the text, or undefined for none. */
export function parseLookCode(code: string): Look | undefined {
  const at = code.indexOf(CODE_PREFIX)
  if (at < 0) return undefined
  try {
    const body =
      code
        .slice(at + CODE_PREFIX.length)
        .trim()
        .split(/\s/)[0] ?? ''
    const raw: unknown = JSON.parse(new TextDecoder().decode(fromBase64(body)))
    return holdsLook(raw) ? normalizeLook(raw) : undefined
  } catch {
    return undefined
  }
}
