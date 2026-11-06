// A worker's todo list, which is its plan when it declared none with the
// progress tool.
import type { TaskList } from '../../types'
import type { Engine } from '../engine'
import { updateTaskLists } from '../state/atoms'
import { appendKept } from '../util/bounded'
import { firstText } from '../util/text'
import { todoPlan } from './plan'
import type { Todo } from './plan'
import { RUNS_KEEP, setPlan } from './run-store'

/**
 * The todo tools a worker may use of its own accord: their list is its plan
 * when it declared none. TaskCreate and TaskUpdate change one item at a time,
 * so each worker's items are kept in the state, by the id the engine gave,
 * through a reload: the next call names only the item it changes.
 */
export const TODO_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate'])
const TASK_LISTS_KEEP = RUNS_KEEP
const TASK_ITEMS_KEEP = 100

type TaskItem = TaskList['items'][number]

// `item` in place of the one with its key, else after the rest.
const withItem = (items: readonly TaskItem[], item: TaskItem): TaskItem[] =>
  items.some(x => x.key === item.key) ? items.map(x => (x.key === item.key ? item : x)) : [...items, item].slice(-TASK_ITEMS_KEEP)

// A worker's TaskCreate items after a TaskCreate or TaskUpdate call, or
// undefined for a TaskCreate the engine gave no id.
function changedItems(items: readonly TaskItem[], call: Record<string, unknown>, result: unknown): TaskItem[] | undefined {
  if (call.tool === 'TaskCreate') {
    const task = (result as { task?: { id?: unknown } } | undefined)?.task
    if (task?.id === undefined) return undefined
    return withItem(items, { key: String(task.id), status: 'pending', text: firstText(call.activeForm, call.subject) })
  }
  const key = String(call.taskId)
  if (call.status === 'deleted') return items.filter(x => x.key !== key)
  const was = items.find(x => x.key === key)
  return withItem(items, {
    key,
    status: typeof call.status === 'string' ? call.status : (was?.status ?? 'pending'),
    text: firstText(call.activeForm, call.subject, was?.text),
  })
}

/** Reads a worker's plan off its todo list, when it declared none with the progress tool. */
export async function noteTodos($: Engine, id: string, call: Record<string, unknown>, result: unknown) {
  let todos: Todo[]
  if (call.tool === 'TodoWrite') {
    if (!Array.isArray(call.todos)) return
    todos = (call.todos as Record<string, unknown>[]).map(todo => ({ status: String(todo.status), text: firstText(todo.activeForm, todo.content) }))
  } else {
    // Worked out inside the write: two calls of one response may run at once.
    let items: TaskItem[] | undefined
    await updateTaskLists($, lists => {
      items = changedItems(lists.find(l => l.id === id)?.items ?? [], call, result)
      return items === undefined ? lists : appendKept(lists, [{ id, items }], TASK_LISTS_KEEP, l => l.id)
    })
    if (items === undefined) return
    todos = items.map(({ status, text }) => ({ status, text }))
  }
  await setPlan($, id, prev => todoPlan(prev, todos))
}
