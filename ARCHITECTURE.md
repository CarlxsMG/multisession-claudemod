# How crew works

This is the map a contributor needs before changing more than one file: how the plugin sits on
Claude Code's engine, what each folder does, what it stores, how the main flows run, and the
rules the code relies on. Words in **bold** on first use are defined in the [Glossary](#glossary).

## The engine model

crew is a Claude Code plugin with one **hooks module**, `hooks/register.tsx` (named by
`hooks/hooks.json`). Claude Code loads it and calls `register(on, options)`, where `options` holds
the plugin's `userConfig` values (`language`). Each `on(event, matcher?, handler)` call adds a
hook.

- **A hook** receives `$` (the engine: `$.state`, `$.store`, `$.ui`, `$.agent`, `$.session`,
  `$.clock`, `$.tool`, `$.command`, `$.settings`, `$.process`, `$.fs`, `$.env`), the event `e`,
  and, for the events that form a chain, `next`. Calling `next(e)` lets the engine (and the
  hooks after this one) do their part; what it returns is the engine's answer, which the hook
  may change or replace. A gating hook that answers without calling `next` decides the event
  (the crew's own tools answer their calls this way).
- **`.catch(handler)`** on a registration answers when the hook throws. A gating hook's catch
  passes the event on (`next(e)`) unless it must answer itself: `delegate` answers
  `DELEGATE_FAILED`, and a send that may already have gone out answers undelivered
  (`SEND_UNSURE`) rather than send twice. Render hooks fall back to the engine's own drawing.
- **State** (`$.state`): typed **atoms**, declared in `src/state/atoms.ts` against the contract in
  `types/index.d.ts`. They hold the session's data and outlive a reload or an update of the
  plugin. A drawing that reads an atom is drawn again when the atom changes.
- **Store** (`$.store`): a few keys that outlive sessions and plugin versions: what the user
  chose and keeps.
- **Hook bodies** live in `src/`, as `function` declarations, so the validator can follow `$` into
  them and list the state each hook reads and writes.

`src/engine.ts` names the engine type the helpers take (`Engine`) and `quiet($, work, where)`,
which runs an engine call whose failure must not break a turn or a timer, logging the failure to
the debug log.

## Module map

| Folder or file | What it does |
| --- | --- |
| `hooks/register.tsx` | Every hook, each matcher written inline. Nothing else. |
| `src/hooks/` | The hook bodies: the session's events (`session.ts`), the `/crew` command (`commands.ts`), the crew's tools (`tools.ts`), every tool call watched (`watch.ts`), turn starts and ends (`turns.ts`), the system prompt and the user's messages (`prompt.ts`). |
| `src/crew/` | The crew itself: the worker list and its statuses (`workers.ts`), `delegate` (`delegate.ts`), the spawn hook (`spawn.ts`), the send hook (`sends.ts`), relays (`relay.ts`), takeovers and held tasks (`takeover.ts`), one way to send and record (`deliver.ts`), the sync with the engine's agents (`sync.ts`), the user's message to a worker (`message.ts`), what the pane and the rows are drawn from (`feed.ts`), and the roster's data (`roster.ts`). |
| `src/prompts/` | Every text a model reads: the orchestrator's brief and `[crew]` note (`orchestrator.ts`), the workers' preamble and the texts the crew sends them (`worker.ts`), the tool specs (`tools.ts`), the tool results and their parsers (`results.ts`), and the roster's text (`roster.ts`). |
| `src/progress/` | Progress, which no model reads: `tracker.ts` is the only module that records runs with the engine; `runs.ts`, `round.ts`, `plan.ts`, `phase.ts`, `check-in.ts` are pure; `text/` builds the status line, the team view, the cards and the placed rows. |
| `src/persona/` | Personalities (`vibes.ts`, the model prompt of each), the figure's lines (`lines.ts`, including the Haiku prompt), worker names (`names.ts`). |
| `src/settings/` | What the user changes: the look (`look.ts`), delegation and the `[crew]` note (`notes.ts`), Haiku's mood lines (`mood-lines.ts`). |
| `src/figure/` | The pictures: the catalog of parts and colours, the orchestrator's critter, the workers' diamonds, the animation of each state, rasterizing to cells or SVG, looks and share codes, accent colours, the 256-colour mapping. |
| `src/ui/pane/` | The pane: how it opens (`index.tsx`), its timer and repainting (`animation.ts`), its views (`main.tsx`, `editor.tsx`, `team.tsx`), the feed (`feed.tsx`), shared widgets. |
| `src/ui/transcript/` | The crew's rows in the conversation: bubbles for crew calls, worker reports and task notifications, and the placed rows. |
| `src/ui/labels.ts` | The words, marks and colours of each worker status and run end. |
| `src/usage/limits.ts` | The account's usage windows, and the usage probe. |
| `src/i18n/` | The UI's text in English and Spanish, and the locale. See [docs/i18n.md](docs/i18n.md). |
| `src/state/atoms.ts` | Every atom and its `readX`/`updateX` pair, and `STORE_KEYS`. |
| `src/config.ts` | The names the crew registers under, the pane's tick, and the limits the roster and the briefs share. |
| `src/util/` | Pure helpers: text fitting, time, paths (POSIX and Windows), base64, seeded random, bounded lists, tool-input reading. |
| `types/index.d.ts` | The state contract (`PluginState.crew`) and the domain types. |

## State and persistence

### Atoms (`$.state`, plugin `crew`)

A **shape tag** declines what an earlier version stored when a value's fields change
incompatibly; an added optional field keeps the tag. The key is what the state stored the atom
under, so it never changes even where the code name differs.

| Key | Code name | Tag | Holds |
| --- | --- | --- | --- |
| `look` | `look` | `look-3` | The orchestrator's look |
| `workers` | `workers` | `workers-2` | The crew: active workers and the 24 most recent free ones |
| `dropped` | `dropped` | `dropped-1` | The **shelf**: workers cleared or let go, up to 50 |
| `worktrees` | `worktrees` | `worktrees-1` | Ids of workers that work in a git worktree of their own |
| `parents` | `parents` | `parents-1` | Agents a worker started, with that worker's name and whether it is a fork |
| `messages` | `messages` | `messages-2` | The feed: who said what to whom, each line with `fromId`/`toId` (the person has a sentinel id) |
| `orch` | `orch` | `orch-1` | The orchestrator's mood, activity and since when |
| `view` | `view` | none | The pane's view: `main`, `edit` or `crew` |
| `tab` | `editTab` | none | The editor's tab |
| `lines` | `moodLines` | `lines-1` | Haiku's batch of mood lines and its signature |
| `isOn` | `isOn` | none | Delegation on or off |
| `brief` | `brief` | `brief-1` | The brief this load froze |
| `note` | `pendingNote` | `note-2` | The settings the next user message carries a `[crew]` note of, or null |
| `limits` | `limits` | `limits-1` | The engine's usage windows |
| `modelLimits` | `modelLimits` | `limits-1` | The probed model windows (Fable's) |
| `cast` | `members` | `cast-1` | Everyone the crew has had this session, so rows keep names and colours |
| `calls` | `calls` | `calls-1` | The main conversation's crew calls and the worker each reached |
| `routes` | `routes` | `routes-1` | Where workers' messages went, by the head of their text |
| `takeovers` | `takeovers` | `takeovers-1` | Woken agents, who they answer, and their held tasks |
| `relays` | `relays` | `relays-1` | Workers' messages to free teammates, waiting for the next tick |
| `jobs` | `jobs` | `jobs-1` | What each worker was last given: a task's title or a message's gist |
| `opened` | `opened` | `opened-1` | Crew rows a press opened whole |
| `model` | `mainModel` | `model-1` | The main session's model id |
| `runs` | `runs` | `runs-1` | Each worker's current or latest run |
| `round` | `round` | `round-1` | The current round |
| `checkins` | `checkins` | `checkins-1` | The rows placed in the conversation |
| `due` | `pendingRows` | `due-1` | Rows waiting for the main turn to end |
| `beat` | `paneTick` | none | A counter whose change redraws the pane |

Every `read`/`update` of an atom is in `src/state/atoms.ts`: the validator finds the state a hook
touches only in the file that declares the atom.

### Store (`STORE_KEYS`)

| Key | Holds |
| --- | --- |
| `look` | The user's look |
| `isOn` | Delegation on or off |
| `lines` | Haiku's batch of mood lines, signed `locale\|name\|vibe\|phrase` |
| `toldBy` | Per conversation (its session id), the settings its last `[crew]` note told, up to 100 |
| `progress` | The check-in interval in minutes, 0 for off |

### Share codes

`CREW1.` followed by the look's JSON in URL-safe base64 without padding
(`src/figure/share-code.ts`). Codes circulate outside the plugin, so old ones must keep
importing: the prefix, the `Look` field names and the catalog's part keys and colour positions
never change. An imported or stored look is normalized (`normalizeLook`): unknown fields are
dropped, missing or invalid ones take the default's value.

## Timers

| Timer | Period | What it does |
| --- | --- | --- |
| Pane tick (`tick`) | `TICK_MS`, 400 ms | Advances the figures' frame and blits each changed raster in place. Every 12 frames (4.8 s) redraws the pane for its ages, when it is mounted or shown as a page. Redraws when a nap or an end highlight is due. Sends due relays. Every 8 frames (3.2 s) syncs the crew with the engine's agent list and lifts takeovers; between those, lifts takeovers a turn end asked for. Every 25 frames (10 s) looks for a batch of mood lines to ask Haiku for. |
| Typing tick (`typeTick`) | 90 ms, 180 ms on Terminal.app | Types out the newest bubbles in the feed. |
| Progress tick (`progressTick`) | 1 s | Closes runs whose end was missed, writes the status line, brings the round's newest check-in up to date (`followCheckIn`, even while the main turn runs), places the rows that waited for the main turn, and places check-ins and the round's summary. |
| Usage probe (`probeUsage`) | At most every 3 min | Runs a headless `claude -p` for Fable's weekly window; started at session start, when the engine measures new windows, and when an app attaches; never with the `usageProbe` option `off`. |

## Main flows

### Delegating a task

1. The orchestrator calls `mcp__crew__delegate`. Calls in one response run one after another
   (`delegateInTurn`), so two never read the same crew and take the same name or worker. A
   worker's call is refused: it should fork itself with the Agent tool instead. Each call first
   lifts any takeover whose run ended (`release`); held tasks that did not arrive are reported
   at the end of its result.
2. `delegate` reads the input, resolves `repo` against the session's directory (Windows forms
   included) and refuses a `fork` type.
3. It picks the worker: the one named, else (without `fresh`) the most recent free worker that
   `delegate` started in that repository, of the same type and on the model asked for (the
   session's when none), that is not woken by another worker; else none.
4. A reused worker gets the task through `deliver`, a send from the main conversation, with a
   short reminder of how to report; held tasks that once missed it go first, in the same
   message. A worker woken by another worker gets nothing yet: the task is a **held task** on
   its takeover, and the result says so.
5. Without a worker, it takes a free name (skipping names on the shelf and those in `intended`),
   records the **intent**, and calls `$.agent.spawn`. A model asked for is passed only when it is
   not haiku. With none, the spawn hook gives the worker the session's model, as the alias the
   Agent tool takes (`modelAlias`: `claude-opus-5-5` is `opus`); an id that names no family sets
   none, and the agent's own definition decides.
6. If auto mode refuses the spawn with no verdict (it reviews only calls a model writes), the
   result tells the orchestrator to start the worker itself with the Agent tool; the spawn hook
   recognizes that agent by its name or task through `intended`.
7. The result names the worker and its address, and warns (`Heads-up: …`) when another worker
   is busy in the same repository.

### Spawning (every agent)

`onSpawn` (`agent.spawn`) puts every agent the session starts on the list: the crew's own, forks,
the Agent tool's and agents workers start. It prepends the crew's text to its prompt (the worker
preamble, a fork's shorter one, the git rules), records its parent (`fork of`, `started by`), runs
it where its parent runs or in its worktree (`isolated`), and sets its model. Only workers
`delegate` started (or handed to the orchestrator to start) are reused without being named; an
adopted agent has `asked: null`. A resumed agent's run starts afresh.

### Messages between agents

`onSend` (`session.send`) sees every send:

- The crew's own sends from the main conversation pass through.
- A message to a **busy** agent arrives at its next tool call, as the engine does it.
- A worker's message to a **free** teammate would wake that teammate working for the sender: the
  engine would keep the sender running until the teammate's run ends and hand it the report. So
  the crew answers the send as delivered, queues a **relay**, and the next tick sends it from the
  main conversation with a header naming the sender (`relayText`). The teammate's report then
  comes to the orchestrator, and the sender is free to end its turn.
- A worker's message to a free agent **of its own** goes as sent and wakes it for that worker: the
  crew records a **takeover** (the woken agent answers to that worker). What the orchestrator
  gives that agent meanwhile is held, and goes from the main conversation, numbered in order,
  once that run ends (`release`, at the tick after a worker's turn ends, at the next sync, or
  before a delegate). Held tasks whose send fails stay on the takeover with why (`missed`), and
  nothing tries again on its own: they go first with the next task the orchestrator gives that
  agent. The orchestrator hears of it in the next delegate result, in the roster, or else once
  in a `[crew]` note on the person's next message.

Every send is recorded after it goes (inside `quiet`): the feed line, both workers' last message,
the route a reply is matched by, the run the send starts, and a placed line for a message between
agents.

### A run's life

- A **run** opens when a worker starts working: its first turn, a task or a message that wakes it
  (`beginRun`). A reused worker's time starts again.
- Each tool call is counted (`noteCall`): the call count, the **phase** its tool says, and the
  last sign of life. A worker's plan comes from the progress tool (`setPlan`), or from its todo
  list (`noteTodos`) when it declared none.
- `turn.complete` ends the run (`endRun`) as done, failed or stopped, puts the report's first
  line in the feed, shows an end toast, and, for a worker whose report goes to another worker,
  queues an end line for the conversation. A run whose end never arrived is closed by the
  progress tick once the engine shows the worker not active and nothing happened for 5 s.
- A **round** runs from the first worker starting while none ran to the last one ending. While it
  lasts, a **check-in** is placed every interval (3 minutes by default) when something changed;
  when it closes, a **summary** is placed if two or more workers ran or it outlasted the
  interval. The newest check-in follows the round in place: its lines are read again from the
  runs into `shown`, written when a phase, step or run changes and for its times once a minute,
  and its row is drawn again because its render hook reads the list. The engine has no call to
  replace or remove a placed row; a row is redrawn when state its hook read changes, and a hook
  that passes draws nothing.
- Nothing is placed while the orchestrator's turn is streaming: rows wait in `due` and go when
  the turn ends.

### The brief and `[crew]` notes

At session start the brief is built and frozen (`freezeBrief`): it goes into the system prompt as
the `crew:orchestrator` section (`prompt.compose`) and into the `delegate` tool's description. A
changed section or tool description would rewrite the whole prompt cache, so neither changes for
the rest of the load. When the user changes delegation, the name or the personality, a note is
queued (`note`); it rides as context on the user's next message, and only the latest settings
are told. `toldBy` remembers, per conversation, what its last note said, so a resumed or cleared
conversation gets a note when the settings no longer match.

### Keeping in step with the engine

Every 3.2 s `syncCrew` reads `$.agent.list()`: statuses follow the engine's, unknown agents
started before the plugin loaded are adopted, and a shelved worker that works again comes back
with its history. The same pass lifts takeovers whose run ended.

## Rendering

- **The pane** (`ui.render`, component `Pane`, request id `crew`). It opens only when a surface is
  attached, and opens when one attaches. Its views are `main`, `edit` and `crew` (the team view).
  On the terminal the figures are `Raster`s of half-block cells, repainted in place by
  `$.ui.blit` on the pane tick without a render pass, and only when a frame changes something.
  The desktop app, the editors and the phone draw the figures as `Svg`; no blit reaches them, so
  the pane is redrawn every few seconds there (`pane.asPage`).
- **Bubbles in the conversation** (terminal only). `ToolUse` and `ToolResult` of `delegate`,
  `SendMessage` and `TaskStop` from the main conversation, and `UserMessage` for a worker's report
  or message and for task notifications, are drawn as bubbles in the worker's colour. Drawing
  only: the stored transcript and what any model reads stay the same. Anything the crew cannot
  place, and errors, keep the engine's drawing. In full-screen mode a cut bubble opens with a
  click on its `…`.
- **Placed rows** (`$.ui.place`, component `Placed`): check-ins, summaries, end lines and message
  lines. Display only: neither the model nor the transcript file reads them.
- **The status line** (`$.ui.status`) and **toasts** (`$.ui.toast`).

## Where the code depends on engine wording

These fail silently if Claude Code changes the text they read; each is a known limitation:

- The auto-mode refusal of a spawn with no verdict, matched by `UNREVIEWED` in
  `src/crew/delegate.ts`.
- The usage probe's control protocol: the `get_usage` request and its response
  (`src/usage/limits.ts`).
- Task notifications: their origin kind and statuses (`completed`, `failed`, `killed`) in
  `src/ui/transcript/bubble.ts` and `user-message.tsx`.
- Model ids, turned into the names people say and into the Agent tool's aliases
  (`src/model-label.ts`).

## Invariants

- **No progress reaches a model**, except the progress tool's reply and an active worker's step
  in the roster.
- **The brief is frozen per load**; later changes reach the model as one `[crew]` note with the
  next user message.
- **Text a model reads is English and pinned** by `tests/golden/model-text.ts`; a change there is
  deliberate and says why.
- **`delegate`'s description stays under 3950 characters** with the longest name and
  personality (Claude Code cuts at 4096).
- **Delegate calls in one response run one after another.**
- **A send is tried once**: a failure after it may have gone out answers undelivered.
- **A worker never waits inside its turn**: it ends the turn with what it waits for, and a
  message wakes it.
- **A worker's message to a free teammate is sent from the main conversation**, so the report
  comes to the orchestrator.
- **Rows are placed only while the main turn is not streaming.**
- **The feed tells people apart by id** (`fromId`/`toId`, `ORCH_ID` for the orchestrator, a
  sentinel for the person); names are for display.
- **The UI's text is read through `t()` at display time**, because the locale settles at session
  start, after the modules load.

## Forced by the tools

- The validator reads hook matchers only from the file that registers the hook, allows one hooks
  module per plugin, follows `$` across an import only into function declarations, and finds
  state only where the atom is declared. Hence `register.tsx` with inline matchers, function
  declarations for hook bodies, and every atom in `atoms.ts`.
- The crew's three tool matchers are patterns (`/^mcp__crew__delegate$/`…), so type-checking does
  not depend on which MCP tools the engine's generated list held at the last load.
- The runtime strips types only: no `enum`, no parameter properties.
- A module's `let` cannot be assigned from another module; shared mutable state lives in objects
  (`pane`, `probe`) or behind setters.
- `tsc` needs `.claude-plugin/types/`, which Claude Code writes when it loads the plugin and which
  is not committed (it is about 1 MB and lists the machine's MCP tools).

## Glossary

- **Orchestrator.** The main conversation's assistant, shown as the mascot. The user talks only
  to it. In the feed its id is `ORCH_ID` (`main`).
- **Worker.** An agent on the crew's list. Usually one `delegate` started, which the crew reuses;
  also an **adopted** agent (a fork, the Agent tool's, one started before the plugin loaded),
  which is shown but reused only when named.
- **Fork.** An agent started with the Agent tool's `subagent_type: "fork"`: it inherits its
  parent's conversation. A worker splits its task by forking; `delegate` never starts one.
- **Crew.** The orchestrator's workers, and the plugin's name.
- **Brief.** The orchestrator's instructions: the `crew:orchestrator` system prompt section and
  the `delegate` description, frozen per load.
- **Preamble.** What a worker reads ahead of its first task: how to report, the git rules, its
  teammates, the progress tool.
- **`[crew]` note.** Context attached to the user's next message when delegation, the name or the
  personality changed after the brief was frozen.
- **toldBy.** The store's record, per conversation, of what its last `[crew]` note said.
- **Intended (intent).** What `delegate` meant a new worker to be (where it works, its type, and
  its task when handed to the orchestrator to start), by address, until the spawn hook reads it.
- **Isolated.** An Agent call that asked for `isolation: "worktree"`: its agent works in its own
  worktree.
- **Run.** One stretch of a worker's work, from the turn, task or message that starts it to its
  turn's end. Its time, calls, phase and plan belong to it.
- **Phase.** What a run is busy with, read off its tool calls: thinking, reading, editing,
  running, testing, web, delegating, waiting.
- **Plan, step.** What a worker declared with the progress tool (`step 0 of N`, then each step as
  it starts), or read off its todo list.
- **Round.** The stretch from the first worker starting while none ran to the last one ending.
- **Check-in.** A row placed in the conversation every interval during a round, when something
  changed, with a line per worker. The newest follows the round in place; the earlier ones fold
  to a line of what they showed when placed.
- **Summary.** The row that closes a round: each worker, how it ended, its time, step and task.
- **Placed row.** A row the crew places in the conversation (`$.ui.place`): a check-in, a summary,
  an **end line** (a run whose report went to another worker) or a **message line** (a message
  between agents, its **note**). Display only.
- **Pending row (`due`).** A row waiting for the main turn to stop streaming.
- **Takeover (mark).** A worker woke an agent of its own with a message, so that run reports to
  the worker. The mark lasts until the run ends.
- **Held task.** A task the orchestrator gave a worker under a takeover. It waits, and goes from
  the main conversation once the run ends (**release**). One whose send fails stays, **missed**,
  and goes with the next task given to that worker.
- **Relay.** A worker's message to a free teammate, sent on from the main conversation at the
  next tick.
- **Route.** Where a worker's message went, by the head of its text, so a reply is matched.
- **Call.** A crew call of the main conversation (`delegate`, `SendMessage`, `TaskStop`) by its
  tool use id, and the worker it reached; the bubbles are drawn from it.
- **Job.** What a worker was last given: a task's title or a message's gist. End toasts and lines
  name it.
- **Cast (members).** Everyone the crew has had this session, kept so old rows keep their names
  and colours after the list lets a worker go.
- **Shelf (dropped).** Workers cleared from the list or let go by its size limit. They keep their
  names and history; one that works again comes back.
- **Nap.** A free worker dozes (`zZ`); it and a finished one (done, failed, stopped) leave the
  card row 5 s after their status changed, once their end stopped standing out, and stay in the
  crew. The orchestrator naps after 3 minutes with nothing to do.
- **Beat (`paneTick`).** A counter whose change redraws the pane.
- **Blit.** Repainting a raster's cells in place without a render pass.
- **Surface.** Where the session is shown: the terminal, the desktop app, an editor, the phone.
- **Feed.** The pane's list of messages; each line has a **tone** (`user`, `orch`, `worker`,
  `event`).
- **Card.** A worker's diamond, name and four-column line in the pane's row.
- **Look.** The orchestrator's appearance and identity: name, colour, phrase, personality and
  parts. Its field names are frozen.
- **Vibe (personality).** One of six ways the orchestrator talks: a prompt for the model (English)
  and a name and fixed lines in each UI language.
- **Mood, mood lines.** What the orchestrator's figure is doing (idle, thinking, working,
  delegating, happy, sleep), and the lines it says in each: the vibe's fixed ones plus a batch
  Haiku writes once per signature.
- **Share code.** `CREW1.` plus a look in base64, to pass a mascot to someone.
- **Usage windows, usage probe.** The account's rate-limit windows the pane shows, and the
  headless `claude -p` that fetches the one only `/usage` has.
- **Roster.** The `mcp__crew__roster` tool's answer: the crew as a model reads it.
