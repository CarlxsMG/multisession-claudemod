import { expect, test } from 'claude-code/testing'

import type { Worker, WorkerStatus } from '../../types'
import { claimName, findWorker, makeWorker, prune, statusOf, takenNames } from '../../src/crew/workers'
import { WORKER_NAMES, freshName, isWorkerName } from '../../src/persona/names'

const worker = (id: string, name: string, status: WorkerStatus, updatedAt = 0): Worker => ({
  ...makeWorker({ id, name, address: name.toLowerCase(), task: '', type: 'general-purpose', cwd: '/work', status, model: '', asked: '' }, 0),
  updatedAt,
})

test('the pool holds only names of 2 to 4 characters, no two alike', () => {
  expect(WORKER_NAMES.filter(name => !isWorkerName(name))).toEqual([])
  expect(new Set(WORKER_NAMES.map(name => name.toLowerCase())).size).toBe(WORKER_NAMES.length)
  expect(['qa', 'DB-1', 'ñu', 'x_y'].every(isWorkerName)).toBe(true)
  expect(['x', 'Chispa', 'a b', 'ok!', '名前'].some(isWorkerName)).toBe(false)
})

test('a fresh name is the first of the pool not taken, whatever its case, then a letter and a number no one has', () => {
  expect(freshName(new Set())).toBe('Pip')
  expect(freshName(takenNames([worker('a', 'pip', 'idle')]))).toBe('Bolt')
  expect(freshName(takenNames([worker('a', 'PIP', 'idle'), { ...worker('b', 'Gus', 'done'), address: 'BOLT' }]))).toBe('Mika')
  const pool = new Set(WORKER_NAMES.map(name => name.toLowerCase()))
  expect(freshName(pool)).toBe('A1')
  expect(freshName(new Set([...pool, 'a1', 'b1']))).toBe('C1')
  const taken = new Set(pool)
  const given: string[] = []
  for (let i = 0; i < 300; i++) {
    const name = freshName(taken)
    given.push(name)
    taken.add(name.toLowerCase())
  }
  expect(given.filter(name => !isWorkerName(name))).toEqual([])
  expect(given.slice(0, 3)).toEqual(['A1', 'B1', 'C1'])
  expect(given[26]).toBe('A2')
})

test('a name a call gives is kept when it fits and is free, else a fresh one takes its place, and none is given twice', () => {
  expect(claimName(new Set(), 'qa')).toEqual({ name: 'Qa', isWantedFree: true })
  // Taken from the moment it was given, in any case.
  expect(claimName(new Set(), 'QA')).toEqual({ name: 'Pip', isWantedFree: false })
  // Too long for a card: a fresh name, the one given still free as its address.
  expect(claimName(new Set(), 'researcher')).toEqual({ name: 'Bolt', isWantedFree: true })
  expect(claimName(new Set(), 'researcher')).toEqual({ name: 'Mika', isWantedFree: false })
  expect(claimName(new Set(), 'x')).toEqual({ name: 'Tito', isWantedFree: true })
  // Another member's name or address.
  const gus = { ...worker('agent-9', 'Gus', 'done'), address: 'scout' }
  expect(claimName(takenNames([gus]), 'gus')).toEqual({ name: 'Luna', isWantedFree: false })
  expect(claimName(takenNames([gus]), 'scout')).toEqual({ name: 'Rex', isWantedFree: false })
  expect(claimName(takenNames([gus]))).toEqual({ name: 'Kiko', isWantedFree: false })
})

test('a worker is found by its id, its address or its name, an address with a " [ref]" too', () => {
  const list = [worker('agent-1', 'Pip', 'working'), worker('agent-2', 'Bolt', 'idle')]
  expect(findWorker(list, 'agent-2')?.name).toBe('Bolt')
  expect(findWorker(list, 'PIP')?.id).toBe('agent-1')
  expect(findWorker(list, 'bolt [3fa9c1]')?.id).toBe('agent-2')
  expect(findWorker(list, 'nobody')).toBeUndefined()
})

test('the list keeps every active worker and the 24 most recent others, and hands on the rest', () => {
  const idle = Array.from({ length: 30 }, (_, i) => worker(`idle-${i}`, `W${i}`, 'done', i))
  const active = [worker('busy', 'Busy', 'working', -1)]
  const out: Worker[] = []
  const kept = prune([...active, ...idle], out)
  expect(kept).toHaveLength(25)
  expect(kept.some(w => w.id === 'busy')).toBe(true)
  expect(out.map(w => w.id).sort()).toEqual(['idle-0', 'idle-1', 'idle-2', 'idle-3', 'idle-4', 'idle-5'])
})

test("a worker's status from each of the engine's, and none from one the crew has no word for", () => {
  const states = ['pending', 'running', 'waiting', 'idle', 'completed', 'failed', 'killed']
  expect(states.map(statusOf)).toEqual(['starting', 'working', 'waiting', 'idle', 'done', 'failed', 'stopped'])
  expect(statusOf('paused')).toBeUndefined()
  expect(statusOf('toString')).toBeUndefined()
})
