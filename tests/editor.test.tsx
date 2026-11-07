import { expect } from 'claude-code/testing'
import type { On, UiCopyResult } from 'claude-code'
import { DEFAULT_LOOK } from '../src/figure/look'
import { lookCode, parseLookCode } from '../src/figure/share-code'
import type { Look } from '../types'
import { PANE, SURFACES, crewCommand, engine, test } from './support/crew'

const TERMINAL = { cwd: '/work/main', surface: 'terminal', isInteractive: true } as const

// Differs from the default in all that the editor's heading and bubble show.
const LUNA: Look = { ...DEFAULT_LOOK, name: 'Luna', nameColor: 2, phrase: 'Arr!', vibe: 'pirate', hair: 'fringe' }
const LUNA_GREEN = '#81c784'

// A copy that fails and one another plugin denies, which read the same to the person.
const NOT_COPIED = [
  ['the surface did not take', { isCopied: false, reason: 'no-clipboard' }],
  ['another plugin denied', { deny: 'not on this machine' }],
] as const

// An engine holding `look`, that answers a copy as `copy` says and keeps what
// it was given to copy and the toasts it showed.
function watched(on: On, look: Look = DEFAULT_LOOK, copy: UiCopyResult | { deny: string } = { isCopied: true }) {
  const copies: { text: string; surface: string | undefined }[] = []
  const toasts: string[] = []
  engine(on, { stored: { look } })
  on('ui.copy', (_, e) => {
    copies.push({ text: e.text, surface: e.surface })
    return 'deny' in copy ? copy : { value: copy }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { copies, toasts }
}

// What the editor's heading says, and in what color.
const heading = async (ui: { find: (q: { type: string; text: RegExp }) => Promise<{ text: string; props: Record<string, unknown> } | undefined> }) => {
  const line = await ui.find({ type: 'Text', text: / · customize$/ })
  return [line?.text, line?.props.color]
}

// The look as it stands, whole: a test's `$` has no store to read it from, so
// it is read from the code the Share tab copies.
const lookNow = async (ui: { press: (target: { key: string }) => Promise<unknown> }, copies: { text: string }[]) => {
  await ui.press({ key: 'tab-share' })
  await ui.press({ key: 'look-copy' })
  return parseLookCode(copies[copies.length - 1]!.text)
}

test('Random gives the figure new parts and keeps who the orchestrator is', async ($, on) => {
  const { copies } = watched(on, LUNA)
  await $.session.start(TERMINAL)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  await ui.press({ key: 'look-random' })
  expect(await heading(ui)).toEqual(['Luna · Pirate · customize', LUNA_GREEN])
  expect(await ui.find({ type: 'Text', text: /^Arr!$/ })).toBeDefined()
  const after = await lookNow(ui, copies)
  expect(after).toMatchObject({ name: 'Luna', nameColor: 2, phrase: 'Arr!', vibe: 'pirate' })
  expect(after).not.toEqual(LUNA)
  await ui.unmount()
})

test('Copy code hands the surface pressed the code of the look as it stands, and says whose it is', async ($, on) => {
  const { copies, toasts } = watched(on, LUNA)
  await $.session.start(TERMINAL)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'edit' })
    await ui.press({ key: 'tab-share' })
    await ui.press({ key: 'look-copy' })
    await ui.press({ key: 'look-done' })
    await ui.unmount()
  }
  expect(copies).toEqual(SURFACES.map(surface => ({ text: lookCode(LUNA), surface })))
  expect(toasts).toEqual(SURFACES.map(() => "Luna's code copied"))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  await ui.press({ key: 'tab-persona' })
  await ui.press({ key: 'vibe-zen' })
  expect(await lookNow(ui, copies)).toEqual({ ...LUNA, vibe: 'zen' })
  await ui.unmount()
})

for (const [how, copy] of NOT_COPIED) {
  test(`a copy ${how} says so in a few words and points to /crew code`, async ($, on) => {
    const { toasts } = watched(on, LUNA, copy)
    await $.session.start(TERMINAL)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'edit' })
    await ui.press({ key: 'tab-share' })
    await ui.press({ key: 'look-copy' })
    expect(toasts).toEqual(['Code not copied: /crew code shows it'])
    await ui.unmount()
  })

  test(`/crew code answers with the code when ${how} its copy, and does not call it copied`, async ($, on) => {
    watched(on, LUNA, copy)
    await $.session.start(TERMINAL)
    expect((await crewCommand($, 'code')).text).toBe(`Luna's code:\n${lookCode(LUNA)}`)
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a good code pasted in the Share tab applies its look, whole, and the tab stays (${surface})`, async ($, on) => {
    const { copies, toasts } = watched(on)
    await $.session.start(TERMINAL)
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'edit' })
    await ui.press({ key: 'tab-share' })
    expect((await ui.find({ key: 'look-import' }))?.props.placeholder).toBe('paste a CREW1.… code')
    expect(await heading(ui)).toEqual(['Nova · Cheerful · customize', 'claude'])

    await ui.input({ key: 'look-import', text: lookCode(LUNA) })
    expect(await heading(ui)).toEqual(['Luna · Pirate · customize', LUNA_GREEN])
    expect(await ui.find({ type: 'Text', text: /^Arr!$/ })).toBeDefined()
    expect(await ui.find({ key: 'look-copy' })).toBeDefined()
    expect(toasts).toEqual([])
    expect(await lookNow(ui, copies)).toEqual(LUNA)

    await ui.press({ key: 'look-done' })
    expect(await ui.find({ type: 'Text', text: /^Luna · Pirate · Opus 5\.5$/ })).toBeDefined()
    await ui.unmount()
  })
}

test('/crew import turns down a code with no look in it, and the look stays as it was', async ($, on) => {
  watched(on, LUNA)
  await $.session.start(TERMINAL)
  expect((await crewCommand($, 'import CREW1.bnVsbA')).text).toBe('That code is not valid (it starts with CREW1.).')
  expect(parseLookCode((await crewCommand($, 'code')).text ?? '')).toEqual(LUNA)
})

test('a bad code says so, and the look stays as it was', async ($, on) => {
  const { copies, toasts } = watched(on, LUNA)
  await $.session.start(TERMINAL)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  await ui.press({ key: 'tab-share' })
  const before = await ui.find({ type: 'Raster', key: 'preview' })

  // Not a code, one cut short on the way here, and one that holds no look.
  const bad = ['no code here', lookCode(DEFAULT_LOOK).slice(0, 40), 'CREW1.bnVsbA']
  for (const text of bad) await ui.input({ key: 'look-import', text })
  expect(toasts).toEqual(bad.map(() => 'That code is not valid'))
  expect(await heading(ui)).toEqual(['Luna · Pirate · customize', LUNA_GREEN])
  // A change would have the figure cheer.
  expect((await ui.find({ type: 'Raster', key: 'preview' }))?.props.cells).toEqual(before?.props.cells)
  expect(await lookNow(ui, copies)).toEqual(LUNA)
  await ui.unmount()
})

test('the preview cheers for a press that changes the look, and for no other', async ($, on) => {
  engine(on, { stored: { look: LUNA } })
  await $.session.start(TERMINAL)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  const preview = async () => (await ui.find({ type: 'Raster', key: 'preview' }))?.props.cells
  const still = await preview()

  // The personality it has already.
  await ui.press({ key: 'vibe-pirate' })
  await ui.redraw()
  expect(await preview()).toEqual(still)

  // Another one leaves the figure's parts as they are: only the cheer moves it.
  await ui.press({ key: 'vibe-zen' })
  expect(await preview()).not.toEqual(still)
  await ui.unmount()
})

test('a look a command changes has the preview cheer too', async ($, on) => {
  engine(on, { stored: { look: LUNA } })
  await $.session.start(TERMINAL)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  const still = (await ui.find({ type: 'Raster', key: 'preview' }))?.props.cells
  await ui.press({ key: 'look-done' })

  await crewCommand($, `import ${lookCode({ ...LUNA, vibe: 'zen' })}`)
  await ui.press({ key: 'edit' })
  expect((await ui.find({ type: 'Raster', key: 'preview' }))?.props.cells).not.toEqual(still)
  await ui.unmount()
})

test('the persona tab marks the personality chosen and samples two of its lines, naming a worker', async ($, on) => {
  engine(on)
  await $.session.start(TERMINAL)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  const vibes = [
    ['cheerful', 'Cheerful', '“Pip, you’re up!” · “Done!”'],
    ['zen', 'Zen', '“Flow, Pip.” · “All in its place.”'],
    ['pirate', 'Pirate', '“Pip, board her!” · “Loot secured!”'],
    ['boss', 'Boss', '“Assigned to Pip.” · “Completed.”'],
    ['geek', 'Geek', '“fork() → Pip” · “exit 0”'],
    ['granny', 'Granny', '“Pip, dear, help me out.” · “That came out lovely!”'],
  ] as const
  for (const [id, label, sample] of vibes) {
    await ui.press({ key: `vibe-${id}` })
    expect((await heading(ui))[0]).toBe(`Nova · ${label} · customize`)
    // One row whatever the pane's width: the sample is cut, not wrapped.
    expect((await ui.find({ type: 'Text', text: sample }))?.props.wrap).toBe('truncate-end')
    const buttons = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('vibe-'))
    expect(buttons.map(b => b.props.label)).toEqual(vibes.map(([, name]) => name))
    expect(buttons.filter(b => b.props.variant === 'primary').map(b => b.key)).toEqual([`vibe-${id}`])
  }
  await ui.unmount()
})

test('the persona tab renames the orchestrator and steps its name color round the palette', async ($, on) => {
  engine(on)
  await $.session.start(TERMINAL)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  expect((await ui.find({ key: 'look-name' }))?.props.placeholder).toBe('Nova')
  await ui.input({ key: 'look-name', text: 'Luna' })
  expect(await heading(ui)).toEqual(['Luna · Cheerful · customize', 'claude'])
  expect((await ui.find({ key: 'look-name' }))?.props.placeholder).toBe('Luna')

  const swatch = async () => (await ui.find({ type: 'Text', text: /^ {2}$/ }))?.props.backgroundColor
  // Back from the first color is the last, and on from the last the first.
  await ui.press({ key: 'prev-nameColor' })
  expect(await heading(ui)).toEqual(['Luna · Cheerful · customize', '#64b5f6'])
  expect(await swatch()).toBe('#64b5f6')
  await ui.press({ key: 'next-nameColor' })
  expect(await heading(ui)).toEqual(['Luna · Cheerful · customize', 'claude'])
  expect(await swatch()).toBe('claude')
  await ui.unmount()
})

test('a blank name keeps the name, as the placeholder says it holds', async ($, on) => {
  const { copies } = watched(on, LUNA)
  await $.session.start(TERMINAL)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  const before = await ui.find({ type: 'Raster', key: 'preview' })

  for (const text of ['', '   ']) await ui.input({ key: 'look-name', text })
  expect(await heading(ui)).toEqual(['Luna · Pirate · customize', LUNA_GREEN])
  // A change would have the figure cheer.
  expect((await ui.find({ type: 'Raster', key: 'preview' }))?.props.cells).toEqual(before?.props.cells)
  expect(await lookNow(ui, copies)).toEqual(LUNA)
  await ui.unmount()
})

test('r and d answer on every tab, c only on Share, and d goes back to the main view', async ($, on) => {
  engine(on)
  await $.session.start(TERMINAL)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  // The kit presses a Button by its key, as its hotkey does, and cannot type a
  // letter: what each letter presses is read off the drawing.
  const letters = async () =>
    Object.fromEntries((await ui.findAll({ type: 'Button' })).flatMap(b => (b.props.hotkey === undefined ? [] : [[b.props.hotkey, b.key]])))
  for (const tab of ['persona', 'face', 'hair', 'clothes', 'extras']) {
    await ui.press({ key: `tab-${tab}` })
    expect(await letters()).toEqual({ r: 'look-random', d: 'look-done' })
  }
  await ui.press({ key: 'tab-share' })
  expect(await letters()).toEqual({ c: 'look-copy', r: 'look-random', d: 'look-done' })

  await ui.press({ key: 'look-done' })
  expect(await ui.find({ key: 'look-done' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Nova · Cheerful · Opus 5\.5$/ })).toBeDefined()
  await ui.unmount()
})

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

test("on the desktop the editor's padded tabs, part names and values are monospaced, so they line up", async ($, on) => {
  watched(on)
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'edit' })
  await ui.press({ key: 'tab-face' })
  expect((await ui.find({ type: 'Text', text: /^▸ Face$/ }))?.props.mono).toBe(true)
  expect((await ui.find({ type: 'Text', text: /^ {2}Character$/ }))?.props.mono).toBe(true)
  const padded = await ui.findAll({ type: 'Text', text: /^\S.*\S {2,}$|^\S+ {2,}$/ })
  const names = padded.map(x => x.text.trim())
  for (const name of ['Eyes', 'Mouth', 'Details']) expect(names).toContain(name)
  for (const text of padded) expect(text.props.mono).toBe(true)
  await ui.unmount()
})

// The desktop app draws a Button's label in place of its children, so a
// Button whose children are the picture has its label on the terminal alone.
test('on the desktop the swatches, arrows, tabs and the Delegate switch draw their children, not a label', async ($, on) => {
  watched(on)
  await $.session.start({ cwd: '/work/main', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const drawn = async (key: string) => {
    const button = await ui.find({ key })
    expect(button?.props.label).toBe(button?.text)
    return button
  }
  expect((await drawn('mode'))?.text).toBe(' Delegate ON  ')
  expect((await drawn('edit'))?.text).toBe(' Edit ')

  await ui.press({ key: 'edit' })
  await ui.press({ key: 'tab-hair' })
  expect((await drawn('tab-hair'))?.text).toBe('▸ Head')
  expect((await drawn('next-hair'))?.text).toBe('▶')
  expect((await drawn('prev-hair'))?.text).toBe('◀')
  const swatch = await drawn('hairColor-3')
  expect(swatch?.children).toContainEqual(expect.objectContaining({ type: 'Text', props: expect.objectContaining({ backgroundColor: '#d35400' }) }))

  await ui.press({ key: 'tab-persona' })
  expect((await drawn('next-nameColor'))?.text).toBe(' ▶ ')
  await ui.unmount()
})
