/**
 * The orchestrator's critter. Saved looks and share codes read these field
 * names, so they stay: `skin` is the body's colour, `hair` what grows on its
 * head, `facial` whiskers, freckles or fangs, `shirt` the markings on its
 * coat, `pants` its paws and `shoes` its feet.
 */
export type Look = {
  name: string
  nameColor: number
  phrase: string
  vibe: string
  skin: number
  hair: string
  hairColor: number
  facial: string
  eyes: string
  mouth: string
  blush: boolean
  shirt: string
  shirtColor: number
  pants: number
  shoes: number
  acc: string
  accColor: number
}

/**
 * A worker's status: busy (`starting`, `working`, `waiting`), free (`idle`),
 * or how its run ended.
 */
export type WorkerStatus = 'starting' | 'working' | 'waiting' | 'idle' | 'done' | 'failed' | 'stopped'

/** A worker of the crew: an agent the crew started or adopted. */
export type Worker = {
  id: string
  name: string
  address: string
  task: string
  type: string
  cwd: string
  status: WorkerStatus
  activity: string
  tools: number
  startedAt: number
  updatedAt: number
  lastMsgAt: number
  lastMsgIn: boolean
  answer: string
  seed: number
  /** What it runs on, as its spawn answered ('' when unknown). */
  model: string
  /**
   * The model its spawn asked for: '' for none, null when `delegate` did not
   * start it (an adopted agent, a fork, the Agent tool's), which is then
   * never reused.
   */
  asked: string | null
  /** Tasks given to it. */
  tasks: number
  /** The tokens its turns used. */
  tokens: number
}

/** Who wrote a feed line: the person, the orchestrator, a worker, or the crew itself. */
export type MsgTone = 'user' | 'orch' | 'worker' | 'event'

/**
 * A line of the pane's feed: the names it shows, and the ids the feed tells
 * people apart by: a worker's agent id, `ORCH_ID`, `USER_ID` for the
 * person, or '' for someone outside the crew.
 */
export type Msg = {
  at: number
  from: string
  to: string
  fromId: string
  toId: string
  text: string
  tone: MsgTone
}

/** What the orchestrator is up to, which its figure shows. */
export type OrchMood = 'idle' | 'thinking' | 'working' | 'delegating' | 'happy'

/** The orchestrator's mood since `since`, and what it is doing. */
export type Orch = { mood: OrchMood; activity: string; since: number }

/** The pane's views: the orchestrator with its crew, the look editor, and the crew in full. */
export type View = 'main' | 'edit' | 'crew'

/**
 * An agent a worker started, by its id: that worker's name, and whether the
 * agent is a fork of it.
 */
export type ParentLink = { id: string; parent: string; fork: boolean }

/**
 * The crew settings a "[crew]" note tells the model: the mode, the name and
 * the personality.
 */
export type CrewSettings = { on: boolean; name: string; vibe: string }

/** Lines Haiku wrote for one personality (`sig`), by mood. */
export type MoodLines = { sig: string; moods: Record<string, string[]> }

/** The look editor's tabs. */
export type EditTab = 'face' | 'hair' | 'clothes' | 'extras' | 'persona' | 'share'

/**
 * One of the account's usage windows in whole percent: `five_hour`,
 * `seven_day`, …, or a model's own weekly one by its name (`Fable`).
 */
export type Limit = { kind: string; percent: number }

/**
 * Someone the crew has had this session, kept after the list lets it go, so
 * the conversation's rows keep its name and color.
 */
export type Member = { id: string; name: string; address: string }

/**
 * A call of a crew tool, by tool_use_id, and the id of the worker the main
 * conversation's reached ('' until known, and for one that reached none or
 * is a worker's own).
 */
export type CrewCall = { id: string; to: string }

/**
 * Where a worker's message went, by the head of its text: the recipient's
 * name, or '' for the main conversation.
 */
export type Route = { from: string; head: string; to: string }

/**
 * What a worker was last given to do, by its id: a task's title, or a
 * message's summary.
 */
export type LastJob = { id: string; title: string }

/** A task the orchestrator gave a woken agent, which waits for that run's end. */
export type HeldTask = { task: string; title: string }
/**
 * An agent the worker that started it woke with a message (`id`), and that
 * worker's name (`by`): that run reports to `by`, so what the orchestrator
 * gives it meanwhile waits in `held` and goes to it once the run ends.
 * `missed`: why they did not reach it then; they wait for the next task the
 * orchestrator gives it, and `isTold` once the orchestrator has heard so,
 * in a tool's result or a user message's note.
 */
export type Takeover = { id: string; by: string; held: HeldTask[]; missed?: string; isTold?: boolean }

/**
 * A worker's message to a free teammate (`id`), which the main conversation
 * sends on: who wrote it (`by`, with its id and address), its text and gist.
 */
export type Relay = { id: string; by: string; byId: string; address: string; text: string; gist: string }

/** What a worker's run is busy with, read off the kinds of its tool calls. */
export type Phase = 'thinking' | 'reading' | 'editing' | 'running' | 'testing' | 'web' | 'delegating' | 'waiting'

/** How a run ended: '' while it runs. */
export type RunEnd = '' | 'done' | 'failed' | 'stopped'

/** How a run that is over ended. */
export type RunEndKind = Exclude<RunEnd, ''>

/**
 * The plan a worker declared with the progress tool, or read off its todo
 * list (`from`): the step it is on of `total`, how many are done, what the
 * step is, and the total it first gave, so a plan that grew says so.
 */
export type Plan = { step: number; total: number; done: number; first: number; doing: string; from: 'tool' | 'todos' }

/**
 * A worker's current or latest run, by its id: from the start of a turn to
 * its end, so a reused worker's time starts again. `phaseAt` is the last
 * call of the phase's kind, `touchedAt` the last sign of life, `plan` absent
 * while the worker has declared none.
 */
export type Run = {
  id: string
  startedAt: number
  endedAt: number
  end: RunEnd
  tools: number
  phase: Phase
  phaseAt: number
  touchedAt: number
  plan?: Plan
}

/**
 * A worker's run as the last check-in showed it, what the next one is
 * compared with: `step` only for a run with a plan.
 */
export type SeenRun = { id: string; startedAt: number; phase: Phase; tools: number; isOpen: boolean; step?: number }

/**
 * The stretch from the first worker starting while none ran to the last of
 * them ending (`startedAt` 0 for none): who ran in it, the time the next
 * check-in is counted from, and what the last one showed. `closedAt` is set
 * while its summary waits for the main session's turn to end.
 */
export type Round = { startedAt: number; ids: string[]; lastAt: number; seen: SeenRun[]; closedAt: number }

/**
 * One worker's line of a check-in row as it was placed: `ms` its run time
 * then, `doing` what it was doing, or for one that ended its task's title,
 * and its run's plan, when it had one.
 */
export type CheckLine = { id: string; name: string; phase: Phase; end: RunEnd; ms: number; doing: string; tools: number; plan?: Plan }

/**
 * A message between agents as its line in the conversation gives it: who
 * to whom (`toId` '' for a recipient outside the crew), its gist, and
 * whether it woke the recipient or never got there.
 */
export type Note = { fromId: string; from: string; toId: string; to: string; gist: string; wakes: boolean; isLost: boolean }

/**
 * A row placed in the conversation: a check-in while workers run, the
 * summary of a round, the end of a run whose report went to another worker,
 * its one line in `lines`, or a message between agents, in `note`. `every`
 * is the check-in interval in minutes (0 for off), shown on the rows
 * `/crew progreso` placed (`isAsked`).
 */
export type CheckIn = {
  id: string
  kind: 'checkin' | 'summary' | 'end' | 'message'
  at: number
  roundMs: number
  every: number
  isAsked: boolean
  lines: CheckLine[]
  note?: Note
  /**
   * What the round's newest check-in shows now, read again from the runs
   * since it was placed (`at` the time it was read); `lines` and `roundMs`
   * keep what it showed when placed, which it folds to once another comes.
   */
  shown?: { at: number; roundMs: number; lines: CheckLine[] }
}

/** A row that waits for the main session's turn to end, to be placed. */
export type PendingRow = Pick<CheckIn, 'kind' | 'lines' | 'note'>

/**
 * What delegate meant a new worker to be, by its address, until the spawn
 * hook reads it: where it works and its type, and the task of one delegate
 * handed to the orchestrator to start.
 */
export type Intent = { address: string; cwd: string; type: string; task?: string }

/**
 * A worker's last SendMessage, by its id: the head of its text, which its
 * send is matched by, and the summary it gave.
 */
export type SendGist = { id: string; head: string; gist: string }

/**
 * A worker's TaskCreate items, by its id: each by the id the engine gave it
 * (`key`), with its status and text.
 */
export type TaskList = { id: string; items: { key: string; status: string; text: string }[] }

/**
 * What an end-of-task row was first drawn with, by its request id: the
 * task's title, the run's time as the crew measured it then, and the step
 * a failed or stopped run stood on ('' for none).
 */
export type NoteFirst = { id: string; title: string; ms?: number; step: string }

declare module 'claude-code' {
  interface PluginState {
    crew: {
      look: Shaped<Look>
      workers: Shaped<Worker[]>
      dropped: Shaped<Worker[]>
      worktrees: Shaped<string[]>
      parents: Shaped<ParentLink[]>
      messages: Shaped<Msg[]>
      orch: Shaped<Orch>
      view: View
      tab: EditTab
      lines: Shaped<MoodLines>
      isOn: boolean
      brief: Shaped<string>
      note: Shaped<CrewSettings | null>
      limits: Shaped<Limit[]>
      modelLimits: Shaped<Limit[]>
      cast: Shaped<Member[]>
      calls: Shaped<CrewCall[]>
      routes: Shaped<Route[]>
      takeovers: Shaped<Takeover[]>
      relays: Shaped<Relay[]>
      jobs: Shaped<LastJob[]>
      opened: Shaped<string[]>
      model: Shaped<string>
      runs: Shaped<Run[]>
      round: Shaped<Round>
      checkins: Shaped<CheckIn[]>
      due: Shaped<PendingRow[]>
      beat: number
      listed: Shaped<string[]>
      intents: Shaped<Intent[]>
      isolated: Shaped<string[]>
      sendGists: Shaped<SendGist[]>
      taskLists: Shaped<TaskList[]>
      noteFirst: Shaped<NoteFirst[]>
    }
  }
}
