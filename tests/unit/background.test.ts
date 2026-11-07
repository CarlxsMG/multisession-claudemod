import { expect, test } from 'claude-code/testing'

import type { BackgroundTask } from '../../types'
import {
  LIST_GRACE_MS,
  MAX_TASKS,
  PARKED_STOP_MS,
  addTask,
  dropTask,
  isDueForStop,
  isGone,
  keepLive,
  markStopFailed,
  ownerEnded,
  ownerResumed,
  stoppedId,
  taskOfCall,
} from '../../src/background/tasks'

const shell = (id: string, extra: Partial<BackgroundTask> = {}): BackgroundTask => ({ id, command: 'npm run dev', kind: 'shell', startedAt: 0, ...extra })

test('a backgrounded shell or a Monitor is a task, with the agent that started it; a foreground call is none', () => {
  expect(taskOfCall('Bash', { command: 'npm run dev' }, { stdout: '', backgroundTaskId: 'b1' }, 'agent-1', 500)).toEqual({
    id: 'b1',
    agentId: 'agent-1',
    command: 'npm run dev',
    kind: 'shell',
    startedAt: 500,
  })
  expect(taskOfCall('PowerShell', { command: 'Get-Content -Wait x.log' }, { backgroundTaskId: 'p1', backgroundWakesOwner: true }, undefined, 9)).toEqual({
    id: 'p1',
    command: 'Get-Content -Wait x.log',
    kind: 'shell',
    startedAt: 9,
    wakesOwner: true,
  })
  expect(taskOfCall('Monitor', { command: 'tail -f a.log', description: 'log' }, { taskId: 'm1', timeoutMs: 0 }, 'agent-2', 1)?.kind).toBe('monitor')
  expect(taskOfCall('Monitor', { ws: { url: 'ws://x' }, description: 'socket' }, { taskId: 'm2' }, 'agent-2', 1)?.command).toBe('ws://x')
  expect(taskOfCall('Bash', { command: 'ls' }, { stdout: 'a' }, 'agent-1', 1)).toBeUndefined()
  expect(taskOfCall('Read', { file_path: 'a' }, { backgroundTaskId: 'x' }, undefined, 1)).toBeUndefined()
})

test('a shell the engine ends with its caller is no task: nothing is left to stop', () => {
  expect(taskOfCall('Bash', { command: 'sleep 9' }, { backgroundTaskId: 'b1', backgroundEndsWithFinalResponse: true }, 'agent-1', 1)).toBeUndefined()
})

test('a TaskStop names its task by task_id, or by the older shell_id', () => {
  expect(stoppedId({ task_id: 'b1' })).toBe('b1')
  expect(stoppedId({ shell_id: 'b2' })).toBe('b2')
  expect(stoppedId({})).toBe('')
})

test('the registry keeps one entry per id, the newest, and forgets the oldest past its size', () => {
  const list = addTask(addTask([shell('a')], shell('b')), shell('a', { command: 'again' }))
  expect(list.map(x => [x.id, x.command])).toEqual([
    ['b', 'npm run dev'],
    ['a', 'again'],
  ])
  expect(dropTask(list, 'a').map(x => x.id)).toEqual(['b'])
  let many: BackgroundTask[] = []
  for (let i = 0; i <= MAX_TASKS; i++) many = addTask(many, shell(`t${i}`))
  expect(many.length).toBe(MAX_TASKS)
  expect(many[0]!.id).toBe('t1')
})

test('the engine list of work in flight drops what ended, but not a task too young to be on it', () => {
  const list = [shell('old'), shell('live'), shell('young', { startedAt: 10_000 })]
  expect(keepLive(list, ['live'], 10_000 + LIST_GRACE_MS - 1).map(x => x.id)).toEqual(['live', 'young'])
  expect(keepLive(list, ['live'], 10_000 + LIST_GRACE_MS).map(x => x.id)).toEqual(['live'])
})

test("a worker's task is stopped once its turn ends; one it waits for only past the parked time", () => {
  const list = ownerEnded([shell('a', { agentId: 'w' }), shell('b', { agentId: 'w', wakesOwner: true }), shell('c', { agentId: 'x' })], 'w', 1000)
  const [a, b, c] = list
  expect(isDueForStop(a!, 1000)).toBe(true)
  expect(isDueForStop(b!, 1000 + PARKED_STOP_MS - 1)).toBe(false)
  expect(isDueForStop(b!, 1000 + PARKED_STOP_MS)).toBe(true)
  expect(isDueForStop(c!, 1_000_000_000)).toBe(false)
  // Woken again, its tasks are its own until its next end.
  expect(ownerResumed(list, 'w').some(x => isDueForStop(x, 1_000_000_000))).toBe(false)
})

test("the main conversation's tasks are never stopped on their own, nor one whose stop failed", () => {
  expect(isDueForStop(shell('m', { ownerDoneAt: 0 }), 1_000_000_000)).toBe(false)
  const failed = markStopFailed([shell('a', { agentId: 'w', ownerDoneAt: 0 })], 'a', 5)
  expect(failed[0]!.stopFailedAt).toBe(5)
  expect(isDueForStop(failed[0]!, 1_000_000_000)).toBe(false)
})

test('a TaskStop error for a task already over is told from one that failed', () => {
  expect(isGone('No task found with ID: b1')).toBe(true)
  expect(isGone('Task b1 is not running (status: completed)')).toBe(true)
  expect(isGone('Permission denied')).toBe(false)
})

test('a shell the engine backgrounded at its timeout started that long before its call was answered', () => {
  expect(taskOfCall('Bash', { command: 'npm test' }, { backgroundTaskId: 'b1', timedOutAfterMs: 120_000 }, 'agent-1', 200_000)?.startedAt).toBe(80_000)
})
