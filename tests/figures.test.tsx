import { expect } from 'claude-code/testing'
import type { Anim } from '../src/figure/anim'
import { ACCS, HAIRS, NAME_COLORS, SKINS } from '../src/figure/catalog'
import { fit256, paintColor, setPalette256 } from '../src/figure/color256'
import { picture } from '../src/figure/critter'
import { DIAMOND_ROWS, DIAMOND_W, SIGNS, diamond, diamondSvg, signsOf } from '../src/figure/diamond'
import { DEFAULT_LOOK, randomLook } from '../src/figure/look'
import { DEFAULT_COLOR, toCells, toSvg } from '../src/figure/raster'
import type { Picture } from '../src/figure/raster'
import { lookCode, parseLookCode } from '../src/figure/share-code'
import { ANIMS, PALETTE_CASES, PANE, cellText, cellsOf, composeBrief, engine, pixelsOf, test, xtermColor, xtermIndex } from './support/crew'

test('a look survives its share code', async () => {
  const look = randomLook(1234, { ...DEFAULT_LOOK, name: 'Ñoño', nameColor: 7, phrase: '¡Olé!' })
  expect(parseLookCode(`mira: ${lookCode(look)} `)).toEqual(look)
  expect(parseLookCode(lookCode(look))?.nameColor).toBe(7)
  expect(parseLookCode('nada')).toBeUndefined()
})

test('a worker is an outlined diamond in 4 columns by 2 rows, its marks beside it, and keeps mostly still', () => {
  const pink = 0xf06292
  for (const seed of [1, 200, 3000, 40_000, 500_000, 6_000_000]) {
    for (const anim of ANIMS) {
      for (let f = 0; f < 60; f++) {
        const pic = diamond(seed, pink, { anim, frame: f, seed: 3, mail: f % 2 === 0 ? 'in' : 'out' })
        const cells = toCells(pic)
        expect(cells).toMatchObject({ columns: DIAMOND_W, rows: DIAMOND_ROWS })
        // Lines only: no cell paints a background.
        expect(cellsOf(cells.cells).every(([, , bg]) => bg === DEFAULT_COLOR)).toBe(true)
      }
    }
  }
  const text = (anim: Anim, f = 0, seed = 1) => cellText(toCells(diamond(seed, pink, { anim, frame: f, seed: 3, since: 0 })).cells)
  expect(text('working').replace(/[^╱╲]/g, '')).toBe('╱╲╲╱')
  const sleep = Array.from({ length: 300 }, (_, f) => text('sleep', f))
  expect(sleep.filter((x, i) => i > 0 && x !== sleep[i - 1]).length).toBeLessThan(sleep.length / 2)
  expect(new Set(sleep).size).toBeGreaterThan(2)
  // One starting draws itself in a side at a time.
  expect(text('starting', 0).replace(/[^╱╲]/g, '')).toBe('╱')
  expect(text('starting', 3).replace(/[^╱╲]/g, '')).toBe('╱╲╲╱')
})

test('a share code or a stored look naming a key every object inherits gets the default part, and the pane and the brief stay whole', async ($, on) => {
  const hostile = {
    ...DEFAULT_LOOK,
    name: 'Luna',
    vibe: 'constructor',
    hair: 'toString',
    eyes: '__proto__',
    mouth: 'valueOf',
    facial: 'hasOwnProperty',
    shirt: 'constructor',
    acc: 'isPrototypeOf',
  }
  const parts = {
    vibe: DEFAULT_LOOK.vibe,
    hair: DEFAULT_LOOK.hair,
    eyes: DEFAULT_LOOK.eyes,
    mouth: DEFAULT_LOOK.mouth,
    facial: DEFAULT_LOOK.facial,
    shirt: DEFAULT_LOOK.shirt,
    acc: DEFAULT_LOOK.acc,
  }
  expect(parseLookCode(lookCode(hostile))).toEqual({ ...hostile, ...parts })

  engine(on, { stored: { look: hostile } })
  on('prompt.compose', () => ({ sections: [] }))
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  expect((await composeBrief($))?.text).toContain('Persona: Luna is cheerful and encouraging, a warm teammate.')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Luna · Cheerful/ })).toBeDefined()
  await ui.press({ key: 'edit' })
  expect(await ui.find({ type: 'Text', text: /^Luna · Cheerful · customize$/ })).toBeDefined()
  await ui.unmount()
})

test('figures keep still most of the time and do something now and then', () => {
  const frames = (anim: Anim, n: number) => Array.from({ length: n }, (_, f) => picture(DEFAULT_LOOK, { anim, frame: f, seed: 7 }).px.join())
  const moves = (list: string[]) => list.filter((x, i) => i > 0 && x !== list[i - 1]).length

  const idle = frames('idle', 300)
  expect(moves(idle)).toBeLessThan(idle.length / 2)
  expect(new Set(idle).size).toBeGreaterThan(4)

  // Typing comes in bursts, with still beats between them.
  const working = frames('working', 40)
  expect(working.some((x, i) => i > 0 && x === working[i - 1])).toBe(true)

  for (const anim of ANIMS) {
    for (const pic of Array.from({ length: 60 }, (_, f) => picture(DEFAULT_LOOK, { anim, frame: f, seed: 3, podium: true }))) {
      expect(pic.px).toHaveLength(pic.w * pic.h)
    }
  }
})

test('the orchestrator fits in 8 columns by 6 rows, and no frame loses a pixel or hides one under a mark', () => {
  const looks = [DEFAULT_LOOK, ...Object.keys(HAIRS).flatMap(hair => Object.keys(ACCS).map(acc => ({ ...DEFAULT_LOOK, hair, acc })))]
  const bad: string[] = []
  for (const look of looks) {
    for (const anim of ANIMS) {
      // Every frame of every routine, the hops included.
      for (let f = 0; f < 60; f++) {
        const pic = picture(look, { anim, frame: f, seed: 3, since: 0, podium: true, mail: f % 2 === 0 ? 'in' : 'out' })
        const at = `${look.hair}/${look.acc} ${anim} ${f}`
        if (pic.lost !== 0) bad.push(`${at}: ${pic.lost} lost`)
        if (pic.w > 8 || pic.h > 12) bad.push(`${at}: ${pic.w}x${pic.h}`)
        for (const g of pic.glyphs) {
          if (g.col < 0 || g.col + g.ch.length > pic.w || 2 * g.row >= pic.h) bad.push(`${at}: ${g.ch} outside`)
          // A mark's cell shows the mark alone: no pixel of the figure under it.
          for (let k = 0; k < g.ch.length; k++) {
            if (pic.px[2 * g.row * pic.w + g.col + k] !== -1 || pic.px[(2 * g.row + 1) * pic.w + g.col + k] !== -1) bad.push(`${at}: ${g.ch} covers`)
          }
        }
      }
    }
  }
  expect(bad).toEqual([])
  // Twice as big in the editor, and five CSS pixels a pixel where SVG draws.
  expect(toCells(picture(DEFAULT_LOOK, { anim: 'idle', frame: 0, seed: 7, podium: true }), 2)).toMatchObject({ columns: 16, rows: 12 })
  expect(toSvg(picture(DEFAULT_LOOK, { anim: 'idle', frame: 0, seed: 7, podium: true }), 5)).toMatch(/ width="40" height="60" /)
})

test("each worker's diamond has its accent and its signs, and its state in the outline and the mark", () => {
  const pink = 0xf06292
  const outline = (anim: Anim, f = 0, seed = 1) =>
    cellsOf(toCells(diamond(seed, pink, { anim, frame: f, seed: 3, since: 0 })).cells).find(([ch]) => ch === 0x2571)?.[1]
  expect(outline('working')).toBe(pink)
  expect(outline('failed')).toBe(0xef5350)
  // Faded asleep, done or stopped: neither its accent nor the failed red.
  for (const anim of ['sleep', 'done', 'stopped'] as Anim[]) expect([pink, 0xef5350]).not.toContain(outline(anim))
  // A cheer flashes it light with each hop.
  expect(new Set(Array.from({ length: 12 }, (_, f) => outline('happy', f))).size).toBe(2)

  // The signs differ by seed, either side of its bottom half.
  const seen = new Set(Array.from({ length: 4000 }, (_, seed) => signsOf(seed * 131).join('')))
  expect(seen.size).toBe(SIGNS.length)
  const seed = Array.from({ length: 4000 }, (_, k) => k).find(k => signsOf(k)[0] === '○')!
  expect(cellText(toCells(diamond(seed, pink, { anim: 'working', frame: 0, seed: 3, since: 0 })).cells).slice(4)).toBe('○╲╱○')
  expect(cellText(toCells(diamond(seed, pink, { anim: 'failed', frame: 0, seed: 3, since: 0 })).cells)).toMatch(/!/)
  // Stopped takes the mark its end has everywhere, apart from failed's.
  expect(cellText(toCells(diamond(seed, pink, { anim: 'stopped', frame: 0, seed: 3, since: 0 })).cells)).toMatch(/■/)

  // Where SVG draws: an outlined polygon, stroke only.
  const svg = diamondSvg(seed, pink, { anim: 'working', frame: 0, seed: 3 })
  expect(svg).toMatch(/<polygon points="[^"]+" fill="none" stroke="#f06292" /)
  expect(svg).toMatch(/ width="20" height="20"/)
})

test('a cell of two colors is a lower half block on the upper one, and every cell paints the pixels it did', () => {
  const pic: Picture = { w: 3, h: 2, px: [0xff0000, 0x00ff00, -1, 0x0000ff, -1, 0x0000ff], glyphs: [] }
  expect(cellsOf(toCells(pic).cells)).toEqual([
    [0x2584, 0x0000ff, 0xff0000],
    [0x2580, 0x00ff00, DEFAULT_COLOR],
    [0x2584, 0x0000ff, DEFAULT_COLOR],
  ])
  for (const look of [DEFAULT_LOOK, ...[1, 2, 3, 4].map(seed => randomLook(seed))]) {
    for (const anim of ANIMS) {
      for (const f of [0, 3, 7, 12]) {
        const pose = picture(look, { anim, frame: f, seed: 3, podium: true })
        // The marks aside, which are glyphs of their own.
        const bare = { ...pose, glyphs: [] }
        expect(pixelsOf(cellsOf(toCells(bare).cells), bare.w, bare.h)).toEqual(bare.px)
      }
    }
  }
})

test("fit256 sends the xterm color nearest to each, as a value the engine's cut keeps", () => {
  // Dark sunglasses: cut alone they turn navy; fitted, a near-black grey.
  expect(xtermIndex(0x15151f)).toBe(17)
  expect(xtermIndex(fit256(0x15151f))).toBe(233)
  // Every xterm color is sent as a value the cut puts back on it.
  for (let i = 16; i < 256; i++) expect(xtermIndex(fit256(xtermColor(i)))).toBe(i)
  // The terminal's own color, and anything not 0xRRGGBB, pass as they are.
  expect(fit256(DEFAULT_COLOR)).toBe(DEFAULT_COLOR)
  expect(fit256(-1)).toBe(-1)
  // A hex prop is fitted only while the palette is on; a theme key never.
  expect(paintColor('#15151f')).toBe('#15151f')
  setPalette256(true)
  try {
    expect(paintColor('claude')).toBe('claude')
    expect(xtermIndex(parseInt(paintColor('#15151f').slice(1), 16))).toBe(233)
    const grey = fit256(0x15151f)
    expect(cellsOf(toCells({ w: 1, h: 2, px: [0x15151f, 0x15151f], glyphs: [] }).cells)).toEqual([[0x2584, grey, grey]])
  } finally {
    setPalette256(false)
  }
  expect(cellsOf(toCells({ w: 1, h: 1, px: [0x15151f], glyphs: [] }).cells)).toEqual([[0x2580, 0x15151f, DEFAULT_COLOR]])
})

for (const [name, env, isOn] of PALETTE_CASES) {
  test(`${name}: the figures and the hex colors ${isOn ? "are xterm's 256" : 'are drawn as they are'}`, async ($, on) => {
    engine(on, { rateLimits: [], stored: {}, host: { env } })
    await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: 'mcp__crew__delegate', task: 'Run the tests', repo: '/work/api' })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 46 } })
    try {
      const colors = new Set(
        cellsOf((await ui.find({ type: 'Raster', key: 'orch' }))?.props.cells as string)
          .flatMap(([, fg, bg]) => [fg, bg])
          .filter(c => c !== DEFAULT_COLOR),
      )
      const fur = SKINS[DEFAULT_LOOK.skin]![1]
      expect(colors.has(fur)).toBe(!isOn)
      expect(colors.has(fit256(fur))).toBe(isOn)
      if (isOn) for (const c of colors) expect(fit256(xtermColor(xtermIndex(c)))).toBe(c)
      // A worker's accent too; the theme's keys are the engine's to fit.
      const pip = (await ui.find({ type: 'Text', text: /^Pip$/ }))?.props.color as string
      const accents = NAME_COLORS.slice(1).map(([, c]) => c)
      const fitted = accents.map(
        c =>
          '#' +
          fit256(parseInt(c.slice(1), 16))
            .toString(16)
            .padStart(6, '0'),
      )
      expect((isOn ? fitted : accents).includes(pip)).toBe(true)
      expect((await ui.find({ type: 'Text', text: /^Nova / }))?.props.color).toBe('claude')
      expect((await ui.find({ key: 'edit' }))?.text).toBe(' Edit ')
    } finally {
      await ui.unmount()
      setPalette256(false)
    }
  })
}

test('a frame that changes nothing is not blitted again', async ($, on) => {
  const clock = engine(on)
  const blits: { key: string; cells: string }[] = []
  on('ui.blit', (_, e) => {
    if ('cells' in e) blits.push({ key: e.key, cells: e.cells })
    return { value: {} }
  })
  await $.session.start({ cwd: '/work/main', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const drawn = (await ui.find({ type: 'Raster', key: 'orch' }))?.props.cells as string
  const ticks = 60
  for (let i = 0; i < ticks; i++) await clock.advance(400)
  const sent = blits.filter(b => b.key === 'orch').map(b => b.cells)
  // It still moves, but most ticks it stands still and sends nothing.
  expect(sent.length).toBeGreaterThan(0)
  expect(sent.length).toBeLessThan(ticks / 2)
  // Each blit changes what the figure showed.
  ;[drawn, ...sent].forEach((cells, i, all) => {
    if (i > 0) expect(cells).not.toBe(all[i - 1])
  })
  await ui.unmount()
})
