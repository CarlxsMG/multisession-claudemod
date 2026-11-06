import { expect, test } from 'claude-code/testing'

import type { RunEndKind } from '../../types'
import { ACTIVE, FINISHED } from '../../src/crew/workers'
import { closeRun, endOf, hasEnded, openRun } from '../../src/progress/runs'

test('every status the crew calls finished is the end of its run', () => {
  expect([...FINISHED].map(endOf)).toEqual([...FINISHED])
  expect(endOf('failed')).toBe('failed')
  expect(endOf('stopped')).toBe('stopped')
})

test('a run ends as done when its worker does not say how: busy, free or not on the list', () => {
  for (const status of ACTIVE) expect(endOf(status)).toBe('done')
  expect(endOf('idle')).toBe('done')
  expect(endOf(undefined)).toBe('done')
})

test('a run has not ended while it is open, and has ended however it closes', () => {
  const open = openRun([], 'a', 1000)
  expect(open.filter(hasEnded)).toEqual([])
  for (const end of ['done', 'failed', 'stopped'] as const) {
    const ends: RunEndKind[] = closeRun(open, 'a', end, 2000)
      .filter(hasEnded)
      .map(r => r.end)
    expect(ends).toEqual([end])
  }
})
