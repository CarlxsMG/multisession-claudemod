import { expect } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'
import { USAGE, crewCommand, engine, test } from './support/crew'

test('workers the user clears or the list lets go stay off until they wake, and come back whole', async ($, on) => {
  let spawned = 0
  const running = new Set<string>()
  const infos = (): AgentInfo[] =>
    Array.from({ length: spawned }, (_, k) => {
      const id = `agent-${k + 1}`
      return {
        id,
        name: id === 'agent-1' ? 'pip' : undefined,
        description: `Task ${k + 1}`,
        type: 'general-purpose',
        status: running.has(id) ? 'running' : 'completed',
      }
    })
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, agents: infos })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const roster = async (worker?: string) => String((await $.tool.call({ tool: 'mcp__crew__roster', ...(worker ? { worker } : {}) })).result)

  for (let i = 1; i <= 27; i++) {
    await $.tool.call({ tool: 'mcp__crew__delegate', task: `Task ${i}`, repo: `/work/r${i}`, fresh: true })
    await clock.advance(1000)
    await $.turn.complete({ answer: `Informe ${i}`, durationMs: 1, isAborted: false, turnId: `t${i}`, agentId: `agent-${i}`, reason: 'answer', usage: USAGE })
  }
  // The list lets the oldest go; the engine still lists all 27.
  await clock.advance(10_000)
  const kept = await roster()
  // 24 free ones and the newest, kept while it started; no name taken twice.
  expect(kept.split('\n')[0]).toBe("Nova's crew (25):")
  expect(kept).not.toMatch(/- Pip:/)
  expect(kept).not.toMatch(/repo \/work\/main/)
  expect(kept).not.toMatch(/0 tokens/)

  await crewCommand($, 'clear')
  await clock.advance(10_000)
  expect(await roster()).toBe("Nova's crew is empty.")

  // Woken by a message, Pip is back with its repository, history and report.
  running.add('agent-1')
  await clock.advance(4000)
  expect(await roster('pip')).toMatch(
    /^- Pip: address "pip", working, repo \/work\/r1, model test-model, 1 task, ~45k tokens, last task "Task 1".*\n {2}last report: Informe 1$/,
  )
  expect((await roster()).split('\n')[0]).toBe("Nova's crew (1):")
})

test('the roster shows one worker in full when asked', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Map the billing code', title: 'Billing map', repo: '/work/api' })
  const answer = `Billing: ${'y'.repeat(500)}`
  await $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  const roster = async (worker?: string) => String((await $.tool.call({ tool: 'mcp__crew__roster', ...(worker ? { worker } : {}) })).result)

  const one = await roster('pip')
  expect(one).toMatch(/^- Pip: address "pip", done, repo \/work\/api, .*last task "Billing map"\n {2}last report: Billing: y+$/)
  expect(one).toContain(answer)
  expect(await roster()).toMatch(/last report: Billing: y+…$/)
  expect(await roster('nobody')).toBe('crew: no worker "nobody". Workers: pip.')
})

test('one worker asked for alone shows its report whole, line by line; the list keeps its cut', async ($, on) => {
  let spawned = 0
  const clock = engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const roster = async (worker?: string) => String((await $.tool.call({ tool: 'mcp__crew__roster', ...(worker ? { worker } : {}) })).result)
  const done = (agentId: string, answer: string) =>
    $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'answer' })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Map the billing code', title: 'Billing map', repo: '/work/api' })
  const files = Array.from({ length: 120 }, (_, i) => `- src/billing/module-${i}.ts: ${'x'.repeat(30)}`)
  const answer = ['Billing mapped.  ', '', '', 'Files:', ...files, '', 'Checks: 42 pass.', ''].join('\n')
  expect(answer.length).toBeGreaterThan(5000)
  await done('agent-1', answer)

  // Whole: every line under the label, indented, with no space left at a line's end and one blank line at most.
  const one = await roster('pip')
  const shown = one.split('\n')
  expect(shown[0]).toMatch(/^- Pip: address "pip", done, repo \/work\/api, .*last task "Billing map"$/)
  expect(shown.slice(1, 5)).toEqual(['  last report:', '  Billing mapped.', '', '  Files:'])
  for (const file of files) expect(one).toContain(`\n  ${file}\n`)
  expect(one.endsWith('\n\n  Checks: 42 pass.')).toBe(true)
  // The list still shows 120 characters of it on one line.
  const all = (await roster()).split('\n')
  expect(all[2]).toMatch(/^ {2}last report: Billing mapped\. Files: - src\/billing\/module-0\.ts: x+.*…$/)
  expect(all[2]!.length).toBe('  last report: '.length + 120)

  // Past the bound it is cut, and says so.
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'List every route', title: 'Routes', repo: '/work/api', fresh: true })
  await done('agent-2', Array.from({ length: 400 }, (_, i) => `route ${i}: ${'y'.repeat(40)}`).join('\n'))
  const cut = (await roster('bolt')).split('\n  last report:\n')[1]!
  expect(cut.endsWith('…')).toBe(true)
  expect(cut.replace(/^ {2}/gm, '').length).toBe(8000)

  // A worker the list let go still shows it when asked for by name.
  await crewCommand($, 'clear')
  await clock.advance(10_000)
  expect(await roster()).toBe("Nova's crew is empty.")
  expect(await roster('pip')).toContain('\n  Checks: 42 pass.')
})

test('only the latest reports are kept whole; an older worker shows the line it keeps, and a run that says nothing shows none', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const roster = async (worker: string) => String((await $.tool.call({ tool: 'mcp__crew__roster', worker })).result)
  const done = (agentId: string, answer: string) =>
    $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: `t-${agentId}-${answer.length}`, agentId, reason: 'answer' })
  for (let i = 1; i <= 26; i++) {
    await $.tool.call({ tool: 'mcp__crew__delegate', task: `Task ${i}`, repo: `/work/r${i}`, fresh: true })
    await done(`agent-${i}`, `Report ${i}\nline two`)
  }
  // 24 are kept whole: the two oldest fall back to their one line.
  expect(await roster('agent-2')).toMatch(/\n {2}last report: Report 2 line two$/)
  expect(await roster('agent-3')).toMatch(/\n {2}last report:\n {2}Report 3\n {2}line two$/)
  expect(await roster('agent-26')).toMatch(/\n {2}last report:\n {2}Report 26\n {2}line two$/)

  // Its next run ends with nothing said: the report of the run before is not shown as its last.
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Again', worker: 'agent-26' })
  await done('agent-26', '')
  expect(await roster('agent-26')).not.toMatch(/last report/)
})

test('an agent status the crew has no word for leaves each worker as the crew knew it', async ($, on) => {
  let spawned = 0
  const status = new Map<string, AgentInfo['status']>()
  const infos = (): AgentInfo[] => [...status].map(([id, s]) => ({ id, description: `Task of ${id}`, type: 'general-purpose', status: s }))
  engine(on, { nextId: () => `agent-${++spawned}`, agents: infos })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const roster = async () => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  // What an engine newer than the crew's types may report.
  const unknown = 'paused' as AgentInfo['status']

  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Task 1', repo: '/work/api' })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Task 2', repo: '/work/web' })
  status.set('agent-1', 'running').set('agent-2', 'running')
  await $.turn.complete({ answer: 'Hecho', durationMs: 1, isAborted: false, turnId: 't2', agentId: 'agent-2', reason: 'answer' })
  status.set('agent-2', 'completed')
  await crewCommand($, 'clear')
  expect(await roster()).toMatch(/^Nova's crew \(1\):\n- Pip: address "pip", working, /)

  // Pip stays busy, Bolt stays cleared, and an agent the crew never knew waits.
  status.set('agent-1', unknown).set('agent-2', unknown).set('agent-9', unknown)
  expect(await roster()).toMatch(/^Nova's crew \(1\):\n- Pip: address "pip", working, /)

  // A status the crew reads brings them in.
  status.set('agent-2', 'running').set('agent-9', 'idle')
  const text = await roster()
  expect(text.split('\n')[0]).toBe("Nova's crew (3):")
  expect(text).toMatch(/\n- Bolt: address "bolt", working, repo \/work\/web, /)
  expect(text).toMatch(/\n- \w+: address "agent-9", idle, /)
})

test('the roster keeps to the active in full and cuts old reports', async ($, on) => {
  let spawned = 0
  const clock = engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= 14; i++) {
    await $.tool.call({ tool: 'mcp__crew__delegate', task: `Task ${i}`, repo: `/work/r${i}` })
  }
  for (let i = 1; i <= 13; i++) {
    await clock.advance(1000)
    await $.turn.complete({
      answer: `Informe ${i}: ${'x'.repeat(300)}`,
      durationMs: 1000,
      isAborted: false,
      turnId: `t${i}`,
      agentId: `agent-${i}`,
      reason: 'answer',
      usage: USAGE,
    })
  }

  const text = String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  const lines = text.split('\n')
  expect(lines[0]).toBe("Nova's crew (14):")
  expect(lines[1]).toMatch(/^- \S+: address "\S+", starting, repo \/work\/r14, model test-model, 1 task, 0 tokens, last task "Task 14"/)
  expect(lines[2]).toMatch(/^- \S+: address "\S+", done, repo \/work\/r13, model test-model, 1 task, ~45k tokens, last task "Task 13"$/)
  const reports = lines.filter(x => x.startsWith('  last report: '))
  expect(reports).toHaveLength(3)
  expect(reports[0]).toMatch(/^ {2}last report: Informe 13: x+…$/)
  expect(reports[0]!.length).toBe('  last report: '.length + 120)
  expect(text).not.toMatch(/Informe 10:/)
  expect(lines.filter(x => x.startsWith('- '))).toHaveLength(12)
  expect(lines[lines.length - 1]).toBe('+2 more')
})
