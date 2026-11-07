// What a summarizer reads when a conversation the crew works in is compacted,
// and the crew's state the orchestrator reads back after it.
// tests/golden/model-text.ts holds each text as it is.
import { ROSTER } from '../config'

/**
 * What the summary of the main conversation keeps and leaves out, so the
 * orchestrator can go on coordinating the crew after a compaction.
 */
export const COMPACT_MAIN = `The crew plugin asks this summary to keep what coordinating the crew needs:
- Every crew worker named so far: its name and address, what it was given, what it owns (files, branch, worktree), and whether its report came back.
- Tasks in flight, and who waits on whom.
- The user's decisions and approvals, word for word where short.
- Branches, commits, pull requests and issues, with their numbers and state.
- The agreed plan and its next step.
- What came back but was not yet told to the user.
Leave out file contents, diffs and command output, reports already summarized to the user or superseded by a later one, roster listings, and the persona's chatter.`

/** What the summary of a crew worker's own conversation keeps, so it can finish its task. */
export const COMPACT_WORKER = `The crew plugin asks this summary to keep what this worker needs to finish: its task as given, word for word where short; the files it changed, its branch, worktree and commits; its teammates' addresses, and what it waits for from whom; the checks it ran and their results; and what its final report still owes. Leave out file contents, diffs and command output it already acted on.`

/**
 * The instructions a compaction runs with: the person's own, typed after
 * `/compact`, first, then the crew's.
 */
export const withCrewInstructions = (own: string | undefined, crew: string): string => [own?.trim() ?? '', crew].filter(text => text !== '').join('\n\n')

/**
 * The crew as the roster has it at the first request after a compaction or
 * a resume, read after the summary; the roster gives the live state.
 */
export const crewStateNote = (roster: string): string =>
  `[crew] The crew as of the last compaction or resume, for the main assistant (a worker ignores this). It goes stale: call ${ROSTER} for live state; reports that came back since arrive on their own.\n${roster}`
