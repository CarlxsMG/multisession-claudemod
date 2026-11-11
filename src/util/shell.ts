// A shell command read in words, as far as the crew needs it: the simple
// commands it is made of, and where each one's command word is.

// Tools that run the command they are given as their whole call, so a
// wrapper in front of the command word changes nothing about what runs.
const WRAPPERS = new Set(['sudo', 'nohup', 'exec', 'command', 'env', 'npx', 'bunx', 'pnpx'])

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

/**
 * The words of each simple command, between the shell's separators. Quotes
 * are not parsed: a separator inside one only splits a command more finely,
 * and only a segment's command word and its flags are read.
 */
export function segments(command: string): string[][] {
  return command
    .split(/&&|\|\||[;|&\n]/)
    .map(s => s.trim().split(/\s+/).filter(Boolean))
    .filter(words => words.length > 0)
}

/** The segment from its command word on: assignments and wrappers dropped. */
export function fromCommandWord(words: readonly string[]): readonly string[] {
  let i = 0
  while (i < words.length && (ASSIGNMENT.test(words[i]!) || WRAPPERS.has(words[i]!.toLowerCase()))) i++
  return words.slice(i)
}
