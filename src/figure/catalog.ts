// What a figure is built from: the size of its body, the colour tables and
// parts a look picks from, and the pixel layers each part paints. A look
// stores part keys and table positions, so neither ever changes. Their names
// in the editor are the UI's words, by part key and colour id.

/** A figure's body in pixels. */
export const W = 8
export const H = 9
// A cell row above the body, two pixels: a hop lifts the head into it rather
// than out of the box, and the marks take its corners.
export const HEADROOM = 2
/** The row of pixels under a figure that stands on a podium. */
export const PODIUM = 1

/** Terminal rows a figure takes, two pixels to a row. */
export const pictureRows = (podium: boolean): number => Math.ceil((HEADROOM + H + (podium ? PODIUM : 0)) / 2)

/** Rows of pixels a part paints from row `y` down, one character a pixel. */
export type Layer = { y: number; rows: readonly string[] }
type Part = { layer?: Layer }
/** A table of colors, each by the id its name in the editor is looked up by. */
export type Named = readonly (readonly [string, number])[]

/** The `skin` field: the colour of its body. */
export const SKINS: Named = [
  ['cream', 0xffe6c2],
  ['peach', 0xffb88c],
  ['lemon', 0xf3df7a],
  ['mint', 0x8fe3bf],
  ['sky', 0x8ec5ff],
  ['lavender', 0xc5a8f5],
  ['bubblegum', 0xf7a6cf],
  ['cocoa', 0x9a6a4a],
]

/** The colors hair, markings and accessories take. */
export const COLORS: Named = [
  ['black', 0x2b2b2b],
  ['chestnut', 0x6b3e26],
  ['blond', 0xf2d16b],
  ['ginger', 0xd35400],
  ['grey', 0x9e9e9e],
  ['white', 0xf2f2f2],
  ['red', 0xe53935],
  ['orange', 0xfb8c00],
  ['yellow', 0xfdd835],
  ['green', 0x43a047],
  ['mint', 0x4dd0b1],
  ['blue', 0x1e88e5],
  ['navy', 0x283593],
  ['purple', 0x8e24aa],
  ['pink', 0xec407a],
  ['lilac', 0xb39ddb],
  ['brown', 0x795548],
  ['denim', 0x3b5b92],
]

/**
 * How the orchestrator's name is written: the theme's own color first, then
 * mid-tone accents that read on dark and light themes alike.
 */
export const NAME_COLORS: readonly (readonly [string, string])[] = [
  ['claude', 'claude'],
  ['lightBlue', '#4fc3f7'],
  ['green', '#81c784'],
  ['orange', '#ffb74d'],
  ['lilac', '#ba68c8'],
  ['pink', '#f06292'],
  ['turquoise', '#4db6ac'],
  ['violet', '#9575cd'],
  ['coral', '#e57373'],
  ['lime', '#aed581'],
  ['blue', '#64b5f6'],
]

/**
 * The critter, front on: one round body that is also its face, rows 1-7,
 * with its feet on row 8 and what grows on its head on row 0. The face: the
 * top of a tall eye on row 2, the eyes on 3, cheeks on 4, the mouth on 5
 * and 6. Its paws stand out at x 0 and 7.
 */
export const BODY: Layer = {
  y: 0,
  rows: [
    '........',
    '..SSSS..',
    '.SSSSSS.',
    '.SSSSSS.',
    '.SSSSSS.',
    '.SSSSSS.',
    '.SSSSSS.',
    '..ssss..',
    '.FF..FF.',
  ],
}

/**
 * The `hair` field: what grows on its head, in the hair colour. The first
 * row's corners stay free for the marks.
 */
export const HAIRS: Record<string, Part> = {
  short: { layer: { y: 0, rows: ['.HH..HH.', '.H....H.'] } },
  fringe: { layer: { y: 0, rows: ['..HHH...', '..HH....'] } },
  long: { layer: { y: 1, rows: ['.HH..HH.', 'HH....HH', 'H......H', 'h......h'] } },
  spiky: { layer: { y: 0, rows: ['.H.HH.H.', '..HHHH..'] } },
  bun: { layer: { y: 0, rows: ['...HH...', '..hHHh..'] } },
  mohawk: { layer: { y: 0, rows: ['...HH...', '...HH...', '...hh...'] } },
  afro: { layer: { y: 0, rows: ['..HHHH..', '.HH..HH.', 'HH....HH', 'H......H', 'H......H', 'hH....Hh'] } },
  ponytail: { layer: { y: 0, rows: ['....HH..', '...h....'] } },
  pigtails: { layer: { y: 2, rows: ['HH....HH', 'H......H'] } },
  buzz: { layer: { y: 0, rows: ['..h..h..', '..hhhh..'] } },
  bald: { layer: { y: 1, rows: ['..W.....'] } },
}

/** The `eyes` field. */
export const EYES: Record<string, Part> = {
  dot: { layer: { y: 3, rows: ['..E..E..'] } },
  big: { layer: { y: 2, rows: ['..E..E..', '..E..E..'] } },
  shine: { layer: { y: 2, rows: ['..W..W..', '..E..E..'] } },
  wide: { layer: { y: 3, rows: ['.EE..EE.'] } },
  happy: { layer: { y: 2, rows: ['..E..E..', '.E.EE.E.'] } },
  wink: { layer: { y: 2, rows: ['.....E..', '..E.E.E.'] } },
}

/** The eyes, closed. */
export const BLINK: Layer = { y: 3, rows: ['.ss..ss.'] }

/** The `mouth` field. */
export const MOUTHS: Record<string, Part> = {
  smile: { layer: { y: 5, rows: ['..M..M..', '...MM...'] } },
  grin: { layer: { y: 5, rows: ['..MWWM..', '...MM...'] } },
  small: { layer: { y: 5, rows: ['...MM...'] } },
  open: { layer: { y: 5, rows: ['...MM...', '...MM...'] } },
  tongue: { layer: { y: 5, rows: ['..MMMM..', '...RR...'] } },
  flat: { layer: { y: 5, rows: ['..MMMM..'] } },
}

/** The `facial` field: whiskers, freckles or fangs, drawn over the mouth. */
export const FACIALS: Record<string, Part> = {
  none: {},
  mustache: { layer: { y: 4, rows: ['H......H', '.H....H.'] } },
  beard: { layer: { y: 4, rows: ['..h..h..', '.h....h.'] } },
  goatee: { layer: { y: 6, rows: ['..W..W..'] } },
}

/** The cheeks, when `blush`. */
export const BLUSH: Layer = { y: 4, rows: ['.B....B.'] }

/**
 * The `shirt` field: the markings on its coat, in the shirt colour, under
 * the face.
 */
export const SHIRTS: Record<string, Part> = {
  tee: {},
  stripes: {
    layer: { y: 1, rows: ['...tt...', '.t....t.', '........', '.t....t.', '........', '.t....t.', '..t..t..'] },
  },
  hoodie: { layer: { y: 6, rows: ['.T....T.', '..TTTT..'] } },
  suit: { layer: { y: 7, rows: ['..TYYT..'] } },
  labcoat: {
    layer: { y: 1, rows: ['....T...', '......T.', '........', '........', '.T......', '......T.', '..T.....'] },
  },
  overalls: { layer: { y: 5, rows: ['.T....T.', '.TTTTTT.', '..TTTT..'] } },
  logo: { layer: { y: 7, rows: ['...AA...'] } },
}

/** The `acc` field: what it wears or carries. */
export const ACCS: Record<string, Part> = {
  none: {},
  glasses: { layer: { y: 3, rows: ['.KGKKGK.'] } },
  shades: { layer: { y: 3, rows: ['KLLKKLLK', '.LL..LL.'] } },
  headphones: { layer: { y: 0, rows: ['..AAAA..', '.A....A.', 'AA....AA', 'aA....Aa'] } },
  cap: { layer: { y: 0, rows: ['..AAAA..', '..aaaaa.'] } },
  beanie: { layer: { y: 0, rows: ['..AWWA..', '.aAaaAa.'] } },
  crown: { layer: { y: 0, rows: ['.Y.YY.Y.', '..YRRY..'] } },
  halo: { layer: { y: 0, rows: ['..YYYY..'] } },
  bow: { layer: { y: 0, rows: ['.AaA....'] } },
  flower: { layer: { y: 0, rows: ['.AYA....', '..A.....'] } },
  horns: { layer: { y: 0, rows: ['.A....A.', '.AA..AA.'] } },
  catears: { layer: { y: 0, rows: ['.A....A.', '.AB..BA.'] } },
  antenna: { layer: { y: 0, rows: ['...A....', '...K....'] } },
  scarf: { layer: { y: 6, rows: ['.AAAAAA.', '.a......'] } },
}

/** A table's color at `i`, its first for a position it lacks. */
export const colorAt = (list: Named, i: number): number => (list[i] ?? list[0]!)[1]

/** The positions in `COLORS` a part can take, and the ones hair can. */
export const ALL_COLORS = COLORS.map((_, i) => i)
export const HAIR_COLORS = [0, 1, 2, 3, 4, 5, 13, 14, 11, 10]
