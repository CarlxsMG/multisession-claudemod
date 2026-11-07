// A background task's processes, as pure rules over snapshots of the process
// table: which one is the task's (its root, whose id the pane shows), and
// which a stopped task left behind on Windows. There TaskStop ends the task's
// shell but not what the shell started (a `timeout.exe`, the node of a dev
// server), which runs on with no parent and keeps the machine busy.
/** One process of a snapshot: its id, its parent's, when it started (ms, NaN when unknown) and its command line. */
export type Proc = { pid: number; ppid: number; createdAt: number; commandLine: string }

/**
 * How far before a task's recorded start a process of it may have started:
 * the engine answers the call a moment after the shell starts its command.
 */
export const START_SLACK_MS = 5000

// The flags after which a shell's command line holds the command it runs.
const SHELL_FLAGS = new Set(['-c', '/c', '/k', '-l', '-lc', '-command'])
// Extensions a command word may carry on Windows that its name goes without.
const EXTENSION = /\.(exe|cmd|bat|com|ps1|js|mjs|cjs)$/
// Separators between the simple commands of a shell line.
const SEPARATOR = /&&|\|\||[;|&\n]/
// Commands of a shell line that start no process of their own.
const BUILTINS = new Set(['cd', 'pushd', 'popd', 'export', 'set'])
const ASSIGNMENTS = /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*/

// A CIM date as Windows PowerShell's JSON gives it (`/Date(ms)/`) or as
// PowerShell 7's does (ISO 8601).
function parseDate(x: unknown): number {
  if (typeof x !== 'string') return Number.NaN
  const ms = /\/Date\((-?\d+)\)\//.exec(x)
  return ms !== null ? Number(ms[1]) : Date.parse(x)
}

/**
 * The processes of a `Get-CimInstance Win32_Process | Select ProcessId,
 * ParentProcessId, CreationDate, CommandLine | ConvertTo-Json` answer, one
 * object or a list; what is not JSON is none.
 */
export function parseSnapshot(json: string): Proc[] {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return []
  }
  const rows = Array.isArray(data) ? data : [data]
  return rows.flatMap(row => {
    if (typeof row !== 'object' || row === null) return []
    const r = row as Record<string, unknown>
    if (typeof r.ProcessId !== 'number' || typeof r.ParentProcessId !== 'number') return []
    return [
      { pid: r.ProcessId, ppid: r.ParentProcessId, createdAt: parseDate(r.CreationDate), commandLine: typeof r.CommandLine === 'string' ? r.CommandLine : '' },
    ]
  })
}

/**
 * The processes of a `ps -A -o pid=,ppid=,lstart=,args=` answer, read in
 * the C locale: two ids, the start as five words (`Thu Nov  7 10:00:00
 * 2026`, to the second), then the command line.
 */
export function parsePs(text: string): Proc[] {
  return text.split('\n').flatMap(line => {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s+(.*)$/.exec(line)
    return m === null ? [] : [{ pid: Number(m[1]), ppid: Number(m[2]), createdAt: Date.parse(m[3]!), commandLine: m[4]!.trim() }]
  })
}

// One word as compared: a path's last part, lower case, without the
// extension a command word may carry; a flag (`/c`, `-l`) as it is.
const word = (raw: string): string => (/^[-/][^\\/]*$/.test(raw) ? raw.toLowerCase() : (raw.split(/[\\/]/).pop() ?? '').toLowerCase().replace(EXTENSION, ''))

/**
 * A command line's words as compared: quoted parts kept whole while they
 * are a path, split into words when they hold a command (`bash -c "…"`).
 */
export function tokens(commandLine: string): string[] {
  const raw = commandLine.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return raw
    .flatMap(part => {
      const inner = /^["']/.test(part) ? part.slice(1, -1) : part
      return /\s/.test(inner) && !/^[A-Za-z]:\\/.test(inner) ? inner.split(/\s+/) : [inner]
    })
    .map(word)
    .filter(x => x !== '')
}

// How many words of each simple command a process is matched by: its
// command word and first arguments, before any quoted script, whose quoting
// the process's command line spells otherwise.
const HEAD_WORDS = 4

// The words a simple command is matched by: up to `HEAD_WORDS`, stopping at
// the first quoted or expanded one after the command word.
function headWords(part: string): string[] {
  const raw = part.replace(ASSIGNMENTS, '').match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  const head: string[] = []
  for (const w of raw) {
    if (head.length === HEAD_WORDS || (head.length > 0 && /["'`$]/.test(w))) break
    head.push(word(w.replace(/^["']+|["']+$/g, '')))
  }
  return head.filter(x => x !== '')
}

// The simple commands of a recorded shell line, each the words it is
// matched by, without the builtins that start no process.
function commandsOf(command: string): string[][] {
  return command
    .split(SEPARATOR)
    .map(headWords)
    .filter(words => words.length > 0 && !BUILTINS.has(words[0]!))
}

// A recorded word against a process's: the same, or the name of the script
// that runs it (`npm` for `npm-cli.js`, `npx` for `npx-cli.js`).
const sameWord = (recorded: string, seen: string): boolean => seen === recorded || seen.startsWith(`${recorded}-`)

// Whether `words` appear in order in `seen`, the first as the process's
// program or script, or as the command a shell runs.
function runsCommand(words: readonly string[], seen: readonly string[]): boolean {
  for (let start = 0; start < seen.length; start++) {
    if (!sameWord(words[0]!, seen[start]!)) continue
    if (start > 1 && !SHELL_FLAGS.has(seen[start - 1]!)) continue
    let at = start + 1
    let matched = 1
    while (matched < words.length && at < seen.length) {
      if (sameWord(words[matched]!, seen[at]!)) matched++
      at++
    }
    if (matched === words.length) return true
  }
  return false
}

/** Whether a process's command line runs one of the simple commands of `command`, the shell line a task recorded. */
export function matchesCommand(commandLine: string, command: string): boolean {
  const seen = tokens(commandLine)
  return commandsOf(command).some(words => runsCommand(words, seen))
}

// Claude Code's own processes, whatever their parent: never a task's.
const isClaude = (p: Proc): boolean => p.commandLine.toLowerCase().includes('claude')

/**
 * The task's own process in `procs`, or undefined when none is: of those
 * started no earlier than the task (`startedAt`, less `START_SLACK_MS`) and
 * running its command, not Claude Code's nor one another task has
 * (`taken`), the one whose parent is none of them (the shell that runs the
 * rest), the earliest when several are.
 */
export function rootOf(procs: readonly Proc[], command: string, startedAt: number, taken: readonly number[] = []): number | undefined {
  const runs = procs.filter(p => p.createdAt >= startedAt - START_SLACK_MS && !taken.includes(p.pid) && !isClaude(p) && matchesCommand(p.commandLine, command))
  const ids = new Set(runs.map(p => p.pid))
  const tops = runs.filter(p => !ids.has(p.ppid)).sort((a, b) => a.createdAt - b.createdAt)
  return tops[0]?.pid
}

// The task's processes in `after`: started no earlier than the task
// (`startedAt`, less `START_SLACK_MS`), not Claude Code's, and either running
// its command or in `before` under a process that ran it.
function ofTask(before: readonly Proc[], after: readonly Proc[], command: string, startedAt: number): Proc[] {
  const fresh = (p: Proc): boolean => p.createdAt >= startedAt - START_SLACK_MS
  let tree: number[] = before.filter(p => fresh(p) && matchesCommand(p.commandLine, command)).map(p => p.pid)
  for (let grew = true; grew;) {
    const more = before.filter(p => tree.includes(p.ppid) && !tree.includes(p.pid) && fresh(p)).map(p => p.pid)
    grew = more.length > 0
    tree = [...tree, ...more]
  }
  const wasTask = (p: Proc): boolean => tree.includes(p.pid) && before.some(b => b.pid === p.pid && b.createdAt === p.createdAt)
  return after.filter(p => fresh(p) && !isClaude(p) && (matchesCommand(p.commandLine, command) || wasTask(p)))
}

/**
 * The processes to end, with their trees, after a task's shell was stopped:
 * the task's processes of `after` (started no earlier than the task, less
 * `START_SLACK_MS`, and running its command or in `before` under a process
 * that ran it) left with no parent: it is gone, or its id now names a
 * younger process. Claude Code's processes are never among them.
 */
export function orphansToKill(before: readonly Proc[], after: readonly Proc[], command: string, startedAt: number): number[] {
  const alive = new Map(after.map(p => [p.pid, p]))
  const isOrphan = (p: Proc): boolean => {
    const parent = alive.get(p.ppid)
    // A parent id that now names a younger process names another process.
    return parent !== undefined ? parent.createdAt > p.createdAt : true
  }
  return ofTask(before, after, command, startedAt)
    .filter(isOrphan)
    .map(p => p.pid)
}

/**
 * Whether any process of the task (as `orphansToKill` tells them) still
 * runs in `after`, leaving out the ids already ended (`ended`): while one
 * does, its shell may still be on its way out.
 */
export function isTaskRunning(before: readonly Proc[], after: readonly Proc[], command: string, startedAt: number, ended: readonly number[]): boolean {
  return ofTask(before, after, command, startedAt).some(p => !ended.includes(p.pid))
}
