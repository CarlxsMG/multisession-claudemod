import { expect } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'
import { SLOW, USAGE, crewCommand, engine, test } from './support/crew'

test('the roster keeps to the active in full and cuts old reports', async ($, on) => {
  let spawned = 0
  const clock = engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= 14; i++) {
    await $.tool.call({ tool: 'mcp__crew__delegate', task: `Task ${i}`, repo: `/work/r${i}` })
  }
  for (let i = 1; i <= 13; i++) {
    await clock.advance(1000)
    await $.turn.complete({ answer: `Informe ${i}: ${'x'.repeat(300)}`, durationMs: 1000, isAborted: false, turnId: `t${i}`, agentId: `agent-${i}`, reason: 'answer', usage: USAGE })
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

test('workers the user clears or the list lets go stay off until they wake, and come back whole', SLOW, async ($, on) => {
  let spawned = 0
  const running = new Set<string>()
  const infos = (): AgentInfo[] =>
    Array.from({ length: spawned }, (_, k) => {
      const id = `agent-${k + 1}`
      return { id, name: id === 'agent-1' ? 'pip' : undefined, description: `Task ${k + 1}`, type: 'general-purpose', status: running.has(id) ? 'running' : 'completed' }
    })
  const clock = engine(on, { nextId: () => `agent-${++spawned}`, agents: infos })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const roster = async (worker?: string) =>
    String((await $.tool.call({ tool: 'mcp__crew__roster', ...(worker ? { worker } : {}) })).result)

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

  await crewCommand($, 'limpiar')
  await clock.advance(10_000)
  expect(await roster()).toBe("Nova's crew is empty.")

  // Woken by a message, Pip is back with its repository, history and report.
  running.add('agent-1')
  await clock.advance(4000)
  expect(await roster('pip')).toMatch(/^- Pip: address "pip", working, repo \/work\/r1, model test-model, 1 task, ~45k tokens, last task "Task 1".*\n {2}last report: Informe 1$/)
  expect((await roster()).split('\n')[0]).toBe("Nova's crew (1):")
})

test('the roster shows one worker in full when asked', async ($, on) => {
  let spawned = 0
  engine(on, { nextId: () => `agent-${++spawned}` })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Map the billing code', title: 'Billing map', repo: '/work/api' })
  const answer = `Billing: ${'y'.repeat(500)}`
  await $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: 't1', agentId: 'agent-1', reason: 'answer' })
  const roster = async (worker?: string) =>
    String((await $.tool.call({ tool: 'mcp__crew__roster', ...(worker ? { worker } : {}) })).result)

  const one = await roster('pip')
  expect(one).toMatch(/^- Pip: address "pip", done, repo \/work\/api, .*last task "Billing map"\n {2}last report: Billing: y+$/)
  expect(one).toContain(answer)
  expect(await roster()).toMatch(/last report: Billing: y+…$/)
  expect(await roster('nobody')).toBe('crew: no worker "nobody". Workers: pip.')
})
