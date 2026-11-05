import { expect, test } from 'claude-code/testing'

import type { Worker, WorkerStatus } from '../../types'
import { findWorker, makeWorker, nextName, prune } from '../../src/crew/workers'

const worker = (id: string, name: string, status: WorkerStatus, updatedAt = 0): Worker => ({
  ...makeWorker({ id, name, address: name.toLowerCase(), task: '', type: 'general-purpose', cwd: '/work', status, model: '', asked: '' }, 0),
  updatedAt,
})

test('a new worker takes the first name not taken, whatever its case, then the names again with a number', () => {
  expect(nextName([])).toBe('Pip')
  expect(nextName([worker('a', 'pip', 'idle')])).toBe('Bolt')
  expect(nextName([], ['pip', 'bolt'])).toBe('Mika')
  const all = ['Pip', 'Bolt', 'Mika', 'Tito', 'Luna', 'Rex', 'Kiko', 'Nube', 'Chispa', 'Coco',
    'Bruno', 'Lola', 'Zuri', 'Momo', 'Gus', 'Nina', 'Pixel', 'Byte', 'Toby', 'Kira']
  expect(nextName(all.map((n, i) => worker(`w${i}`, n, 'idle')))).toBe('Pip2')
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
