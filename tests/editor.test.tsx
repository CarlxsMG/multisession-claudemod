import { expect } from 'claude-code/testing'
import { PANE, engine, test } from './support/crew'

test('the editor shows one group at a time and the figure follows each press', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'edit' })
    expect(await ui.find({ key: 'vibe-cheerful' })).toBeDefined()
    expect(await ui.find({ key: 'look-phrase' })).toBeUndefined()
    expect(await ui.find({ key: 'look-voice' })).toBeUndefined()
    await ui.press({ key: 'tab-face' })
    expect(await ui.find({ key: 'next-eyes' })).toBeDefined()
    expect(await ui.find({ key: 'next-hair' })).toBeUndefined()

    await ui.press({ key: 'tab-hair' })
    expect(await ui.find({ key: 'next-eyes' })).toBeUndefined()
    const before = await ui.find({ type: 'Raster', key: 'preview' })
    await ui.press({ key: 'next-hair' })
    expect(await ui.find({ type: 'Text', text: /^Tuft\s*$/ })).toBeDefined()
    if (surface === 'terminal') {
      const after = await ui.find({ type: 'Raster', key: 'preview' })
      expect(after?.props.cells).not.toEqual(before?.props.cells)
    }
    await ui.press({ key: 'hairColor-3' })
    expect(await ui.find({ type: 'Text', text: /^Ginger$/ })).toBeDefined()

    await ui.press({ key: 'tab-persona' })
    await ui.press({ key: 'vibe-pirate' })
    expect(await ui.find({ type: 'Text', text: /^Nova · Pirate · customize$/ })).toBeDefined()
    await ui.press({ key: 'next-nameColor' })
    expect((await ui.find({ type: 'Text', text: /^Nova · Pirate · customize$/ }))?.props.color).toBe('#4fc3f7')
    await ui.press({ key: 'tab-share' })
    expect(await ui.find({ key: 'look-copy' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /CREW1\./ })).toBeUndefined()

    await ui.press({ key: 'look-done' })
    expect((await ui.find({ type: 'Text', text: /^Nova · Pirate · Opus 5\.5$/ }))?.props.color).toBe('#4fc3f7')
    await ui.press({ key: 'edit' })
    await ui.press({ key: 'look-random' })
    await ui.press({ key: 'look-reset' })
    await ui.press({ key: 'look-done' })
    expect(await ui.find({ key: 'edit' })).toBeDefined()
    await ui.press({ key: 'edit' })
    await ui.press({ key: 'tab-persona' })
    await ui.press({ key: 'look-done' })
    await ui.unmount()
  }
})
