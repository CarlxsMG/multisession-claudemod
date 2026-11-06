import { expect, test } from 'claude-code/testing'

import { appendKept, setKept } from '../../src/util/bounded'

test('a kept list appends, drops the older copy of a key and keeps the newest', () => {
  expect(appendKept([1, 2, 3], [4, 5], 4)).toEqual([2, 3, 4, 5])
  const list = [
    { id: 'a', n: 1 },
    { id: 'b', n: 2 },
  ]
  expect(appendKept(list, [{ id: 'a', n: 3 }], 5, x => x.id)).toEqual([
    { id: 'b', n: 2 },
    { id: 'a', n: 3 },
  ])
  expect(appendKept(list, [{ id: 'c', n: 4 }], 2, x => x.id)).toEqual([
    { id: 'b', n: 2 },
    { id: 'c', n: 4 },
  ])
})

test('a kept map makes a key set again the newest, and drops the oldest past its size', () => {
  const map = new Map([
    ['a', 1],
    ['b', 2],
  ])
  setKept(map, 'a', 3, 2)
  expect([...map]).toEqual([
    ['b', 2],
    ['a', 3],
  ])
  setKept(map, 'c', 4, 2)
  expect([...map]).toEqual([
    ['a', 3],
    ['c', 4],
  ])
})
