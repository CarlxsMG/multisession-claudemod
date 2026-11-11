import { expect, test } from 'claude-code/testing'

import type { RunEndKind } from '../../types'
import { ACTIVE, FINISHED } from '../../src/crew/workers'
import { EDITS_KEEP, addEdits, closeRun, endOf, hasEnded, openRun } from '../../src/progress/runs'

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

test('an open run keeps the files it edited, each once in the order first edited, the latest of them', () => {
  const open = openRun([], 'a', 1000)
  expect(addEdits(open, 'a', [])[0]!.edited).toBeUndefined()
  const once = addEdits(open, 'a', ['/w/a.ts', '/w/b.ts', '/w/a.ts'])
  expect(once[0]!.edited).toEqual(['/w/a.ts', '/w/b.ts'])
  // Edited again, a file stays where it was; on Windows whatever its case and slashes.
  expect(addEdits(once, 'a', ['/w/b.ts', '/w/c.ts'])[0]!.edited).toEqual(['/w/a.ts', '/w/b.ts', '/w/c.ts'])
  expect(addEdits(addEdits(open, 'a', ['C:\\w\\A.ts']), 'a', ['c:/w/a.ts'])[0]!.edited).toEqual(['C:\\w\\A.ts'])
  // Another worker's run and a run that ended take none.
  expect(addEdits(once, 'b', ['/w/z.ts'])).toEqual(once)
  expect(addEdits(closeRun(once, 'a', 'done', 2000), 'a', ['/w/z.ts'])[0]!.edited).toEqual(['/w/a.ts', '/w/b.ts'])
  const many = addEdits(
    open,
    'a',
    Array.from({ length: EDITS_KEEP + 5 }, (_, i) => `/w/f${i}.ts`),
  )
  expect(many[0]!.edited).toHaveLength(EDITS_KEEP)
  expect(many[0]!.edited![0]).toBe('/w/f5.ts')
})
