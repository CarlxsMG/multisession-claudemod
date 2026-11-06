// Text made to fit: flattened to one line, cut with an ellipsis, wrapped to
// a width; and the text a tool's result or a pasted prompt holds.
import { t } from '../i18n'

/** `text` in at most `max` columns, its last one an ellipsis when cut. */
export const cut = (text: string, max: number): string => (text.length <= max ? text : max <= 0 ? '' : `${text.slice(0, max - 1)}…`)

/** `text` on one line: every run of whitespace a single space. */
export const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** `text` flattened to one line and cut to `max` columns. */
export const oneLine = (text: string, max: number): string => cut(flat(text), max)

// The last line kept of a cut text: an ellipsis says more was left out, in
// the line's last column when it is full.
const endCut = (line: string, width: number): string => (line.length >= width ? line.slice(0, width - 1) : line) + '…'

/**
 * The desktop app wraps what the person pasted into a prompt in
 * <pasted_content> tags, for the model: the log marks it as pasted instead.
 */
export const unwrapPasted = (text: string): string => text.replace(/<pasted_content\b[^>]*>/g, ` ${t().pasted} `).replace(/<\/pasted_content>/g, ' ')

/** The text with its first letter in capitals. */
export const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Word-wraps to `width` columns, at most `max` lines, the last one marked
 * when text was left out.
 */
export function wrapText(text: string, width: number, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    let rest = word
    while (rest.length > width) {
      if (line !== '') lines.push(line)
      line = ''
      lines.push(rest.slice(0, width))
      rest = rest.slice(width)
    }
    if (line === '') line = rest
    else if (line.length + 1 + rest.length <= width) line += ' ' + rest
    else {
      lines.push(line)
      line = rest
    }
  }
  if (line !== '' || lines.length === 0) lines.push(line)
  if (lines.length <= max) return lines
  const kept = lines.slice(0, max)
  kept[max - 1] = endCut(kept[max - 1]!, width)
  return kept
}

// Only the start of a long text is read for its first rows.
const HEAD_CHARS = 20_000

/**
 * The first rows of a text, its own line breaks kept and each line wrapped
 * to `width`; the last one marked when more was left out. `max` may be
 * Infinity: the whole text.
 */
export function headLines(text: string, width: number, max: number): string[] {
  const rows = text
    .slice(0, HEAD_CHARS)
    .split('\n')
    .map(flat)
    .filter(line => line !== '')
    .flatMap(line => wrapText(line, width, max + 1))
  if (rows.length <= max) return rows
  const kept = rows.slice(0, max)
  const last = kept[max - 1]!
  if (!last.endsWith('…')) kept[max - 1] = endCut(last, width)
  return kept
}

/**
 * The text of a tool's stored result: an MCP tool's blocks, a tool's
 * `message`, a plain string.
 */
export function textOf(output: unknown, depth = 0): string {
  if (typeof output === 'string') return output
  if (depth > 3 || typeof output !== 'object' || output === null) return ''
  if (Array.isArray(output))
    return output
      .map(x => textOf(x, depth + 1))
      .filter(x => x !== '')
      .join('\n')
  const fields = output as Record<string, unknown>
  for (const key of ['text', 'message', 'result', 'content']) {
    if (key in fields) return textOf(fields[key], depth + 1)
  }
  return ''
}

/** The first of the values that is a string with something in it, else an empty one. */
export const firstText = (...texts: unknown[]): string => String(texts.find(text => typeof text === 'string' && text.trim() !== '') ?? '')
