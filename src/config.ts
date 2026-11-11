// The names the crew shares with the engine, the tick its pane moves on, and
// the limits the roster and the briefs share.

/**
 * The plugin's name, as its manifest gives it: what the engine marks the
 * crew's own calls and rows with. The atoms and the hook matchers spell it out,
 * as the validator reads those only as written.
 */
export const PLUGIN = 'crew'
/** The pane's request id, which its render hook and every redraw name. */
export const PANE = 'crew'
/** The crew's tools as the engine names them: `mcp__<plugin>__<tool>`. */
export const DELEGATE = 'mcp__crew__delegate'
export const ROSTER = 'mcp__crew__roster'
export const PROGRESS = 'mcp__crew__progress'
export const COMPACT = 'mcp__crew__compact'
/** The main conversation's address, which an agent's SendMessage names it by. */
export const MAIN_ADDRESS = 'main'
/** The agent type of a worker nobody asked another type for: the engine's default, which the roster leaves unsaid. */
export const DEFAULT_TYPE = 'general-purpose'
/**
 * The engine's own agent types that edit no file and start no agent: a worker
 * of one is not told how to commit, write comments or fork itself. By name
 * alone: a type the crew does not know may edit, and hears every rule.
 */
export const READ_ONLY_TYPES: ReadonlySet<string> = new Set(['Explore', 'Plan'])
/** The pane's timer: one frame of the figures, and the beat the rest of the tick counts in. */
export const TICK_MS = 400
/** The teammates a worker's brief lists; the orchestrator gives it any other address. */
export const MATES = 6

/** The workers the roster lists, and how many of the free ones show their last report. */
export const ROSTER_ROWS = 12
export const ROSTER_REPORTS = 3
/** How much of a last report the roster shows: in a row of the list, and for one worker asked for alone. */
export const ROSTER_REPORT_CUT = 120
export const ROSTER_FULL_REPORT_CUT = 8000
/**
 * The workers whose last report is kept whole, the latest, for the roster to
 * show one asked for alone; and how much of a report every worker keeps on
 * one line, which the roster's list is cut from.
 */
export const REPORTS_KEEP = 24
export const REPORT_LINE_CUT = 1200
/**
 * How long after its last turn ended a free worker is still reused by a call
 * that does not name it, which the delegate tool's description states. Waking
 * a worker sends its whole conversation again, and the prompt cache holds it
 * for 5 minutes after its last request: past that it is billed uncached, for
 * a task that may have nothing to do with what the worker holds. The minute
 * short of the cache's life leaves room for the send to reach it.
 */
export const REUSE_WARM_MIN = 4
/** The least time between two compactions the crew starts, which the compact tool's spec states. */
export const COMPACT_GAP_MIN = 10
/**
 * How soon after the main conversation's turn ended the crew may start a
 * compaction it queued. The summary request reads the whole transcript again,
 * and the prompt cache holds its prefix for 5 minutes after the last request:
 * past that the transcript is billed uncached, so the ask waits for the next
 * turn's end. The minute short of the cache's life leaves room for the tick
 * and the request to reach it.
 */
export const COMPACT_WARM_MIN = 4
