import { expect, test } from 'claude-code/testing'

import { fitModel, modelAlias, modelLabel } from '../../src/model-label'

test("a model's id reads as people say it, behind a cloud's prefix or after its version too", () => {
  expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelLabel('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
  expect(modelLabel('claude-3-opus-20240229')).toBe('Opus 3')
  expect(modelLabel('us.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('Sonnet 4.5')
  expect(modelLabel('claude-opus-4-1@20250805')).toBe('Opus 4.1')
  expect(modelLabel('claude-opus-5-5[1m]')).toBe('Opus 5.5')
  expect(modelLabel('claude-haiku-4-5-latest')).toBe('Haiku 4.5')
})

test('an id that does not read as a model is shown as it is', () => {
  expect(modelLabel('gpt-4o')).toBe('gpt-4o')
  expect(modelLabel('  claude-weird-model-x ')).toBe('claude-weird-model-x')
})

test("the model gives way on the top line: cut short, then left out", () => {
  expect(fitModel('Opus 5.5', 10)).toBe('Opus 5.5')
  expect(fitModel('Opus 5.5', 6)).toBe('Opus…')
  expect(fitModel('Sonnet 4.5', 6)).toBe('Sonne…')
  expect(fitModel('Opus 5.5', 4)).toBe('')
})

test("a model's id goes to the Agent tool as its family's alias, and one that names none as nothing", () => {
  expect(modelAlias('claude-opus-5-5')).toBe('opus')
  expect(modelAlias('claude-opus-5-5[1m]')).toBe('opus')
  expect(modelAlias('us.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('sonnet')
  expect(modelAlias('claude-3-5-haiku-20241022')).toBe('haiku')
  expect(modelAlias('claude-fable-1')).toBe('fable')
  expect(modelAlias('sonnet')).toBe('sonnet')
  expect(modelAlias('gpt-4o')).toBeUndefined()
  expect(modelAlias('')).toBeUndefined()
})
