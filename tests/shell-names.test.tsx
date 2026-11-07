// A worker's background shells and Monitors carry its name ahead of their
// description, so Claude Code's own list of what runs tells whose each one
// is; the main conversation's calls and a foreground shell keep theirs.
import { expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { TestBody } from 'claude-code/testing'
import { progressCrew, test } from './support/crew'

// A crew whose engine answers every shell and Monitor call, keeping the
// description each one reached it with.
async function shellCrew($: Parameters<TestBody>[0], on: On) {
  const seen: (string | undefined)[] = []
  on('tool.call', { tool: ['Bash', 'PowerShell', 'Monitor'] }, (_, e) => {
    seen.push((e as { description?: string }).description)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('tool.check', () => ({ decision: 'allow' as const }))
  const crew = await progressCrew($, on)
  await crew.delegate('Run the tests', '/work/web', 'Tests')
  return { ...crew, seen }
}

const call = ($: Parameters<TestBody>[0], input: Record<string, unknown>) => $.tool.call(input as never)

test("a worker's background shell shows its name ahead of the description", async ($, on) => {
  const { seen } = await shellCrew($, on)
  await call($, { tool: 'Bash', command: 'npm run dev', description: 'Start the dev server', run_in_background: true, agentId: 'agent-1' })
  await call($, { tool: 'PowerShell', command: 'npm test', description: 'Run the tests', run_in_background: true, agentId: 'agent-1' })
  expect(seen).toEqual(['(Pip) Start the dev server', '(Pip) Run the tests'])
})

test('a background shell with no description shows its command after the name', async ($, on) => {
  const { seen } = await shellCrew($, on)
  await call($, { tool: 'Bash', command: 'npm run dev', run_in_background: true, agentId: 'agent-1' })
  expect(seen).toEqual(['(Pip) npm run dev'])
})

test("a worker's Monitor shows its name ahead of the description", async ($, on) => {
  const { seen } = await shellCrew($, on)
  await call($, { tool: 'Monitor', command: 'npm test', description: 'Watch the tests', timeout_ms: 60_000, agentId: 'agent-1' })
  expect(seen).toEqual(['(Pip) Watch the tests'])
})

test('a description that already has the name keeps it once', async ($, on) => {
  const { seen } = await shellCrew($, on)
  await call($, { tool: 'Bash', command: 'npm run dev', description: '(Pip) Start the dev server', run_in_background: true, agentId: 'agent-1' })
  expect(seen).toEqual(['(Pip) Start the dev server'])
})

test("the main conversation's shells and a worker's foreground shell keep their description", async ($, on) => {
  const { seen } = await shellCrew($, on)
  await call($, { tool: 'Bash', command: 'npm start', description: 'Start the app', run_in_background: true })
  await call($, { tool: 'Monitor', command: 'npm test', description: 'Watch the tests', timeout_ms: 60_000 })
  await call($, { tool: 'Bash', command: 'npm test', description: 'Run the tests', agentId: 'agent-1' })
  await call($, { tool: 'Bash', command: 'ls', description: 'List files', run_in_background: true, agentId: 'agent-9' })
  expect(seen).toEqual(['Start the app', 'Watch the tests', 'Run the tests', 'List files'])
})
