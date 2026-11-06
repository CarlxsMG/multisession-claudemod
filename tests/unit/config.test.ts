import { expect } from 'claude-code/testing'

import { DEFAULT_TYPE, MAIN_ADDRESS, PLUGIN } from '../../src/config'
import { engine, test } from '../support/crew'

// A test cannot read the manifest, but the engine names a plugin's own calls
// after it. The atoms spell the name out for the validator, so what they write
// under is held to it here too: the crew's sends and rows go unrecognized, and
// its state moves away from what users have stored, when one drifts apart.
test('PLUGIN is the name in .claude-plugin/plugin.json, and the one the atoms write under', async ($, on) => {
  const names = new Set<string | undefined>()
  on('state.set', (_, e, next) => {
    names.add(next.origin.plugin)
    names.add(e.plugin)
    return next(e)
  })
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  expect([...names]).toEqual([PLUGIN])
})

// Each of these names is the engine's or a frozen one, and no other code in
// src would notice it changed.
test('the plugin, the main address and the default agent type keep their names', () => {
  expect(PLUGIN).toBe('crew')
  expect(MAIN_ADDRESS).toBe('main')
  expect(DEFAULT_TYPE).toBe('general-purpose')
})
