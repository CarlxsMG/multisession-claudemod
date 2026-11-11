import { expect, test } from 'claude-code/testing'

import { NEW_NONE_FREE, PICKED_FREE, delegatedTo, given, headsUp, heldFor, pickedFree, readDelegate, started, unsureSend } from '../../src/prompts/results'

const pip = { name: 'Pip', address: 'pip' }

test("delegate's results read back as the row says them: reused, new, or held and for whom", () => {
  expect(readDelegate(given(pip, '/work/api', PICKED_FREE, ''))).toEqual({ kind: 'reused', busy: [] })
  expect(readDelegate(started('Pip', 'pip', 'agent-1', '/work/api', NEW_NONE_FREE, ''))).toEqual({ kind: 'new', busy: [] })
  expect(readDelegate(started('Pip', 'pip', undefined, '/work/api', NEW_NONE_FREE, ''))).toEqual({ kind: 'new', busy: [] })
  expect(readDelegate(heldFor(pip, 'Bolt', 1))).toEqual({ kind: 'held', by: 'Bolt' })
  expect(readDelegate(heldFor(pip, 'Bolt', 3))).toEqual({ kind: 'held', by: 'Bolt' })
})

test('the workers a heads-up names read back from the result, one or several', () => {
  expect(readDelegate(started('Mika', 'mika', 'agent-3', '/work/api', NEW_NONE_FREE, headsUp(['Pip'])))).toEqual({ kind: 'new', busy: ['Pip'] })
  expect(readDelegate(given(pip, '/work/api', PICKED_FREE, headsUp(['Bolt', 'Mika'])))).toEqual({ kind: 'reused', busy: ['Bolt', 'Mika'] })
  expect(headsUp([])).toBe('')
})

test('a heads-up says what each busy worker has edited so far: the latest four by name, the earlier counted, or none', () => {
  expect(headsUp(['Pip'])).toBe('\nHeads-up: Pip is working in this repository; keep files apart or wait for its report.\nFiles edited so far: Pip: none yet.')
  const edits = new Map([
    ['Pip', ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts']],
    ['Bolt', ['docs/x.md']],
  ])
  const text = headsUp(['Pip', 'Bolt', 'Mika'], edits)
  expect(text.split('\n')[2]).toBe('Files edited so far: Pip: c.ts, d.ts, e.ts, f.ts and 2 more; Bolt: docs/x.md; Mika: none yet.')
  // The row still reads who is busy from the first line.
  expect(readDelegate(started('Tito', 'tito', 'agent-4', '/work/api', NEW_NONE_FREE, text))).toEqual({ kind: 'new', busy: ['Pip', 'Bolt', 'Mika'] })
})

test('a free worker picked over others names up to three of them and counts the rest, and still reads back', () => {
  expect(pickedFree([])).toBe(PICKED_FREE)
  expect(pickedFree(['Bolt'])).toBe(`${PICKED_FREE} (also free: Bolt; name one with \`worker\` to pick it)`)
  expect(pickedFree(['Bolt', 'Mika', 'Tito'])).toMatch(/\(also free: Bolt, Mika, Tito; /)
  const many = pickedFree(['Bolt', 'Mika', 'Tito', 'Luna', 'Rex'])
  expect(many).toMatch(/\(also free: Bolt, Mika, Tito and 2 more; /)
  const result = given(pip, '/work/api', many, headsUp(['Nova']))
  expect(readDelegate(result)).toEqual({ kind: 'reused', busy: ['Nova'] })
  expect(delegatedTo(result)).toEqual({ id: '', name: 'Pip', address: 'pip' })
})

test('a result delegate did not write reads as nothing', () => {
  expect(readDelegate('crew: `task` is required.')).toBeUndefined()
  expect(readDelegate('')).toBeUndefined()
  // A send that may have gone out gave the task to no one the crew knows of.
  const unsure = unsureSend(pip, [{ name: 'Bolt', reason: 'crew: the agent is gone.' }])
  expect(readDelegate(unsure)).toBeUndefined()
  expect(delegatedTo(unsure)).toBeUndefined()
})

test("the worker a delegate result reached reads back from it, with the id a new one's gives", () => {
  expect(delegatedTo(started('Pip', 'pip', 'agent-1', '/work/api', NEW_NONE_FREE, headsUp(['Bolt'])))).toEqual({ id: 'agent-1', name: 'Pip', address: 'pip' })
  expect(delegatedTo(started('Pip', 'pip', undefined, '/work/api', NEW_NONE_FREE, ''))).toEqual({ id: '', name: 'Pip', address: 'pip' })
  expect(delegatedTo(given({ name: 'Bolt', address: 'a1b2c3' }, 'a worktree of /work/api', PICKED_FREE, ''))).toEqual({
    id: '',
    name: 'Bolt',
    address: 'a1b2c3',
  })
  expect(delegatedTo(heldFor(pip, 'Bolt', 2))).toEqual({ id: '', name: 'Pip', address: 'pip' })
  expect(delegatedTo('crew: no worker "nadie". Workers: none.')).toBeUndefined()
})
