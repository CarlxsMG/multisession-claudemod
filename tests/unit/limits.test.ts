import { expect, test } from 'claude-code/testing'

import { limitLabel, parseModelLimits, toLimits } from '../../src/usage/limits'

const reply = (rateLimits: unknown) =>
  [
    JSON.stringify({ type: 'system', subtype: 'init' }),
    JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 'crew-usage', response: { rate_limits: rateLimits } } }),
  ].join('\n')

test("the engine's windows come rounded, the session's and the week's first, three at most", () => {
  expect(
    toLimits([
      { kind: 'seven_day', percentUsed: 41.4 },
      { kind: 'other', percentUsed: 1 },
      { kind: 'five_hour', percentUsed: 12.5 },
      { kind: 'spend_limit', percentUsed: 3 },
    ]),
  ).toEqual([
    { kind: 'five_hour', percent: 13 },
    { kind: 'seven_day', percent: 41 },
    { kind: 'spend_limit', percent: 3 },
  ])
})

test("a get_usage reply gives each model's own window, rounded, and none when it has none", () => {
  expect(parseModelLimits(reply({ model_scoped: [{ display_name: 'Fable', utilization: 29.6 }, { display_name: 7 }] }))).toEqual([
    { kind: 'Fable', percent: 30 },
  ])
  expect(parseModelLimits(reply({ five_hour: { utilization: 12 } }))).toEqual([])
  expect(parseModelLimits(reply(null))).toEqual([])
})

test("a reply that is not the crew's, or not JSON, gives nothing to show", () => {
  expect(parseModelLimits('')).toBeUndefined()
  expect(parseModelLimits(JSON.stringify({ type: 'control_response', response: { request_id: 'other' } }))).toBeUndefined()
  expect(parseModelLimits('{"crew-usage" broken')).toBeUndefined()
  expect(parseModelLimits(JSON.stringify({ request_id: 'crew-usage', response: {} }))).toBeUndefined()
})

test("a window's label is the catalog's, and a kind the catalog does not name has none", () => {
  expect(limitLabel('five_hour')).toBe('5h')
  for (const kind of ['other', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(limitLabel(kind)).toBeUndefined()
})

test('a get_usage reply in a shape the crew does not read says what is odd in it, and the shapes it reads say nothing', () => {
  const odd = (stdout: string) => {
    const heard: string[] = []
    parseModelLimits(stdout, what => heard.push(what))
    return heard
  }
  // As a subscription's account answers: every window named, the ones it lacks null.
  expect(odd(reply({ five_hour: null, seven_day: { utilization: 94 }, model_scoped: [{ display_name: 'Fable', utilization: 0, resets_at: null }] }))).toEqual(
    [],
  )
  expect(odd(reply({ five_hour: null, model_scoped: [] }))).toEqual([])
  expect(odd(reply({ five_hour: null, model_scoped: null }))).toEqual([])
  expect(odd(reply(null))).toEqual([])
  expect(odd(reply({ five_hour: { utilization: 12 } }))).toEqual(['get_usage answered rate_limits without model_scoped'])
  expect(odd(reply({ model_scoped: [{ name: 'Fable', percent: 30 }] }))).toEqual(['get_usage answered a model window without display_name or utilization'])
  expect(odd('')).toEqual(['no answer to get_usage'])
  expect(odd('{"crew-usage" broken')).toEqual(['get_usage answered a line that is not JSON'])
  const refused = {
    type: 'control_response',
    response: { subtype: 'error', request_id: 'crew-usage', error: 'Unsupported control request subtype: get_usage' },
  }
  expect(odd(JSON.stringify(refused))).toEqual(['get_usage answered no rate_limits: Unsupported control request subtype: get_usage'])
})
