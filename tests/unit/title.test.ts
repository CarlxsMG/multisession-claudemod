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
  // Another name, or brackets that are part of the title, stay.
  expect(bareTitle('(Bolt) Fix the tests', 'Mika')).toBe('(Bolt) Fix the tests')
  expect(bareTitle('(see #12) Fix the tests')).toBe('(see #12) Fix the tests')
  expect(bareTitle('(A12) Fix the tests')).toBe('Fix the tests')
  expect(bareTitle('Fix the tests')).toBe('Fix the tests')
})
