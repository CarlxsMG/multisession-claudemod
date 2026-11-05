import { expect, test } from 'claude-code/testing'

import { quiet } from '../../src/engine'
import type { Engine } from '../../src/engine'

// Only the debug log of an engine is what `quiet` touches.
function logging() {
  const logs: { text: string; to: unknown }[] = []
  const $ = { ui: { log: (text: string, o?: { to?: unknown }) => void logs.push({ text, to: o?.to }) } }
  return { $: $ as unknown as Engine, logs }
}

test('quiet gives the value of work that succeeds and logs nothing', async () => {
  const { $, logs } = logging()
  expect(await quiet($, Promise.resolve(3), 'sync')).toBe(3)
  expect(logs).toEqual([])
})

test('quiet gives undefined for work that fails and logs the failure to debug', async () => {
  const { $, logs } = logging()
  expect(await quiet($, Promise.reject(new Error('gone')), 'sync')).toBeUndefined()
  expect(await quiet($, Promise.reject('plain'), 'relay')).toBeUndefined()
  expect(logs).toEqual([
    { text: 'crew: sync: gone', to: 'debug' },
    { text: 'crew: relay: plain', to: 'debug' },
  ])
})
