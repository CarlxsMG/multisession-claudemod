import { expect } from 'claude-code/testing'

import { bareTitle, namedTitle } from '../../src/crew/title'
import { test } from '../support/crew'

test("a title takes its worker's name ahead once, and gives back the bare one", () => {
  expect(namedTitle('Mika', 'Background task registry + cleanup')).toBe('(Mika) Background task registry + cleanup')
  expect(namedTitle('Mika', '(Mika) Fix the tests')).toBe('(Mika) Fix the tests')
  expect(namedTitle('Mika', '(mika) Fix the tests')).toBe('(Mika) Fix the tests')
  expect(namedTitle('Mika', '')).toBe('')
  expect(namedTitle('', 'Fix the tests')).toBe('Fix the tests')
  expect(bareTitle('(Mika) Fix the tests', 'Mika')).toBe('Fix the tests')
  // Another crew member's name, or the pool's, goes with it: one name only.
  expect(namedTitle('Olga', '(Pau) Fix the tests', new Set(['pau']))).toBe('(Olga) Fix the tests')
  expect(namedTitle('Leo', '(Gigi) Fix the tests')).toBe('(Leo) Fix the tests')
  expect(namedTitle('Quin', '(Quin) (Vera) Fix the tests', new Set(['vera']))).toBe('(Quin) Fix the tests')
  expect(bareTitle('(Bolt) (Mika) Fix the tests')).toBe('Fix the tests')
  // A name the crew does not know, or brackets that are part of the title, stay.
  expect(bareTitle('(Pau) Fix the tests', 'Mika')).toBe('(Pau) Fix the tests')
  expect(bareTitle('(see #12) Fix the tests')).toBe('(see #12) Fix the tests')
  expect(bareTitle('(A12) Fix the tests')).toBe('Fix the tests')
  expect(bareTitle('Fix the tests')).toBe('Fix the tests')
})
