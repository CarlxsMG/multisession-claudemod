// The names the crew registers under, the tick its pane moves on, and the
// limits the roster and the briefs share.

/** The pane's request id, which its render hook and every redraw name. */
export const PANE = 'crew'
/** The crew's tools as the engine names them: `mcp__<plugin>__<tool>`. */
export const DELEGATE = 'mcp__crew__delegate'
export const ROSTER = 'mcp__crew__roster'
export const PROGRESS = 'mcp__crew__progress'
/** The pane's timer: one frame of the figures, and the beat the rest of the tick counts in. */
export const TICK_MS = 400
/** The teammates a worker's brief lists; the orchestrator gives it any other address. */
export const MATES = 6

/** The workers the roster lists, and how many of the free ones show their last report. */
export const ROSTER_ROWS = 12
export const ROSTER_REPORTS = 3
/** How much of a last report the roster shows: in a row of the list, and for one worker asked for alone. */
export const ROSTER_REPORT_CUT = 120
export const ROSTER_FULL_REPORT_CUT = 1200
