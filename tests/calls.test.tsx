import { expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { progressCrew, teamTexts, test } from './support/crew'

// The atoms the pane draws a worker from: each write of either draws it whole.
const countWrites = (on: On) => {
  const writes = { workers: 0, runs: 0 }
  on('state.set', { plugin: 'crew', key: 'workers' }, (_, e, next) => {
    writes.workers += 1
    return next(e)
  })
  on('state.set', { plugin: 'crew', key: 'runs' }, (_, e, next) => {
    writes.runs += 1
    return next(e)
  })
  return writes
}

const read = (agentId: string, i: number) => ({ tool: 'Read', file_path: `/work/api/src/f${i}.ts`, agentId }) as const

test("a busy worker's calls between two of the pane's frames are written once, at the next, and each one counts", async ($, on) => {
  const writes = countWrites(on)
  const { clock, delegate } = await progressCrew($, on)
  await delegate('Read the session bus', '/work/api', 'Session bus')
  await $.tool.call(read('agent-1', 0))
  await clock.advance(400)
  writes.workers = 0
  writes.runs = 0

  for (let i = 1; i <= 20; i++) await $.tool.call(read('agent-1', i))
  expect(writes).toEqual({ workers: 0, runs: 0 })

  await clock.advance(400)
  expect(writes).toEqual({ workers: 1, runs: 1 })
  const roster = String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  expect(roster).toMatch(/^- Pip: address "[^"]+", working \(Read f20\.ts\), .*, 21 tool calls, /m)
  expect(await teamTexts($)).toContainEqual(expect.stringMatching(/^\d+s · 21 calls$/))
})

test('a run that ends before the next frame counts every call, and its worker ends doing nothing', async ($, on) => {
  const { clock, delegate, end } = await progressCrew($, on)
  await delegate('Read the session bus', '/work/api', 'Session bus')
  for (let i = 0; i < 5; i++) await $.tool.call(read('agent-1', i))
  await end('agent-1')
  const roster = async () => String((await $.tool.call({ tool: 'mcp__crew__roster' })).result)
  expect(await roster()).toMatch(/^- Pip: address "pip", idle, repo /m)
  expect(await teamTexts($)).toContainEqual(expect.stringMatching(/^last \d+s · 5 calls$/))

  // The next frame has nothing left to write.
  await clock.advance(400)
  expect(await roster()).toMatch(/^- Pip: address "pip", idle, repo /m)
  expect(await teamTexts($)).toContainEqual(expect.stringMatching(/^last \d+s · 5 calls$/))
})
