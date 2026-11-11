// The crew's tools as the models see them: names, descriptions and input
// schemas. tests/golden/model-text.ts holds each spec as it is.
import { COMPACT_GAP_MIN, ROSTER_FULL_REPORT_CUT, ROSTER_REPORT_CUT, ROSTER_REPORTS, ROSTER_ROWS } from '../config'
import { DELEGATION_RULES } from './orchestrator'

const DELEGATE_ABOUT = `Hand a task to a crew worker: a named background subagent, general-purpose unless \`subagent_type\` says otherwise, that reports back when done. Goes to the worker you name; else to the free worker this tool started in that repository, of that type and on that model (the session's when unset), that last finished a task, or the next it can reach; it keeps its context; else to a new one. Returns at once: the worker's address, and who else is busy where it works.`

// Policy plugins can keep out a system section but not a tool description, so
// the rules ride here and nowhere else, for the orchestrator alone and only
// while delegation is on; its brief or the latest "[crew]" note says whether
// it is.
const DELEGATE_RULES_FOR = `These rules are for the main assistant, the crew's orchestrator, while delegation is ON (its crew brief or the latest "[crew]" note says whether it is); a worker or fork reading them ignores them and does its own task.`

/**
 * The delegate tool's spec as the model reads it. It holds no name, persona
 * or mode: the tool list heads the prompt cache, so it stays the same for
 * every user and setting and the cache carries over from one session to the next.
 */
export const DELEGATE_SPEC = {
  name: 'delegate',
  description: `${DELEGATE_ABOUT}\n\n${DELEGATE_RULES_FOR}\n\n${DELEGATION_RULES}`,
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description:
          'The brief, from one model to another: goal, facts, constraints, files it owns, what the report must answer. Complete in facts, as a new worker has not seen this conversation; terse in form. To a worker that keeps its context, only what is new.',
      },
      title: {
        type: 'string',
        description: "A 3-6 word label naming the area of work, shown in the panel and as the worker's last task in the roster.",
      },
      repo: {
        type: 'string',
        description:
          'Directory a new worker works in: absolute, relative to the session, or starting with ~; it must exist. Defaults to the session directory. A worker you name stays in its own.',
      },
      worker: {
        type: 'string',
        description:
          "Name or address of a worker in the roster to give this to, forks and the Agent tool's agents included; it keeps its context and its agent type. A busy worker gets the task as a message in the middle of its current one, so prefer a free worker; one answering another worker gets it once that ends.",
      },
      fresh: {
        type: 'boolean',
        description: 'Start a new worker instead of reusing a free one.',
      },
      subagent_type: {
        type: 'string',
        description:
          "Agent type for a new worker, as the Agent tool lists them: `Explore` for a read-only search across many files, `Plan` for a design, the project's own agents. General-purpose when unset. Only a worker of the same type is reused; a fork starts from the Agent tool instead.",
      },
      model: {
        type: 'string',
        description:
          'Model alias for a new worker. Leave it unset: the worker then runs on the session\'s model, whatever its type. Name one ("sonnet", "opus" or "fable") only when the user asks; asking for haiku gives the session\'s model. A free worker is reused only if it runs on that model, or on the session\'s when unset, however it was asked for it.',
      },
    },
    required: ['task'],
  },
  isDeferred: false,
} as const

/** The roster tool's spec. */
export const ROSTER_SPEC = {
  name: 'roster',
  description: `List the crew, busy workers first, then the most recent, at most ${ROSTER_ROWS} rows. Each row: name, SendMessage address, status (starting, working or waiting while busy; idle, done or stopped when free to take a task; failed), "fork of" or "started by" the worker that started it, repository or "worktree of" it for a worker in a git worktree, agent type when not general-purpose, model, tasks, tokens and last task; a busy worker also shows what it is doing, and an agent the worker that started it woke with a message shows "answering <name>" and how many of your tasks wait for it; "not delivered: <why>" means they did not reach it, and go with the next task you give it. The ${ROSTER_REPORTS} latest workers not busy (failed included) show their last report cut to ${ROSTER_REPORT_CUT} characters; pass \`worker\` for one worker with its last report at more length (up to ${ROSTER_FULL_REPORT_CUT} characters). A worker taken off the list comes back when it works again. Use it to pick the worker that should continue earlier work, to find an address for SendMessage or TaskStop, or to see who is busy where.`,
  inputSchema: {
    type: 'object',
    properties: {
      worker: {
        type: 'string',
        description: 'Name or address of one worker to show alone, with its last report at more length (up to 1200 characters), instead of the list.',
      },
    },
  },
  isDeferred: false,
} as const

/**
 * A worker's own tool: what it declares shows on the user's surfaces, and
 * only its step reaches a model, the orchestrator's, in the roster. The
 * orchestrator has it in its list too, so it stays short.
 */
export const PROGRESS_SPEC = {
  name: 'progress',
  description:
    "A crew worker's progress, shown to the user: step 0 of N declares the plan, then each step 1 to N is called as it starts, with what it is. Workers only.",
  inputSchema: {
    type: 'object',
    properties: { step: { type: 'integer' }, total: { type: 'integer' }, doing: { type: 'string' } },
    required: ['step', 'total', 'doing'],
  },
  isDeferred: false,
} as const

/**
 * The orchestrator's tool to compact its own conversation at a safe moment.
 * A worker has it in its list too, so it says whose it is.
 */
export const COMPACT_SPEC = {
  name: 'compact',
  description: `Queue a compaction of the orchestrator's own conversation for a safe moment: between turns, once no worker is busy, at most one every ${COMPACT_GAP_MIN} minutes. The summary keeps the crew's workers, tasks in flight, the user's decisions, branches and pull requests, and drops file dumps and superseded reports. Returns at once; a later call replaces a queued one. Orchestrator only.`,
  inputSchema: {
    type: 'object',
    properties: {
      focus: { type: 'string', description: 'What the summary should stress for what comes next: the next phase, the plan, a decision.' },
      after: {
        type: 'string',
        enum: ['idle', 'reports'],
        description: 'What it waits for: idle (the default), no worker busy; reports, also a turn of yours after the last report came back.',
      },
    },
  },
  isDeferred: false,
} as const
