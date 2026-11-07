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

// The simple commands of a recorded shell line, each its words, without
// assignments and the builtins that start no process.
function commandsOf(command: string): string[][] {
  return command
    .split(SEPARATOR)
    .map(part => tokens(part.replace(ASSIGNMENTS, '')))
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

/**
 * The processes to end, with their trees, after a task's shell was stopped:
 * those of `after` left with no parent (it is gone, or its id now names a
 * younger process), started no earlier than the task (`startedAt`, less
 * `START_SLACK_MS`), and either running the task's command or in `before`
 * under a process that ran it. Claude Code's processes are never among them.
 */
export function orphansToKill(before: readonly Proc[], after: readonly Proc[], command: string, startedAt: number): number[] {
  const fresh = (p: Proc): boolean => p.createdAt >= startedAt - START_SLACK_MS
  const alive = new Map(after.map(p => [p.pid, p]))
  const isOrphan = (p: Proc): boolean => {
    const parent = alive.get(p.ppid)
    // A parent id that now names a younger process names another process.
    return parent !== undefined ? parent.createdAt > p.createdAt : true
  }
  // The task's processes before the stop: its matching ones and all under them.
  let tree: number[] = before.filter(p => fresh(p) && matchesCommand(p.commandLine, command)).map(p => p.pid)
  for (let grew = true; grew;) {
    const more = before.filter(p => tree.includes(p.ppid) && !tree.includes(p.pid) && fresh(p)).map(p => p.pid)
    grew = more.length > 0
    tree = [...tree, ...more]
  }
  const wasTask = (p: Proc): boolean => tree.includes(p.pid) && before.some(b => b.pid === p.pid && b.createdAt === p.createdAt)
  return after.filter(p => fresh(p) && isOrphan(p) && !isClaude(p) && (matchesCommand(p.commandLine, command) || wasTask(p))).map(p => p.pid)
}
