// The shells and Monitors agents leave running in the background: recorded
// from their calls, stopped once their worker is done, listed in the team
// view with a Stop, and never stopped on their own when the main
// conversation started them.
import { expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { TestBody } from 'claude-code/testing'
import { PANE, crewCommand, progressCrew, teamTexts, test } from './support/crew'
import type { EngineOptions } from './support/crew'

// A crew whose engine backgrounds every Bash call under the next id, answers
// TaskStop for the tasks it runs, and decides TaskStop's permission as
// `decision` says, every other tool's as allowed.
async function backgroundCrew($: Parameters<TestBody>[0], on: On, decision: 'allow' | 'ask' = 'allow', more: Pick<EngineOptions, 'host' | 'probe'> = {}) {
  let n = 0
  const running = new Set<string>()
  const stops: string[] = []
  on('tool.call', { tool: 'Bash' }, () => {
    const id = `b${++n}`
    running.add(id)
    return { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: id } }
  })
  on('tool.call', { tool: 'TaskStop' }, (_, e) => {
    const id = String((e as { task_id?: string }).task_id)
    stops.push(id)
    if (!running.delete(id)) return { result: `No task found with ID: ${id}`, isError: true as const, text: `No task found with ID: ${id}` }
    return { result: { message: 'stopped', task_id: id, task_type: 'local_bash' } }
  })
  const rules = { decision }
  on('tool.check', (_, e) => ({ decision: e.tool === 'TaskStop' ? rules.decision : ('allow' as const) }))
  on('classic.SubagentStop', () => ({}))
  const crew = await progressCrew($, on, {}, more)
  return { ...crew, running, stops, rules }
}

const bash = ($: Parameters<TestBody>[0], command: string, agentId?: string) =>
  $.tool.call({ tool: 'Bash', command, run_in_background: true, ...(agentId === undefined ? {} : { agentId }) } as never)

test("a worker's background shell is stopped once its turn ends, and leaves the team view", async ($, on) => {
  const { clock, delegate, end, stops, running } = await backgroundCrew($, on)
  await delegate('Start the dev server', '/work/web', 'Dev')
  await bash($, 'npm run dev', 'agent-1')
  expect((await teamTexts($)).some(x => /Pip · \d+s · npm run dev/.test(x))).toBe(true)
  await clock.advance(2000)
  expect(stops).toEqual([])
  await end('agent-1')
  await clock.advance(2000)
  expect(stops).toEqual(['b1'])
  expect(running.size).toBe(0)
  expect((await teamTexts($)).some(x => x.includes('npm run dev'))).toBe(false)
})

test('a stop the rules would ask the person for is not tried on its own: a toast says so and Stop stays in the team view', async ($, on) => {
  const { clock, delegate, end, stops, toasts, rules } = await backgroundCrew($, on, 'ask')
  await delegate('Serve the app', '/work/web', 'Serve')
  await bash($, 'node server.js', 'agent-1')
  await end('agent-1')
  await clock.advance(5000)
  expect(stops).toEqual([])
  expect(toasts.filter(x => x.startsWith('Could not stop node server.js: it needs your approval'))).toHaveLength(1)
  // The person's press stops it, the person approving.
  rules.decision = 'allow'
  await crewCommand($, 'team')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'bg-stop-b1' })
  await ui.unmount()
  await clock.advance(100)
  expect(stops).toEqual(['b1'])
  expect((await teamTexts($)).some(x => x.includes('node server.js'))).toBe(false)
})

test("the main conversation's shell is listed and never stopped on its own", async ($, on) => {
  const { clock, mainTurn, stops } = await backgroundCrew($, on)
  const done = await mainTurn()
  await bash($, 'npm start')
  await done()
  await clock.advance(12 * 60_000)
  expect(stops).toEqual([])
  expect((await teamTexts($)).some(x => /^main · 12m · npm start$/.test(x))).toBe(true)
})

test("the model's own TaskStop and the engine's list of work in flight forget the tasks that are over", async ($, on) => {
  const { clock, mainTurn } = await backgroundCrew($, on)
  const done = await mainTurn()
  await bash($, 'npm start')
  await bash($, 'npm run watch')
  await bash($, 'sleep 1')
  await done()
  await $.tool.call({ tool: 'TaskStop', task_id: 'b1' })
  await clock.advance(10_000)
  await $.classic.SubagentStop({
    stop_hook_active: false,
    agent_id: 'agent-9',
    agent_transcript_path: '/t',
    agent_type: 'general-purpose',
    background_tasks: [{ id: 'b2', type: 'shell', status: 'running', description: 'npm run watch' }],
  } as never)
  const texts = await teamTexts($)
  expect(texts.filter(x => x.startsWith('main · '))).toEqual(['main · 10s · npm run watch'])
})

// The process table as Windows PowerShell's JSON gives it.
const table = (rows: [number, number, number, string][]) =>
  JSON.stringify(rows.map(([pid, ppid, at, line]) => ({ ProcessId: pid, ParentProcessId: ppid, CreationDate: `/Date(${at})/`, CommandLine: line })))

test("on Windows what a stopped worker's shell left running is ended after it; elsewhere nothing is looked for", async ($, on) => {
  const runs: string[][] = []
  let stopped = false
  const probe = (argv: readonly string[]): string => {
    if (argv[0] === 'taskkill') runs.push([...argv])
    if (argv[0] !== 'powershell') return ''
    runs.push(['snapshot'])
    // Claude Code, the task's shell until it is stopped, and the timeout.exe it ran.
    const t0 = 1_000_000
    const shell: [number, number, number, string][] = stopped ? [] : [[200, 100, t0, 'bash.exe -c -l "timeout 900 sleep 900"']]
    const rows: [number, number, number, string][] = [
      [100, 1, 0, 'claude.exe'],
      ...shell,
      [300, 200, t0 + 50, '"C:\\Program Files\\Git\\usr\\bin\\timeout.exe" 900 sleep 900'],
    ]
    return table(rows)
  }
  on('tool.call', { tool: 'TaskStop' }, (_, e, next) => {
    stopped = true
    return next(e)
  })
  const { clock, delegate, end, stops, toasts } = await backgroundCrew($, on, 'allow', { host: { env: { OS: 'Windows_NT' } }, probe })
  await delegate('Wait a while', '/work/web', 'Wait')
  await bash($, 'timeout 900 sleep 900', 'agent-1')
  await end('agent-1')
  await clock.advance(5000)
  expect(stops).toEqual(['b1'])
  expect(runs).toEqual([['snapshot'], ['snapshot'], ['taskkill', '/PID', '300', '/T', '/F']])
  expect(toasts.some(x => x.includes('could not end'))).toBe(false)
})

test('elsewhere than Windows ending the shell ends what it started: no process is looked for', async ($, on) => {
  const runs: string[] = []
  const probe = (argv: readonly string[]): string => {
    if (argv[0] === 'powershell' || argv[0] === 'taskkill') runs.push(argv[0])
    return ''
  }
  const { clock, delegate, end, stops } = await backgroundCrew($, on, 'allow', { probe })
  await delegate('Wait a while', '/work/web', 'Wait')
  await bash($, 'timeout 900 sleep 900', 'agent-1')
  await end('agent-1')
  await clock.advance(5000)
  expect(stops).toEqual(['b1'])
  expect(runs).toEqual([])
})
