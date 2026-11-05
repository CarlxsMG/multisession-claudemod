// The names the crew gives its workers: 2 to 4 characters, so a card's four
// columns hold one whole, and the short identifiers past the last of them.

export const WORKER_NAMES = [
  'Pip', 'Bolt', 'Mika', 'Tito', 'Luna', 'Rex', 'Kiko', 'Nube', 'Chip', 'Coco',
  'Brio', 'Lola', 'Zuri', 'Momo', 'Gus', 'Nina', 'Dot', 'Byte', 'Toby', 'Kira',
  'Ari', 'Bea', 'Dex', 'Eli', 'Fizz', 'Gigi', 'Hugo', 'Ivy', 'Juno', 'Leo',
  'Milo', 'Neo', 'Olga', 'Paz', 'Quin', 'Rui', 'Sol', 'Teo', 'Uma', 'Yuki',
]

/** Whether `name` fits a worker as it is: 2 to 4 letters, digits, `-` or `_`, each one column wide. */
export const isWorkerName = (name: string): boolean =>
  /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Nd}_-]{2,4}$/u.test(name)

/**
 * The first name of the pool that `taken` (lowercase) does not hold, then a
 * letter and a number, shortest first (`A1` … `Z9`, `A10` … `Z999`): 25,974
 * more, past anything the crew remembers in a session.
 */
export function freshName(taken: ReadonlySet<string>): string {
  const pool = WORKER_NAMES.find(name => !taken.has(name.toLowerCase()))
  if (pool !== undefined) return pool
  for (const [from, to] of [[1, 9], [10, 99], [100, 999]] as const) {
    for (let n = from; n <= to; n++) {
      for (let c = 0; c < 26; c++) {
        const id = `${String.fromCharCode(65 + c)}${n}`
        if (!taken.has(id.toLowerCase())) return id
      }
    }
  }
  throw new Error('crew: no worker name left')
}
