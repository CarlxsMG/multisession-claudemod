import { expect } from 'claude-code/testing'

import type { Look, Member } from '../../types'
import { DEFAULT_LOOK } from '../../src/figure/look'
import { given, headsUp, heldFor, started } from '../../src/prompts/results'
import { bubbleRows } from '../../src/ui/transcript/bubble'
import type { Seg } from '../../src/ui/transcript/bubble'
import { resultFoots } from '../../src/ui/transcript/foots'
import { test } from '../support/crew'

const lines = (rows: readonly (readonly Seg[])[]) => rows.map(row => row.map(x => x.text).join(''))
const names: Seg[] = [{ text: 'Nova' }, { text: ' → ', dim: true }, { text: 'Pip' }]
const TASK = 'Run the tests and fix what fails, then report.'
const l: Look = DEFAULT_LOOK
const pip: Member = { id: 'agent-1', name: 'Pip', address: 'pip' }
const bolt: Member = { id: 'agent-2', name: 'Bolt', address: 'bolt' }
const foots = (tool: string, output: unknown, members: Member[] = [pip, bolt]) =>
  resultFoots(tool, output, pip, members, l)?.map(f => f.map(x => x.text).join(''))

test('a bubble holds who to whom and its title on top, the text inside, and its foot below', () => {
  expect(lines(bubbleRows(names, 'Arreglar tests', TASK, 2, 40, 'c', [[{ text: 'nuevo' }]]).rows)).toEqual([
    '╭─ Nova → Pip · Arreglar tests ─────╮',
    '│ Run the tests and fix what fails, │',
    '│ then report.                      │',
    '╰─ nuevo ───────────────────────────╯',
  ])
})

test("a title gives way to the names, and a foot too long is cut beside the bubble's ▴", () => {
  expect(lines(bubbleRows(names, 'a title too long to fit beside the names', 'ok', 4, 24, 'c').rows)).toEqual([
    '╭─ Nova → Pip · a ti… ─╮',
    '│ ok                   │',
    '╰──────────────────────╯',
  ])
  const long = [[{ text: 'a very long foot that cannot fit at all here' }]]
  expect(lines(bubbleRows(names, '', 'line one\nline two', Infinity, 40, 'c', long, 'less').rows)).toEqual([
    '╭─ Nova → Pip ─────────────────────────╮',
    '│ line one                             │',
    '│ line two                             │',
    '╰─ a very long foot that cannot fi… ─▴─╯',
  ])
})

test('a cut bubble ends its text in the "…" that opens it', () => {
  const cut = bubbleRows(names, 'Arreglar tests', TASK, 1, 30, 'c', [], 'more')
  expect(cut.isCut).toBe(true)
  expect(lines(cut.rows)).toEqual(['╭─ Nova → Pip · Arreglar t… ─╮', '│ Run the tests and fix wha… │', '╰────────────────────────────╯'])
  expect(cut.rows[1]!.find(x => x.press === true)?.text).toBe('…')
})

test("a crew call's result reads in the foot: delivered, woken, reused, new, held, and who else works there", () => {
  expect(resultFoots('TaskStop', 'stopped', pip, [pip], l)).toEqual([])
  expect(foots('SendMessage', { success: true, message: 'ok' })).toEqual(['entregado'])
  expect(foots('SendMessage', { success: true, resumedAgentId: 'agent-1', message: 'Resuming' })).toEqual(['despierta a Pip', 'despierta'])
  expect(foots('mcp__crew__delegate', [{ type: 'text', text: given(pip, '/w', '') }])).toEqual(['reutilizado · conserva su contexto', 'reutilizado'])
  expect(foots('mcp__crew__delegate', started('Pip', 'pip', 'agent-1', '/w', headsUp(['Bolt'])))).toEqual([
    'nuevo · ! Bolt trabaja aquí',
    'nuevo · ! Bolt trabaja aquí',
    'nuevo · ! 1 más aquí',
    'nuevo',
  ])
  expect(foots('mcp__crew__delegate', given(pip, '/w', headsUp(['Bolt', 'Mika'])))).toEqual([
    'reutilizado · conserva su contexto · ! Bolt y Mika trabajan aquí',
    'reutilizado · ! Bolt y Mika trabajan aquí',
    'reutilizado · ! 2 más aquí',
    'reutilizado',
  ])
  expect(foots('mcp__crew__delegate', heldFor(pip, 'Bolt', 1))).toEqual(['en espera · responde a Bolt', 'en espera'])
})

test('a result the row cannot read keeps the engine\'s own drawing', () => {
  expect(resultFoots('SendMessage', { success: false, message: 'no' }, pip, [pip], l)).toBeUndefined()
  expect(resultFoots('mcp__crew__delegate', 'crew: `task` is required.', pip, [pip], l)).toBeUndefined()
})
