import { expect } from 'claude-code/testing'

import { describe } from '../../src/progress/phase'
import { ago } from '../../src/util/time'
import { cut, firstText, flat, headLines, oneLine, textOf, unwrapPasted, wrapText } from '../../src/util/text'
import { test } from '../support/crew'

test('one line flattens the whitespace and cuts with an ellipsis', () => {
  expect(oneLine('  a\n b  ', 10)).toBe('a b')
  expect(oneLine('abcdefghij', 5)).toBe('abcd…')
  expect(oneLine('abcde', 5)).toBe('abcde')
  expect(cut('abc', 0)).toBe('')
  expect(flat(' a \t b ')).toBe('a b')
})

test('wrapping keeps to the width and marks the last line kept when text was left out', () => {
  expect(wrapText('the quick brown fox jumps', 10, 3)).toEqual(['the quick', 'brown fox', 'jumps'])
  expect(wrapText('the quick brown fox jumps', 10, 2)).toEqual(['the quick', 'brown fox…'])
  expect(wrapText('abcdefghijkl', 5, 5)).toEqual(['abcde', 'fghij', 'kl'])
  expect(wrapText('', 10, 2)).toEqual([''])
})

test("a text's head keeps its own line breaks, drops blank lines and marks what it leaves out", () => {
  expect(headLines('one\n\ntwo  three\nfour', 20, 2)).toEqual(['one', 'two three…'])
  expect(headLines('a b', 20, Infinity)).toEqual(['a b'])
})

test("a tool's stored result gives its text, from blocks, a message or a string", () => {
  expect(textOf([{ type: 'text', text: 'a' }, { text: 'b' }])).toBe('a\nb')
  expect(textOf({ message: 'm' })).toBe('m')
  expect(textOf(42)).toBe('')
  expect(firstText(undefined, '  ', 'x', 'y')).toBe('x')
  expect(firstText()).toBe('')
})

test('a pasted text loses the tags the desktop app wraps it in and is marked as pasted', () => {
  expect(unwrapPasted('see <pasted_content id="1">code</pasted_content> now')).toBe('see  [pegado] code  now')
})

test('a call is named by its tool and what it acts on, a path by its file name', () => {
  expect(describe({ tool: 'Read', file_path: '/work/api/src/index.ts' })).toBe('Read index.ts')
  expect(describe({ tool: 'Bash', command: 'npm   test\n --watch' })).toBe('Bash npm test --watch')
  expect(describe({ tool: 'mcp__github__create_issue', description: 'Bug' })).toBe('create_issue Bug')
  expect(describe({ tool: 'mcp__crew__delegate', task: 'Fix it' })).toBe('delegate')
  expect(describe({ tool: 'TodoWrite' })).toBe('TodoWrite')
})

test('an age reads "ahora" under ten seconds, then in seconds, minutes and hours', () => {
  expect(ago(10_000, 5_000)).toBe('ahora')
  expect(ago(30_000, 0)).toBe('30s')
  expect(ago(70_000, 0)).toBe('1m')
  expect(ago(7_200_000, 0)).toBe('2h')
})
