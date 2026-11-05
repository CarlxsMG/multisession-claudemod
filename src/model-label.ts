// A model's id as people say it, for the pane's top line, and as the
// alias the Agent tool takes.
/**
 * A model's id as people say it, from the id's own parts: claude-opus-5-5 is
 * "Opus 5.5" and claude-3-5-sonnet-20241022 "Sonnet 3.5", behind a cloud's
 * prefix (us.anthropic.) or after its version (@2025…, -v1:0) too. What does
 * not read as one is shown as it is.
 */
export function modelLabel(id: string): string {
  const raw = id.trim()
  const at = raw.toLowerCase().indexOf('claude-')
  if (at < 0) return raw
  const core = raw
    .toLowerCase()
    .slice(at)
    .replace(/\[[^\]]*\]$/, '')
    .replace(/@.*$/, '')
    .replace(/-v\d+(:\d+)?$/, '')
    .replace(/-(\d{8}|latest)$/, '')
  const label = (family: string, major: string, minor?: string) =>
    `${family[0]!.toUpperCase()}${family.slice(1)} ${major}${minor !== undefined ? `.${minor}` : ''}`
  const named = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?$/.exec(core)
  if (named) return label(named[1]!, named[2]!, named[3])
  const numbered = /^claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)$/.exec(core)
  if (numbered) return label(numbered[3]!, numbered[1]!, numbered[2])
  return raw
}

/** The families the Agent tool's `model` takes, as aliases in place of an id. */
const ALIASES = ['fable', 'opus', 'sonnet', 'haiku'] as const

/**
 * The alias the Agent tool takes for a model id: the family the id names
 * (claude-opus-5-5 is `opus`), undefined for an id that names none.
 */
export const modelAlias = (id: string): (typeof ALIASES)[number] | undefined =>
  ALIASES.find(alias => new RegExp(`\\b${alias}\\b`, 'i').test(id))

/**
 * The model as the top line has room for: cut short, then left out, so the
 * name before it stays whole.
 */
export function fitModel(label: string, room: number): string {
  if (label.length <= room) return label
  return room >= 5 ? `${label.slice(0, room - 1).trimEnd()}…` : ''
}
