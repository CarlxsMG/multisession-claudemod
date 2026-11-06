// Bytes to base64 and back: the cells a Raster takes, and share codes,
// which swap in `-` and `_` and drop the padding.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Bytes as base64. */
export function toBase64(bytes: Uint8Array): string {
  const out: string[] = []
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out.push(B64[(n >> 18) & 63]!, B64[(n >> 12) & 63]!, B64[(n >> 6) & 63]!, B64[n & 63]!)
  }
  const rest = bytes.length - i
  if (rest > 0) {
    const n = (bytes[i]! << 16) | (rest === 2 ? bytes[i + 1]! << 8 : 0)
    out.push(B64[(n >> 18) & 63]!, B64[(n >> 12) & 63]!)
    out.push(rest === 2 ? B64[(n >> 6) & 63]! : '=', '=')
  }
  return out.join('')
}

/** The bytes base64 text holds, plain or URL-safe. */
export function fromBase64(code: string): Uint8Array {
  const clean = code
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/]/g, '')
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of clean) {
    buffer = (buffer << 6) | B64.indexOf(ch)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 255)
    }
  }
  return Uint8Array.from(bytes)
}
