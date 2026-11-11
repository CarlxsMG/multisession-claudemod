// Refuses shell commands that would not end on their own: a follow of a
// file, a watch mode, an endless loop. Each one left running, in the
// background or after a worker's report, keeps a process alive that lags the
// app; the model is told what to run instead.
import { runawayDenied } from '../prompts/results'
import { fromCommandWord, segments } from '../util/shell'

// Watchers whose `-w` means watch; with any other tool it means something
// else (`grep -w`, `git log -w`, `npm -w`).
const WATCHERS = new Set(['vite', 'tsc', 'jest', 'vitest', 'nodemon'])

// Package runners whose arguments a script passes on, so `npm test -- --watch`
// watches as the script's own tool would.
const RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])

const BOUNDED = /^g?timeout$/
const FOLLOW = /^(-[A-Za-z0-9]*[fF][A-Za-z0-9]*|--follow(=.*)?)$/
const WATCH_FLAG = /^--watch(All)?(=.*)?$/

// Loops that only end when killed: `while true`, `while :`, `while ($true)`,
// `for ((;;))`, `for (;;)`.
const ENDLESS_LOOP = /\bwhile\s+(true|:)\s*(;|\n|\s)\s*do\b|\bwhile\s*\(\s*\$true\s*\)|\bfor\s*\(\(\s*;\s*;\s*\)\)|\bfor\s*\(\s*;\s*;\s*\)/i
const LOOP_EXIT = /\b(break|exit|return)\b/
const TIMEOUT_WRAP = /(^|[\s;&|(])g?timeout\s+(-\S+\s+)*\d/

// What in one simple command never ends, or null.
function runawayIn(words: readonly string[]): string | null {
  const [head = '', ...args] = fromCommandWord(words)
  const name = head.toLowerCase().replace(/\.(exe|cmd)$/, '')
  if (BOUNDED.test(name)) return null
  if (name === 'tail' && args.some(a => FOLLOW.test(a))) return '`tail -f`'
  if (name === 'watch') return '`watch`'
  if (['get-content', 'gc', 'cat', 'type'].includes(name) && args.some(a => /^-wait$/i.test(a))) return '`Get-Content -Wait`'
  if (WATCHERS.has(name) && args.some(a => WATCH_FLAG.test(a) || a === '-w')) return `\`${name} --watch\``
  if ((RUNNERS.has(name) || name === 'node') && args.some(a => WATCH_FLAG.test(a))) return `\`${name} --watch\``
  return null
}

/**
 * What in a shell command would run until killed, named for the model
 * (`` `tail -f` ``), or null when every part of it ends. A part wrapped in
 * `timeout N` ends, and so does a loop with a `break`, `exit` or `return`.
 */
export function findRunaway(command: string): string | null {
  for (const words of segments(command)) {
    const found = runawayIn(words)
    if (found !== null) return found
  }
  const loop = ENDLESS_LOOP.exec(command)
  if (loop !== null && !LOOP_EXIT.test(command) && !TIMEOUT_WRAP.test(command.slice(0, loop.index))) return 'an endless loop'
  return null
}

/**
 * Denies a Bash or PowerShell call whose command would not end, the main
 * session's and every worker's alike; any other call goes on.
 */
export function guardRunaway<E extends { command: string }, R>(e: E, next: (e: E) => R): R | { deny: string } {
  const found = findRunaway(e.command)
  return found === null ? next(e) : { deny: runawayDenied(found) }
}
