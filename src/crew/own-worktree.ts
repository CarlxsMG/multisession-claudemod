// The worktree a worker makes for itself. Its preamble tells it to work in
// one unless its task says where, with `git worktree add`; the engine knows
// nothing of that worktree, so the crew reads the worker's own shell calls
// for it. A worker so marked edits apart from the repository it is listed in:
// the roster says "worktree of", and a heads-up does not name it as busy there.
import type { Engine } from '../engine'
import { updateWorkers } from '../state/atoms'
import { fromCommandWord, segments } from '../util/shell'

/** The tools whose `command` is a shell command. */
export const SHELL_TOOLS: ReadonlySet<string> = new Set(['Bash', 'PowerShell'])

// git's own options that take their value as the next word.
const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'])

/**
 * Whether a shell command makes a git worktree: one of its simple commands
 * is `git worktree add`, whatever options git itself is given first. A path
 * in quotes with a space in it is not read, and such a command is taken as
 * making none.
 */
export function addsWorktree(command: string): boolean {
  return segments(command).some(words => {
    const [head = '', ...args] = fromCommandWord(words)
    if (head.toLowerCase().replace(/\.exe$/, '') !== 'git') return false
    let i = 0
    while (i < args.length && args[i]!.startsWith('-')) i += GIT_VALUE_FLAGS.has(args[i]!) ? 2 : 1
    return args[i] === 'worktree' && args[i + 1] === 'add'
  })
}

/**
 * Marks a worker whose shell call made a worktree, once the call has run
 * without an error. The mark stays: the crew cannot tell a worker that went
 * back to the repository from one still in its worktree. What it hides is
 * only the worker's name in a heads-up; two workers that edit one file are
 * still told so, by the file's path.
 */
export async function noteOwnWorktree($: Engine, agentId: string, command: unknown) {
  if (typeof command !== 'string' || !addsWorktree(command)) return
  await updateWorkers($, list =>
    list.some(w => w.id === agentId && w.isApart !== true) ? list.map(w => (w.id === agentId ? { ...w, isApart: true } : w)) : list,
  )
}
