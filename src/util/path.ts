// Paths come POSIX (macOS, Linux) or Windows (`C:\…`, `\\server\share\…`,
// either slash, any case): a session's directory says which.
const isWinPath = (path: string): boolean => /^[A-Za-z]:([\\/]|$)|^[\\/]{2}[^\\/]/.test(path)

/** A path's last part, either slash. */
export const basename = (path: string): string =>
  path
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .pop() || path

// The same directory however it was spelled: Windows ignores case and slashes.
const pathKey = (path: string): string => (isWinPath(path) ? path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() : path.replace(/(.)\/+$/, '$1'))
/**
 * Whether two paths name the same directory: a Windows one in any case and
 * either slash, a trailing slash aside.
 */
export const samePath = (a: string, b: string): boolean => pathKey(a) === pathKey(b)

/** `rel` resolved against `base`, as a path of their kind. */
export function joinPath(base: string, rel: string): string {
  if (isWinPath(base) || isWinPath(rel)) return joinWinPath(base, rel)
  const out: string[] = []
  for (const part of (rel.startsWith('/') ? rel : `${base}/${rel}`).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return '/' + out.join('/')
}

// `C:\a\b`, `\\server\share\a`, `\a` (the base's drive), `/c/a` (Git Bash's
// spelling of `C:\a`) or relative to the base; `..` stops at the root.
function joinWinPath(base: string, rel: string): string {
  const bash = /^\/([A-Za-z])(?=\/|$)/.exec(rel)
  const full = bash
    ? `${bash[1]}:${rel.slice(2) || '\\'}`
    : isWinPath(rel) || /^[A-Za-z]:/.test(rel)
      ? rel
      : /^[\\/]/.test(rel)
        ? `${/^[A-Za-z]:/.exec(base)?.[0] ?? ''}${rel}`
        : `${base}\\${rel}`
  const unc = /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)/.exec(full)
  const drive = /^([A-Za-z]):/.exec(full)
  const root = unc ? `\\\\${unc[1]}\\${unc[2]}` : drive ? `${drive[1]!.toUpperCase()}:` : ''
  const out: string[] = []
  for (const part of full.slice(unc ? unc[0].length : drive ? 2 : 0).split(/[\\/]/)) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `${root}\\${out.join('\\')}`
}
