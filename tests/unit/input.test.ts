import { expect, test } from 'claude-code/testing'

import { DEFAULT_LOOK } from '../../src/figure/look'
import { VIBES, vibeOf } from '../../src/persona/vibes'
import { fieldOf, rawStringArg, stringArg } from '../../src/util/input'

test("a tool's input is read field by field, whatever the model sent", () => {
  const input = { task: '  Fix it  ', worker: ' pip ', step: 2, fresh: 'yes' }
  expect(stringArg(input, 'task')).toBe('Fix it')
  expect(stringArg(input, 'step')).toBe('')
  expect(stringArg(input, 'missing')).toBe('')
  expect(rawStringArg(input, 'worker')).toBe(' pip ')
  expect(rawStringArg(input, 'step')).toBeUndefined()
  expect(fieldOf(input, 'fresh')).toBe('yes')
})

test('a look whose personality is unknown takes the cheerful one', () => {
  expect(vibeOf({ ...DEFAULT_LOOK, vibe: 'nope' }).prompt).toBe(VIBES.cheerful!.prompt)
  expect(vibeOf({ ...DEFAULT_LOOK, vibe: 'pirate' }).prompt).toBe(VIBES.pirate!.prompt)
})
