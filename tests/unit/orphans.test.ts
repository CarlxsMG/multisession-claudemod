import { expect, test } from 'claude-code/testing'

import { START_SLACK_MS, isTaskRunning, matchesCommand, orphansToKill, parsePs, parseSnapshot, rootOf, tokens } from '../../src/background/orphans'
import type { Proc } from '../../src/background/orphans'

const T0 = 1_700_000_000_000
const proc = (pid: number, ppid: number, createdAt: number, commandLine: string): Proc => ({ pid, ppid, createdAt, commandLine })

// Claude Code, and the Git Bash shell it ran a task in.
const CLAUDE = proc(100, 1, T0 - 3_600_000, '"C:\\Users\\me\\.local\\bin\\claude.exe"')
const BASH = proc(200, 100, T0, '"C:\\Program Files\\Git\\bin\\bash.exe" -c -l "timeout 900 sleep 900"')
const TIMEOUT = proc(300, 200, T0 + 50, '"C:\\Program Files\\Git\\usr\\bin\\timeout.exe" 900 sleep 900')
const SLEEP = proc(301, 300, T0 + 60, 'sleep 900')

test("Windows PowerShell's and PowerShell 7's snapshots read alike; a single process and a bad answer too", () => {
  const ps5 = JSON.stringify([{ ProcessId: 300, ParentProcessId: 200, CreationDate: `/Date(${T0})/`, CommandLine: 'x' }])
  const ps7 = JSON.stringify({ ProcessId: 300, ParentProcessId: 200, CreationDate: new Date(T0).toISOString(), CommandLine: null })
  expect(parseSnapshot(ps5)).toEqual([proc(300, 200, T0, 'x')])
  expect(parseSnapshot(ps7)).toEqual([proc(300, 200, T0, '')])
  expect(parseSnapshot('not json')).toEqual([])
})

test('a command line is compared by its words: paths to their names, without quotes or extensions', () => {
  expect(tokens(TIMEOUT.commandLine)).toEqual(['timeout', '900', 'sleep', '900'])
  expect(tokens(BASH.commandLine)).toEqual(['bash', '-c', '-l', 'timeout', '900', 'sleep', '900'])
})

test('the timeout.exe a stopped shell left running is ended, with its tree', () => {
  const before = [CLAUDE, BASH, TIMEOUT, SLEEP]
  const after = [CLAUDE, TIMEOUT, SLEEP]
  expect(orphansToKill(before, after, 'timeout 900 sleep 900', T0 + 1000)).toEqual([300])
})

test("the node of an npm dev server is ended, and the vite under it goes with that node's tree", () => {
  const npm = proc(400, 200, T0 + 100, '"C:\\Program Files\\nodejs\\node.exe" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" run dev')
  const vite = proc(401, 400, T0 + 900, '"C:\\Program Files\\nodejs\\node.exe" C:\\work\\web\\node_modules\\vite\\bin\\vite.js')
  expect(matchesCommand(npm.commandLine, 'cd web && npm run dev')).toBe(true)
  const before = [CLAUDE, { ...BASH, commandLine: 'bash -c "cd web && npm run dev"' }, npm, vite]
  expect(orphansToKill(before, [CLAUDE, npm, vite], 'cd web && npm run dev', T0 + 1000)).toEqual([400])
})

test('a process under one that ran the command, orphaned when its parent went too, is ended', () => {
  const cmd = proc(500, 200, T0 + 100, 'cmd /c "npm run dev"')
  const node = proc(501, 500, T0 + 200, 'node server.js')
  expect(orphansToKill([CLAUDE, BASH, cmd, node], [CLAUDE, node], 'npm run dev', T0 + 1000)).toEqual([501])
})

test("the person's own process of the same command, started before the task, is left alone", () => {
  const own = proc(600, 7, T0 - START_SLACK_MS - 1, 'timeout 900 sleep 900')
  expect(orphansToKill([CLAUDE, own, BASH, TIMEOUT], [CLAUDE, own, TIMEOUT], 'timeout 900 sleep 900', T0 + 1000)).toEqual([300])
})

test('a process whose parent still lives is left alone, even when its parent id was reused only by an older process', () => {
  expect(orphansToKill([CLAUDE, BASH, TIMEOUT], [CLAUDE, BASH, TIMEOUT], 'timeout 900 sleep 900', T0)).toEqual([])
  const reused = proc(200, 100, T0 + 10_000, 'notepad.exe')
  expect(orphansToKill([CLAUDE, BASH, TIMEOUT], [CLAUDE, reused, TIMEOUT], 'timeout 900 sleep 900', T0)).toEqual([300])
})

test('an orphan running another command, or Claude Code itself, is left alone', () => {
  const other = proc(700, 9999, T0 + 100, 'python -m http.server')
  const claude = proc(701, 9999, T0 + 100, 'node C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js timeout 900 sleep 900')
  expect(orphansToKill([], [CLAUDE, other, claude], 'timeout 900 sleep 900', T0)).toEqual([])
})

test("a task's process is the shell that runs its command, not what runs under it, nor the person's own or another task's", () => {
  const procs = [CLAUDE, BASH, TIMEOUT, SLEEP]
  expect(rootOf(procs, 'timeout 900 sleep 900', T0 + 1000)).toBe(200)
  // Where the shell's line does not say the command, the process that runs it.
  expect(rootOf([CLAUDE, { ...BASH, commandLine: 'bash.exe /tmp/run.sh' }, TIMEOUT, SLEEP], 'timeout 900 sleep 900', T0 + 1000)).toBe(300)
  expect(rootOf(procs, 'timeout 900 sleep 900', T0 + 1000, [200])).toBe(300)
  const own = proc(600, 7, T0 - START_SLACK_MS - 1, 'timeout 900 sleep 900')
  expect(rootOf([CLAUDE, own], 'timeout 900 sleep 900', T0)).toBeUndefined()
  expect(rootOf(procs, 'npm run dev', T0)).toBeUndefined()
})

test("ps's table reads in the C locale: ids, the start to the second, and the command line whole", () => {
  const text = [
    '  101     1 Thu Nov  7 10:00:00 2026 /usr/bin/claude',
    '  202   101 Thu Nov  7 10:00:05 2026 /bin/bash -c timeout 900 sleep 900',
    'garbage',
  ].join('\n')
  expect(parsePs(text)).toEqual([
    proc(101, 1, Date.parse('Thu Nov 7 10:00:00 2026'), '/usr/bin/claude'),
    proc(202, 101, Date.parse('Thu Nov 7 10:00:05 2026'), '/bin/bash -c timeout 900 sleep 900'),
  ])
})

// What the live test left running after its tasks were stopped, as
// Windows PowerShell 5.1 printed it: Tito's `timeout 900 sleep 901`, and the
// main session's `timeout 720 bash -c '…'`, each parent gone.
const LIVE_TABLE = String.raw`[{"ProcessId":51656,"ParentProcessId":45020,"CreationDate":"\/Date(1794053554742)\/","CommandLine":"\"C:\\Program Files\\Git\\usr\\bin\\timeout.exe\" 900 sleep 901"},{"ProcessId":48324,"ParentProcessId":32636,"CreationDate":"\/Date(1794053565344)\/","CommandLine":"\"C:\\Program Files\\Git\\usr\\bin\\timeout.exe\" 720 bash -c \"while powershell -NoProfile -Command \\\"@(Get-CimInstance Win32_Process | ? { \\$_.CommandLine -match \\\\\\\"sleep 901\\\\\\\" -and \\$_.Name -ne \\\\\\\"powershell.exe\\\\\\\" -and \\$_.Name -ne \\\\\\\"bash.exe\\\\\\\" }).Count\\\" | grep -qv \\\"^0\\\"; do sleep 10; done; echo \\\"GONE at $(date +%T)\\\"\""}]`
const LOOP = String.raw`timeout 720 bash -c 'while powershell -NoProfile -Command "@(Get-CimInstance Win32_Process | ? { $_.CommandLine -match \"sleep 901\" -and $_.Name -ne \"powershell.exe\" -and $_.Name -ne \"bash.exe\" }).Count" | grep -qv "^0"; do sleep 10; done; echo "GONE at $(date +%T)"'`

test("the live test's orphaned timeout.exe processes are the stopped tasks' to end, by their real table", () => {
  const after = parseSnapshot(LIVE_TABLE)
  expect(after.map(p => [p.pid, p.ppid, p.createdAt])).toEqual([
    [51656, 45020, Date.parse('2026-11-07T12:12:34.742Z')],
    [48324, 32636, Date.parse('2026-11-07T12:12:45.344Z')],
  ])
  // Tito's call was answered at 12:12:34.685, 57 ms before its timeout.exe started.
  expect(orphansToKill([], after, 'timeout 900 sleep 901', Date.parse('2026-11-07T12:12:34.685Z'))).toEqual([51656])
  // A quoted script is matched by the words ahead of it, its quoting being spelled otherwise there.
  expect(orphansToKill([], after, LOOP, Date.parse('2026-11-07T12:12:45.300Z'))).toEqual([48324])
})

test("a task's process still running, its shell's included, keeps the look going until it is gone or ended", () => {
  expect(isTaskRunning([], [CLAUDE, BASH, TIMEOUT], 'timeout 900 sleep 900', T0, [])).toBe(true)
  expect(isTaskRunning([], [CLAUDE, TIMEOUT], 'timeout 900 sleep 900', T0, [300])).toBe(false)
  expect(isTaskRunning([], [CLAUDE], 'timeout 900 sleep 900', T0, [])).toBe(false)
})
