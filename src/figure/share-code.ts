// A look as a code to paste: `CREW1.` and its JSON in base64. Codes already
// shared keep working, so the prefix and the fields stay as they are.
import type { Look } from '../../types'
import { fromBase64, toBase64 } from '../util/base64'
import { normalizeLook } from './look'

const CODE_PREFIX = 'CREW1.'

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
    const body = code.slice(at + CODE_PREFIX.length).trim().split(/\s/)[0] ?? ''
    return normalizeLook(JSON.parse(new TextDecoder().decode(fromBase64(body))))
  } catch {
    return undefined
  }
}
