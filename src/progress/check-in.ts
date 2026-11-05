// How often a check-in row may come: the choices, the default, and what
// `/crew progreso` takes.

// The check-in intervals `/crew progreso` takes, in minutes; 0 is off.
const EVERY_CHOICES = [1, 2, 3, 5, 10] as const
/** Minutes between check-ins, until the user sets it. */
export const DEFAULT_EVERY = 3

/** `5m`, `5`, `5min`, `off`: the minutes, 0 for off, undefined for anything else. */
export function parseEvery(text: string): number | undefined {
  const input = text.trim().toLowerCase()
  if (input === 'off' || input === 'no' || input === '0') return 0
  const match = /^(\d+)\s*(?:m|min|mins|minutos?)?$/.exec(input)
  const minutes = match === null ? NaN : Number(match[1])
  return (EVERY_CHOICES as readonly number[]).includes(minutes) ? minutes : undefined
}
