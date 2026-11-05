import { expect, test } from 'claude-code/testing'

import { given, headsUp, heldFor, readDelegate, started } from '../../src/prompts/results'

const pip = { name: 'Pip', address: 'pip' }

test("delegate's results read back as the row says them: reused, new, or held and for whom", () => {
  expect(readDelegate(given(pip, '/work/api', ''))).toEqual({ kind: 'reused', busy: [] })
  expect(readDelegate(started('Pip', 'pip', 'agent-1', '/work/api', ''))).toEqual({ kind: 'new', busy: [] })
  expect(readDelegate(started('Pip', 'pip', undefined, '/work/api', ''))).toEqual({ kind: 'new', busy: [] })
  expect(readDelegate(heldFor(pip, 'Bolt', 1))).toEqual({ kind: 'held', by: 'Bolt' })
  expect(readDelegate(heldFor(pip, 'Bolt', 3))).toEqual({ kind: 'held', by: 'Bolt' })
})

test("the workers a heads-up names read back from the result, one or several", () => {
  expect(readDelegate(started('Mika', 'mika', 'agent-3', '/work/api', headsUp(['Pip'])))).toEqual({ kind: 'new', busy: ['Pip'] })
  expect(readDelegate(given(pip, '/work/api', headsUp(['Bolt', 'Mika'])))).toEqual({ kind: 'reused', busy: ['Bolt', 'Mika'] })
  expect(headsUp([])).toBe('')
})

test("a result delegate did not write reads as nothing", () => {
  expect(readDelegate('crew: `task` is required.')).toBeUndefined()
  expect(readDelegate('')).toBeUndefined()
})
