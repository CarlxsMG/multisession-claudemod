// Durations and ages as the pane, the status line and the rows give them.

/** A run's time where room is short: 40s, 6m, 1h 5m. */
export function shortTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

/** A run's time in a card's four columns: 40s, 6m, 99m, then whole hours. */
export function cardTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 100 ? `${m}m` : `${Math.floor(m / 60)}h`
}

/** A finished task's time: 4s, 6m 12s, 1h 5m. */
export function took(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

/** How long ago `at` was, in a few characters: `justNow` (the word in the caller's language), `12s`, `3m`, `2h`. */
export function ago(now: number, at: number, justNow: string): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 10) return justNow
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}
