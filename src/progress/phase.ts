// What a worker is busy with, from the tools it calls: the phase each call
// says, which one shows while calls of several kinds come close together,
// the word for it, and the call itself in a line.
import type { Phase, Run } from '../../types'
import { t } from '../i18n'
import type { ToolCall } from '../util/input'
import { basename } from '../util/path'
import { oneLine } from '../util/text'

export const phaseLabel = (phase: Phase): string => t().phase[phase]

const READING = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'])
const EDITING = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const RUNNING = new Set(['Bash', 'PowerShell', 'BashOutput', 'KillShell'])
const WEB = new Set(['WebSearch', 'WebFetch'])
const DELEGATING = new Set(['Agent', 'Task', 'SendMessage', 'TaskStop', 'mcp__crew__delegate'])
const WAITING = new Set(['Monitor', 'TaskOutput', 'AskUserQuestion'])

// A command that runs a test suite: the runners of the usual ecosystems,
// alone or behind a package manager, after `&&`, `;` or `|`.
const TEST_RUN = new RegExp(
  [
    String.raw`(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b`,
    String.raw`(?:npx|bunx|pnpx)\s+(?:-y\s+)?(?:jest|vitest|mocha|ava|playwright\s+test)\b`,
    String.raw`(?:jest|vitest|pytest|mocha|rspec|phpunit|ctest|tox|nox)\b`,
    String.raw`python[\d.]*\s+-m\s+(?:pytest|unittest)\b`,
    String.raw`(?:go|cargo|dotnet|deno|swift|mix|zig)\s+test\b`,
    String.raw`cargo\s+nextest\b`,
    String.raw`(?:mvn|mvnw|\./mvnw|gradle|gradlew|\./gradlew)\b[^|;&]*\btest\b`,
    String.raw`make\s+(?:test|check)\b`,
    String.raw`claude\s+plugin\s+test\b`,
  ]
    .map(p => String.raw`(?:^|[\s;&|(])` + p)
    .join('|'),
)

/** Whether a shell command runs tests. */
export const isTestRun = (command: string): boolean => TEST_RUN.test(command)

/**
 * The phase a call belongs to; undefined for a call that says nothing about
 * it (a todo list, a skill, an unknown tool), which keeps the phase it had.
 */
export function phaseOf(call: { tool: string } & Record<string, unknown>): Phase | undefined {
  const tool = call.tool
  if (READING.has(tool)) return 'reading'
  if (EDITING.has(tool)) return 'editing'
  if (RUNNING.has(tool)) {
    const command = typeof call.command === 'string' ? call.command : ''
    if (/^\s*sleep\s+\d/.test(command)) return 'waiting'
    return isTestRun(command) ? 'testing' : 'running'
  }
  if (WEB.has(tool) || /^mcp__.*(?:browser|playwright|web_?(?:search|fetch))/i.test(tool)) return 'web'
  if (DELEGATING.has(tool)) return 'delegating'
  if (WAITING.has(tool)) return 'waiting'
  return undefined
}

// Reading between edits is still editing: a lighter call takes the phase
// from a heavier one only once the heavier kind has had no call for STICK_MS,
// so the phase shown does not flicker with every look at a file.
const WEIGHT: Record<Phase, number> = {
  thinking: 0,
  waiting: 1,
  reading: 1,
  web: 1,
  delegating: 2,
  running: 2,
  editing: 3,
  testing: 3,
}
/** How long a phase holds against a lighter one. */
export const STICK_MS = 30_000

/**
 * A run's phase after a call of `kind`: a heavier phase takes over at once,
 * a lighter one once the current has held `STICK_MS`.
 */
export function nextPhase(run: Pick<Run, 'phase' | 'phaseAt'>, kind: Phase | undefined, now: number): Pick<Run, 'phase' | 'phaseAt'> {
  if (kind === undefined) return { phase: run.phase, phaseAt: run.phaseAt }
  if (kind === run.phase || WEIGHT[kind] >= WEIGHT[run.phase] || now - run.phaseAt >= STICK_MS) return { phase: kind, phaseAt: now }
  return { phase: run.phase, phaseAt: run.phaseAt }
}

/** The phase to show: a worker the engine has waiting waits, whatever it ran. */
export const shownPhase = (run: Pick<Run, 'phase'>, status: string): Phase => (status === 'waiting' ? 'waiting' : run.phase)

const TOOL_TARGETS = [
  'file_path', 'notebook_path', 'path', 'command', 'pattern',
  'url', 'query', 'description', 'skill', 'to',
] as const

/**
 * A call as the pane names it: the tool, and what it acts on, a path by its
 * file name.
 */
export function describe(call: ToolCall): string {
  const tool = call.tool.startsWith('mcp__')
    ? call.tool.split('__').slice(2).join('__') || call.tool
    : call.tool
  for (const key of TOOL_TARGETS) {
    const value = call[key]
    if (typeof value === 'string' && value.trim() !== '') {
      return `${tool} ${oneLine(key.endsWith('path') ? basename(value) : value, 90)}`
    }
  }
  return tool
}
