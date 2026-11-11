// What a worker's model reads from the crew: the preamble of its first task,
// a fork's, how each new task ends, the tasks that waited for it, and the
// messages the crew passes on. tests/golden/model-text.ts holds each text as
// it is.
import type { Relay, Worker } from '../../types'
import { COMPACT, DELEGATE, PROGRESS, REPORT_WORDS, ROSTER, ROSTER_REPORT_CUT } from '../config'
import { basename } from '../util/path'

/**
 * The system prompt of the crew's own agent type: who a worker is and how it
 * goes about a task, the same for every worker. A type's prompt stands where
 * the engine's own text for a general-purpose agent would, so this says what
 * that one does; the engine adds its notes after either.
 */
export const WORKER_ROLE = `You are a worker agent for Claude Code, Anthropic's official CLI for Claude. Given a task, use the tools available to complete it fully: do not gold-plate, and do not leave it half-done. When it is done, report what was done and what you found, concisely: whoever gave you the task relays it, so it needs only the essentials.

Guidelines:
- Looking for something whose place you do not know: search broadly first, then narrow down, and try another strategy when the first finds nothing. Use Read when you know the path.
- Be thorough: check more than one location, consider other naming conventions, look for related files.
- Never create a file unless the task needs it: prefer editing one that exists. Write documentation files (*.md, README) only when the task asks for them.
- You are the agent for this task. Do the work yourself: do not hand the whole of it to another single agent.`

/**
 * The crew's own agent type as the engine registers it, `crew:worker`: a
 * general-purpose worker without the orchestrator's tools, which a worker is
 * refused and whose descriptions it would carry in every request. Its
 * description is the line the orchestrator reads of it among the agent
 * types: it says who starts one.
 */
export const WORKER_AGENT = {
  name: 'worker',
  description: `A worker of the crew: started by ${DELEGATE}, never by the Agent tool.`,
  prompt: WORKER_ROLE,
  disallowedTools: [DELEGATE, COMPACT],
}

/** What the woken teammate reads: who wrote, and where its report goes. */
export const relayText = (r: Relay, orchName: string): string =>
  `[crew] From ${r.by} ("${r.address}"), passed on by the crew: your report goes to ${orchName}; what ${r.by} needs back, SendMessage it.\n\n${r.text}`

// Whoever reads a report wrote the task: it needs the outcome and the facts
// it lacks, not the task told back. The first line is all the roster's list
// shows of a report, so it says whether the task is finished and what came
// of it; what was run is told apart from what was not, so that a check is
// not asked for twice.
const REPORT_RULE = `open with DONE, PARTIAL or BLOCKED and the outcome, in one line of ${ROSTER_REPORT_CUT} characters at most (the roster's list shows only that much); then only facts: branch and commits or files changed, the checks you ran with their results and what you did not verify, blockers, decisions needed. ${REPORT_WORDS} words at most unless the task sets a length. Don't restate the task or narrate your steps; no pleasantries, headings or diffs; quote a line only when a decision depends on it.`

// What closes a new task for a worker that heard the preamble: its plan
// starts again with the task, at its first step.
const AGAIN = `Report as before. 3+ steps: ${PROGRESS} again from step 1.`

/**
 * How a new task for a worker ends: one the crew started heard the preamble
 * and reports as before; another agent (`asked` null) is told how.
 */
export const taskClose = (asked: string | null | undefined): string => (asked !== null ? AGAIN : `When done, ${REPORT_RULE}`)

// Teammates as a worker reads them: each one's name, its address and where
// it works. `apart` holds the ids of those in a worktree of their own.
const namedMates = (mates: readonly Worker[], apart: ReadonlySet<string>): string =>
  mates.map(w => `${w.name} ("${w.address}", ${apart.has(w.id) ? 'own worktree of ' : ''}${basename(w.cwd)})`).join(', ')

/**
 * The line a new task carries, ahead of how it ends, of the teammates the
 * worker was not told of, as the caller chose them; '' for none. `knowsSome`:
 * it was told of teammates before, in its preamble, so these are new to it.
 */
export const newMates = (mates: readonly Worker[], apart: ReadonlySet<string>, knowsSome: boolean): string =>
  mates.length === 0 ? '' : `${knowsSome ? 'New teammates' : 'Teammates'} you can reach with SendMessage: ${namedMates(mates, apart)}.\n`

/**
 * What a worker reads after it edited a file that the run in flight of
 * another worker, `name`, has edited too.
 */
export const sameFile = (name: string, address: string, path: string): string =>
  `[crew] ${name} ("${address}") has edited ${basename(path)} in its task in flight. Before you change this file again, settle with ${name} who does (SendMessage): two workers on one file overwrite each other.`

/** The tasks that waited for a woken worker, sent as one once its run ends. */
export const heldTasks = (held: readonly { task: string; title: string }[]): string =>
  held.length === 1 ? held[0]!.task : `${held.length} tasks, in order:\n\n${held.map((h, i) => `## ${i + 1}. ${h.title}\n${h.task}`).join('\n\n')}`

/** What a worker reads of a message the user wrote to it in the pane. */
export const fromUser = (body: string): string => `[crew] Message from the user, via the crew panel:\n${body}`

/**
 * How a worker, and a fork of the main session, work with git and write
 * comments. `you` is its lowercase name.
 */
export const gitRules = (cwd: string, you: string): string =>
  `- In a git repository: start with \`git status\`, leave changes you did not make alone, and read \`git log\`/\`git blame\` before changing code. The user wants you to commit your own work as you go: one logical change per commit, a message saying why, only your own paths (never \`add -A\`, \`.\` or \`commit -a\`). Push only when your task says the user asked, and the same goes for committing or merging on the main branch (\`origin/HEAD\`'s, else main, master, trunk or develop): otherwise work in a worktree of your own, \`git worktree add ../${basename(cwd)}-${you} -b crew/${you}-<topic>\` unless your task names the branch, its base or the path, and ask in your report to merge it.
- A comment says why the code is as it is now, never its history: not what changed or what it was, who or when ("now…", "no longer…", "was…", "previously…", "removed…"), and no commented-out code.`

/**
 * `reportsTo` is who it reports to: the orchestrator, or the worker that
 * started it. `mates` are the teammates it hears of, as the caller chose them;
 * `apart` holds the ids of workers in a worktree of their own. `isReadOnly`
 * is for a worker of a type that edits nothing and starts no agent: it is not
 * told how to fork itself, commit or write comments.
 */
export function workerPreamble(
  name: string,
  orchName: string,
  reportsTo: string,
  cwd: string,
  mates: readonly Worker[],
  worktree: 'own' | 'parent' | undefined,
  apart: ReadonlySet<string>,
  isReadOnly: boolean,
) {
  const named = namedMates(mates, apart)
  const where =
    worktree === 'own'
      ? `- You work in your own git worktree of ${cwd}, where your shell starts: stay in it, not in ${cwd}. Finish the task there, commit on its branch, and give its path and branch in your report.`
      : worktree === 'parent'
        ? `- You work in ${reportsTo}'s git worktree of ${cwd}, where your shell starts: stay in it, not in ${cwd}, and commit your own work there.`
        : `- Your repository is ${cwd}. Your shell may start elsewhere: cd there or use absolute paths under it. Finish the task end to end there.`
  // What only a worker that starts agents and edits files can apply, each
  // with the line break that follows it.
  const forks = isReadOnly
    ? ''
    : `- Parallel parts, once you have read what they need: fork yourself once per part (Agent tool, \`subagent_type: "fork"\`). Each starts from your context, so give it only its part and files; report the whole once they report.\n`
  const git = isReadOnly ? '' : `${gitRules(cwd, name.toLowerCase())}\n`
  return `[crew] You are ${name}, a worker in ${orchName}'s crew. ${orchName} orchestrates and talks with the user; you do the hands-on work. All you send goes to models: terse, facts only, nothing the reader already knows.
${where}
- Teammates you can reach with SendMessage: ${named || 'none yet'}. Coordinate directly when your work touches theirs.
- A message reaches a busy teammate at its next tool call, and wakes a free one with its context; a woken teammate reports to ${orchName} (your own forks and agents, to you), so ask it to send you what you need.
- Waiting on someone: do what does not need it, then end your turn with your report: what you have, what you wait for and from whom. Their message wakes you with this context. Never wait inside your turn: no sleep, polling, Monitor, background loops or ${ROSTER} checks for a teammate.
- Someone waits on you: SendMessage it as soon as you have what it needs.
- You keep this context after you report: ${reportsTo}'s follow-ups carry only what is new.
- Run only commands that end: no \`tail -f\`, \`watch\`, \`--watch\` modes or unbounded \`while true\`. Background only what must outlive a call; TaskStop every background shell and Monitor you started before your final report, and name in it any server left running, with its port.
${forks}- 3+ steps: call ${PROGRESS} as you start each step, 1 to N (the N steps you will actually take), in the same message as that step's first tool call.
- Stop and report instead of guessing when a decision is the user's (a push, a merge, deleting work, a choice between designs) or the task proves far larger than briefed: PARTIAL or BLOCKED, with what you have and the question.
${git}- Your final message goes back into ${reportsTo}'s conversation, which must stay small: ${REPORT_RULE}

Task:
`
}

/**
 * A fork keeps its parent's context and identity: it hears how to report. A
 * worker's fork has the git rules from its parent; the main session's hears
 * them here.
 */
export const forkPreamble = (reportsTo: string, git = '') =>
  `[crew] Your final message goes back into ${reportsTo}'s conversation, which must stay small: ${REPORT_RULE}\n${git ? `${git}\n` : ''}\n`
