import { expect } from 'claude-code/testing'
import type { On, UiCopyResult } from 'claude-code'
import { DEFAULT_LOOK } from '../src/figure/look'
import { lookCode, parseLookCode } from '../src/figure/share-code'
import type { Look } from '../types'
import { PANE, SURFACES, engine, test } from './support/crew'

const TERMINAL = { cwd: '/work/main', surface: 'terminal', isInteractive: true } as const

// Differs from the default in all that the editor's heading and bubble show.
const LUNA: Look = { ...DEFAULT_LOOK, name: 'Luna', nameColor: 2, phrase: 'Arr!', vibe: 'pirate', hair: 'fringe' }
const LUNA_GREEN = '#81c784'

// An engine holding `look`, that answers a copy as `copy` says and keeps what
// it was given to copy and the toasts it showed.
function watched(on: On, look: Look = DEFAULT_LOOK, copy: UiCopyResult = { isCopied: true }) {
  const copies: { text: string; surface: string | undefined }[] = []
  const toasts: string[] = []
  engine(on, { stored: { look } })
  on('ui.copy', (_, e) => {
    copies.push({ text: e.text, surface: e.surface })
    return { value: copy }
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

test('a copy the surface did not take shows the code itself, to copy by hand', async ($, on) => {
  const { toasts } = watched(on, LUNA, { isCopied: false, reason: 'no-clipboard' })
  await $.session.start(TERMINAL)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  await ui.press({ key: 'tab-share' })
  await ui.press({ key: 'look-copy' })
  expect(toasts).toEqual([lookCode(LUNA)])
  await ui.unmount()
})

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

test('a bad code says so, and the look stays as it was', async ($, on) => {
  const { copies, toasts } = watched(on, LUNA)
  await $.session.start(TERMINAL)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  await ui.press({ key: 'tab-share' })
  const before = await ui.find({ type: 'Raster', key: 'preview' })

  // Not a code, and one cut short on the way here.
  for (const text of ['no code here', lookCode(DEFAULT_LOOK).slice(0, 40)]) await ui.input({ key: 'look-import', text })
  expect(toasts).toEqual(['That code is not valid', 'That code is not valid'])
  expect(await heading(ui)).toEqual(['Luna · Pirate · customize', LUNA_GREEN])
  // A change would have the figure cheer.
  expect((await ui.find({ type: 'Raster', key: 'preview' }))?.props.cells).toEqual(before?.props.cells)
  expect(await lookNow(ui, copies)).toEqual(LUNA)
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
