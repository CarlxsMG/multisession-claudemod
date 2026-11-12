# How crew works

This is the map a contributor needs before changing more than one file: how the plugin sits on
Claude Code's engine, what each folder does, what it stores, how the main flows run, and the
rules the code relies on. Words in **bold** on first use are defined in the [Glossary](#glossary).

## The engine model

crew is a Claude Code plugin with one **hooks module**, `hooks/register.tsx` (named by
`hooks/hooks.json`). Claude Code loads it and calls `register(on, options)`, where `options` holds
the plugin's `userConfig` values (`language`, `usageProbe`, `napAfter`, `compactAt`). Each
`on(event, matcher?, handler)` call adds a hook.

- **A hook** receives `$` (the engine: `$.state`, `$.store`, `$.ui`, `$.agent`, `$.session`,
  `$.clock`, `$.tool`, `$.command`, `$.settings`, `$.process`, `$.fs`, `$.env`), the event `e`,
  and, for the events that form a chain, `next`. Calling `next(e)` lets the engine (and the
  hooks after this one) do their part; what it returns is the engine's answer, which the hook
  may change or replace. A gating hook that answers without calling `next` decides the event
  (the crew's own tools answer their calls this way).
- **A hook that fails** (throws, overruns, answers a wrong shape) is skipped: what is beneath it
  runs in its place, or what its last `next` answered stands, so a render hook's row falls back to
  the engine's own drawing. A guard carries a **`.catch(handler)`**, which answers for it:
  `delegate` answers `DELEGATE_FAILED`, and a send that may already have gone out answers
  undelivered (`SEND_UNSURE`) rather than send twice. Each `ui.render` hook carries one that passes
  the event on, the same fallback answered rather than skipped, as the test kit requires of a
  drawing. `hooks/register.tsx` states the rule.
- **State** (`$.state`): typed **atoms**, declared in `src/state/atoms.ts` against the contract in
  `types/index.d.ts`. They hold the session's data and outlive a reload or an update of the
  plugin. A drawing that reads an atom is drawn again when the atom changes.
- **Store** (`$.store`): a few keys that outlive sessions and plugin versions: what the user
  chose and keeps.
- **Hook bodies** live in `src/`, as `function` declarations, so the validator can follow `$` into
  them and list the state each hook reads and writes.

`src/engine.ts` names the engine type the helpers take (`Engine`) and `quiet($, work, where)`,
which runs an engine call whose failure must not break a turn or a timer, logging the failure to
the debug log. Its `unrecognized` logs there an engine text the crew reads in no shape it knows
(see [Where the code depends on engine wording](#where-the-code-depends-on-engine-wording)).

## Module map

| Folder or file | What it does |
| --- | --- |
| `hooks/register.tsx` | Every hook, each matcher written inline. Nothing else. |
| `src/hooks/` | The hook bodies: the session's events (`session.ts`), the `/crew` command (`commands.ts`), the crew's tools (`tools.ts`), every tool call watched (`watch.ts`), turn starts and ends (`turns.ts`), the system prompt and the user's messages (`prompt.ts`), compaction (`compact.ts`). |
| `src/crew/` | The crew itself: the worker list and its statuses (`workers.ts`), `delegate` (`delegate.ts`), the crew's own agent type (`worker-type.ts`), what each worker's conversation holds (`context.ts`), the spawn hook (`spawn.ts`) and the name it puts ahead of an agent's title (`title.ts`) and of a worker's background shell or Monitor (`shell-title.ts`), the send hook (`sends.ts`), relays (`relay.ts`), takeovers and held tasks (`takeover.ts`), workers that end with no report or go quiet (`silence.ts`), tasks that wait for a run to end (`waiting.ts`), the worktree a worker makes for itself (`own-worktree.ts`), compactions the crew starts (`compaction.ts`), one way to send and record (`deliver.ts`), the sync with the engine's agents (`sync.ts`), the user's message to a worker (`message.ts`), what the pane and the rows are drawn from (`feed.ts`), the roster's data (`roster.ts`), and the files runs in flight have edited (`edits.ts`). |
| `src/guard/runaway.ts` | The guard on Bash and PowerShell calls: it refuses a command that would not end (`tail -f`, `watch`, a watch mode, an endless loop), the main session's and every worker's. |
| `src/prompts/` | Nearly every text a model reads ([docs/model-behavior.md](docs/model-behavior.md) lists them all): the orchestrator's brief and `[crew]` note (`orchestrator.ts`), the workers' preamble and the texts the crew sends them (`worker.ts`), the tool specs (`tools.ts`), the tool results and their parsers (`results.ts`), the roster's text (`roster.ts`), and what the `/crew` command answers (`commands.ts`). |
| `src/progress/` | Progress, which no model reads: `run-store.ts` is the only module that records runs with the engine, `calls.ts` holds tool calls for their next write, every other frame of the pane, `todos.ts` reads a plan off a todo list, `status.ts` pins the status line, `placed.ts` places the rows and keeps the check-in interval, and `tick.ts` is the progress tick; `runs.ts`, `round.ts`, `plan.ts`, `phase.ts`, `check-in.ts` are pure; `text/` builds the status line, the team view, the cards and the placed rows. |
| `src/background/` | The shells and Monitors agents leave running in the background: the pure rules of the registry and of when the crew stops one (`tasks.ts`), which process is a task's and which a stopped shell left behind on Windows (`orphans.ts`), and recording, pruning and stopping them with the engine (`sweep.ts`). |
| `src/persona/` | Personalities (`vibes.ts`, the model prompt of each), the figure's lines (`lines.ts`, including the Haiku prompt), worker names (`names.ts`). |
| `src/settings/` | What the user changes: the look (`look.ts`), delegation and the `[crew]` note (`notes.ts`), Haiku's mood lines (`mood-lines.ts`), the main session's model (`model.ts`). |
| `src/figure/` | The pictures: the catalog of parts and colours, the orchestrator's critter, the workers' diamonds, the animation of each state, rasterizing to cells or SVG, looks and share codes, accent colours, the 256-colour mapping. |
| `src/ui/pane/` | The pane: how it opens (`index.tsx`), its timer and repainting (`animation.ts`), its views (`main.tsx`, `editor.tsx`, `team.tsx`), the feed (`feed.tsx`), shared widgets. |
| `src/ui/transcript/` | The crew's rows in the conversation: bubbles or one-line cards for crew calls, worker reports and task notifications, and the placed rows. |
| `src/usage/limits.ts` | The account's usage windows, and the usage probe. |
| `src/i18n/` | The UI's text in English and Spanish, and the locale. See [docs/i18n.md](docs/i18n.md). |
| `src/state/atoms.ts` | Every atom and its `readX`/`updateX` pair, and `STORE_KEYS`. |
| `src/config.ts` | The names the crew shares with the engine, the pane's tick, and the limits the roster and the briefs share. |
| `src/words.ts` | The words, marks and colours of each worker status and run end. |
| `src/runtime.ts` | What one load keeps in memory beside the atoms, and `resetRuntime`. See [Runtime state](#runtime-state-srcruntimets). |
| `src/util/` | Pure helpers: text fitting, time, paths (POSIX and Windows), base64, seeded random, bounded lists, tool-input reading, a shell command's words (`shell.ts`). |
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
| `worktrees` | `worktrees` | `worktrees-1` | Ids of workers the engine started in a git worktree of their own; one that made its own carries `isApart` in `workers` |
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
| `calls` | `calls` | `calls-1` | The marks an earlier version of the plugin kept of the crew tools' calls: read for those, never written |
| `call` | `call` | `call-1` | A family, one value per tool_use_id: a crew tool's call seen, and the worker the main conversation's reached. Each row reads its own, so a mark draws again that row alone |
| `routes` | `routes` | `routes-1` | Where workers' messages went, by the head of their text |
| `takeovers` | `takeovers` | `takeovers-1` | Woken agents, who they answer, and their held tasks |
| `relays` | `relays` | `relays-1` | Workers' messages to free teammates, waiting for the next tick |
| `jobs` | `jobs` | `jobs-1` | What each worker was last given: a task's title or a message's gist |
| `reports` | `reports` | `reports-1` | The latest 24 workers' last reports, whole and with their line breaks, up to 8000 characters each: what the roster shows of one worker asked for alone |
| `opened` | `opened` | `opened-1` | Crew rows a press opened whole |
| `model` | `mainModel` | `model-1` | The main session's model id |
| `runs` | `runs` | `runs-1` | Each worker's current or latest run |
| `round` | `round` | `round-1` | The current round |
| `checkins` | `checkins` | `checkins-1` | The rows placed in the conversation |
| `shown` | `shown` | `shown-1` | A family, one value per check-in's id: what the round's newest check-in shows now, apart from the rows so a follow-up draws only that row again |
| `due` | `pendingRows` | `due-1` | Rows waiting for the main turn to end |
| `beat` | `paneTick` | none | A counter whose change redraws the pane |
| `listed` | `listed` | `listed-1` | The agents the engine has listed, up to 200 |
| `intents` | `intents` | `intents-1` | What delegate meant each new worker to be, until its spawn, up to 50 |
| `isolated` | `isolated` | `isolated-1` | Agent calls that asked for a worktree, until their spawn, up to 50 |
| `sendGists` | `sendGists` | `sendGists-1` | Each worker's last SendMessage: the head of its text and its summary, up to 100 |
| `taskLists` | `taskLists` | `taskLists-1` | Each worker's TaskCreate items in its run, up to 80 workers of 100 items |
| `noteFirst` | `noteFirst` | `noteFirst-1` | What each end-of-task row was first drawn with, up to 300 |
| `background` | `background` | `background-1` | Shells and Monitors left running in the background, whose each is, its process and when its owner's turn ended, up to 100 |
| `compactAsk` | `compaction` | `compactAsk-1` | The compaction the orchestrator or `compactAt` asked for, until a safe moment runs it, and when the crew last ran one |
| `waiting` | `waiting` | `waiting-1` | Tasks a delegate call's `after` holds until a worker's run ends, and those not given, until the orchestrator is told |
| `silences` | `silences` | `silences-1` | Workers no report will come from, and busy ones nothing was heard from for long, until the orchestrator is told |

The last five hold what a call under way leaves for the hooks that follow it, which a reload of
the plugin's code may come between: a spawn auto mode handed to the orchestrator, an Agent call
waiting for the person's yes.

Every `read`/`update` of an atom is in `src/state/atoms.ts`: the validator finds the state a hook
touches only in the file that declares the atom.

### Runtime state (`src/runtime.ts`)

What the hooks, the timers and the drawings of one load leave each other in memory, not worth a
write to `$.state`: the names Agent calls' agents were renamed to, the relay and release flags,
the names given, the agents the engine listed, the check-in interval, the status line, its
widths and the run times, the tool calls held for their next write, every other frame, the orchestrator's activity its
last tool call said, the files edited and the end-of-task rows' first drawings held for the next
frame (a drawing may not write the state), the usage probe's permission, time and backoff, when the limits were last drawn, the pane's
frame, the look it last showed, the view the terminal last drew, rasters and the redraws it owes
with the timer that waits for a nap, the last `[crew]` check, the mood lines asked for, and
the kinds of engine wording logged, what each agent's conversation held at its last response, the crew's agent type as the engine registered it, the workers told of another's edit of a file, and whether a compaction the crew started is under way, when the main turn last ended and the auto-compaction threshold as last read. It is one typed object
in parts, each read and written only by the module its comment names; another module goes
through that module's functions. It imports types only.

A reload reads afresh only the modules whose code changed, so `session.start` calls
`resetRuntime()` first: every part starts as a fresh load has it, whichever modules the reload
kept. A load starts with the relays due, so messages a reload caught on their way go at the
first tick. Kept across it (`carried`): the chains that order delegate calls and the calls'
writes, which work an earlier session started still holds its place in, and the count that keeps
placed rows' ids apart, as those rows outlive the load.

Outside it: what `register` takes from the plugin's options before the session starts (the
`language`, `usageProbe`, `napAfter` and `compactAt` choices), the locale and the 256-colour palette `session.start`
settles (read on every drawing, through `t()` and `onScreen`), and the colour-fitting memo of
`src/figure/color256.ts`, which gives the same answer in any session.

### Store (`STORE_KEYS`)

| Key | Holds |
| --- | --- |
| `look` | The user's look |
| `isOn` | Delegation on or off |
| `lines` | Haiku's batch of mood lines, signed `locale\|name\|vibe\|phrase` |
| `toldBy` | Per conversation (its session id), the settings its last `[crew]` note told, up to 100 |
| `progress` | The check-in interval in minutes, 0 for off |
| `crews` | Per conversation (its session id), the crew as it stood: the list and the shelf, parents, worktrees, takeovers with their held tasks, tasks waiting for a run, and the compaction asked for; the latest 10, each tagged `crew-1` |

The state ends with its process, so a conversation resumed after Claude Code restarts would find
no crew. `saveCrew` (`src/crew/persist.ts`, from the progress tick) writes the record after a
turn ended, the orchestrator's or a worker's, when it changed, at most every 10 s; between turns
the timer reads nothing, and a tool call alone writes nothing; `restoreCrew` reads it back at
`session.start` when the session has no crew and the store has a record under its id with the
tag this version writes. A worker that was busy comes back `stopped`, and the orchestrator is
told once (a `cut` silence); a held task whose run the restart ended is told as missed, not sent;
a task that waited for a stopped run is told as not given. Whether a message still reaches a
restored worker is the engine's to say: a send that fails says so as any other. Relays and
handoffs under way are not kept. A reload keeps the state, so nothing is read back over it.

### Share codes

`CREW1.` followed by the look's JSON in URL-safe base64 without padding
(`src/figure/share-code.ts`). Codes circulate outside the plugin, so old ones must keep
importing: the prefix, the `Look` field names and the catalog's part keys and colour positions
never change. An imported or stored look is normalized (`normalizeLook`): unknown fields are
dropped, missing or invalid ones take the default's value. A code with no field of a look in it
holds no look, and is turned down as a bad code.

## Timers

| Timer | Period | What it does |
| --- | --- | --- |
| Pane tick (`tick`) | `TICK_MS`, 400 ms | Advances the figures' frame and blits each changed raster in place. Every 12 frames (4.8 s) redraws the pane for its ages, when it is shown as a page or mounted on the terminal in a view other than the editor, whose figures move by blits alone. Every 2 frames writes the workers' tool calls held since the last write; every frame, what the orchestrator's last tool call said it does and what the end-of-task rows drawn since were first drawn with. Sends due relays. Runs a usage probe skipped while nothing showed the limits, once the main view is drawn again. Every 8 frames (3.2 s) syncs the crew with the engine's agent list and lifts takeovers; between those, lifts takeovers a turn end asked for. Every 25 frames (10 s) looks for a batch of mood lines to ask Haiku for. |
| Nap timer (`oweNap`) | Once, at `napDue` | The main view's drawing owes a redraw when the first worker it shows napping leaves the row or an end it shows stops standing out: one `$.clock.after` waits for that moment, kept while drawings owe the same one and replaced when they owe another. The pane's close and a session's start cancel it. |
| Typing tick (`typeTick`) | 150 ms, 250 ms on Terminal.app | Types out the newest bubbles in the feed. Runs only while one types: the drawing that shows it starts the timer, and the tick that draws it whole, the pane closing or a session's start stops it. |
| Progress tick (`progressTick`) | 1 s | Closes runs whose end was missed, writes the status line, brings the round's newest check-in up to date (`followCheckIn`, even while the main turn runs), places the rows that waited for the main turn, places check-ins and the round's summary, stops the background tasks of agents that are done (see Background tasks), and runs a compaction asked for once it is safe (see Compaction). |
| Usage probe (`probeUsage`) | At most every 3 min, backing off to 1 h | Runs a headless `claude -p` for Fable's weekly window; started at session start, when the engine measures new windows, and when an app attaches; never with the `usageProbe` option `off`. Each probe in a row that finds no model window doubles the wait for the next, up to 1 h; one that finds a window, or a measure whose window kinds differ from the last, sets it back to 3 min. While the pane's main view has not been drawn for 30 s nothing shows the limits, and no probe runs: the pane tick runs the one skipped once the main view is drawn again. A session's start counts as a drawing. |

## Main flows

### Delegating a task

1. The orchestrator calls `mcp__crew__delegate`. Calls in one response run one after another
   (`delegateInTurn`), so two never read the same crew and take the same name or worker. A
   worker's call is refused: it should fork itself with the Agent tool instead. Each call first
   lifts any takeover whose run ended (`release`); held tasks that did not arrive are reported
   at the end of its result. The tasks that waited for a run that ended go first too
   (`releaseWaiting`, from `delegateTool`), and the ones that could not be given are said last.
2. `delegate` reads the input, resolves `repo` against the session's directory (Windows forms
   included) and refuses a `fork` type.
3. It picks the worker: the one named, else (without `fresh`) the most recent free worker that
   `delegate` started in that repository, of the same type and on the model asked for (the
   session's when none) however its own call named that model, that is not woken by another
   worker, whose last turn ended within `REUSE_WARM_MIN` (4 minutes) and whose conversation holds
   no more than `REUSE_CONTEXT_MAX` (100k tokens); else none. Waking a
   worker sends its whole conversation again, and past the prompt cache's 5 minutes that is
   billed uncached, for a task that may have nothing to do with what it holds: a free worker
   idle longer is reused only when named, and the result names it. So is one that holds more
   than the ceiling: every request of a worker sends all it holds again, which a task that needs
   none of it pays at each. The result of an unnamed reuse says what the worker's context holds:
   its last task, when it finished, the tokens its turns used and how much it holds.
4. A reused worker gets the task through `deliver`, a send from the main conversation, with a
   short reminder of how to report and, when teammates are there that it was not told of (its
   `mates` hold the addresses it was), a line naming them; held tasks that once missed it go
   first, in the same message. An unnamed task that does not reach its free worker goes to the next one, up to
   `REUSE_TRIES`; a new worker starts only when none is reached, and the result names the ones
   that were not. A send that failed on its way (`SEND_UNSURE`) may have arrived, so it ends the
   call there: no other worker is given the task and none starts. A worker woken by another worker gets nothing yet: the task is a **held task** on
   its takeover, and the result says so.
5. Without a worker, it takes a free name (see Names below), records the **intent**, and calls `$.agent.spawn`. A model asked for is passed only when it is
   not haiku. With none, the spawn hook gives the worker the session's model, as the alias the
   Agent tool takes (`modelAlias`: `claude-opus-5-5` is `opus`); an id that names no family sets
   none, and the agent's own definition decides. So a haiku request gets the session's model,
   and workers run on haiku only in a session on haiku.
6. If auto mode refuses the spawn with no verdict (it reviews only calls a model writes), the
   result tells the orchestrator to start the worker itself with the Agent tool. The refusal is
   remembered (`runtime.handoffs`), so the next new workers are handed over without the spawn
   being tried, until the session starts again or the main conversation starts an agent out of
   auto mode (`noteSpawnMode`, from the spawn's `permissionMode`). The spawn hook
   recognizes that agent through `intents`: by its name, else, as the Agent tool may take none
   and the orchestrator may reword, by the worker's name ahead of the call's description (the
   handoff spells it "(Pip) Title", which tells several handoffs of one response apart), by its task, by its title, or as the only handoff of its
   type (`handoffFor`; two that fit alike are neither). It is the worker `delegate` named; its
   address is the name its call gave, else its id, as the engine lets no hook name a spawn. The
   intent keeps what the call
   asked (`handed`: title, model, the reason for a new worker, the call's id), so the worker is
   as one `delegate` started: it runs on the model `delegate` was asked whatever the Agent call
   names, `asked` records it, the delegate call's row names the worker, and the Agent call reads
   after its result the reason and the heads-up (`adoptHanded`). A handoff stands for the turn
   it was made in: an Agent call that starts nothing puts its intent back (`keepHandoff`), and
   when the main conversation's turn ends the ones not started are let go, name and intent
   (`lapseHandoffs`). Only the turn's end does that, as by then every Agent call of the turn has
   spawned.
7. The result names the worker and its address, and warns (`Heads-up: …`) when another worker
   is busy in the same repository, with the files each such worker's run has edited so far
   (`editsInFlight`), as seen from the repository: the latest four by name, the earlier ones
   counted, or that it has edited none yet.

### Spawning (every agent)

`onSpawn` (`agent.spawn`) puts every agent the session starts on the list: the crew's own, forks,
the Agent tool's and agents workers start. It prepends the crew's text to its prompt (the worker
preamble, a fork's shorter one, the git rules), records its parent (`fork of`, `started by`), runs
it where its parent runs or in its worktree (`isolated`), and sets its model. Only workers
`delegate` started (or handed to the orchestrator to start) are reused without being named; an
adopted agent has `asked: null`. A resumed agent's run starts afresh.

### The crew's agent type

At `session.start` the crew registers an agent type of its own with `$.agent.register`,
`crew:worker` (`WORKER_AGENT`, `src/prompts/worker.ts`): a general-purpose worker without
`mcp__crew__delegate` and `mcp__crew__compact`, the two tools a worker is refused and whose
descriptions it would otherwise carry in every request. A worker `delegate` starts with no type
asked, or asked `general-purpose`, is spawned as that type (`spawnTypeOf`,
`src/crew/worker-type.ts`); the spawn hook states it again from the intent, as the engine may not
carry a spawn's type through.

- An agent type's prompt stands where the engine's own text for a general-purpose agent would
  (who it is, how to search, when to create a file, not to hand the task on), so `WORKER_ROLE`
  says that in the crew's words. What the engine adds to every agent comes after it as before: its
  notes, the environment, the skills and the tool list.
- To the orchestrator and to the crew the worker stays general-purpose: its `type` is the one
  asked, which a reuse compares, the roster leaves unsaid and a named call notes. Only the spawn
  names the crew's type.
- The model is offered the type like any other, with a description that says `delegate` starts
  it: the engine asks `agent.offer` before it resumes an agent that ended too, so a type kept
  from the model is one whose finished workers no message wakes. A worker handed to the
  orchestrator to start in auto mode is still the general-purpose agent its handoff names, with
  every tool.
- An engine that refuses the registration leaves the workers general-purpose agents.
- The type sets neither `maxTurns` nor `autoCompactWindow`: a run that meets its turn limit is cut
  with no report, and a task of a few hundred requests is an honest one.

### Worktrees and the main branch

The orchestrator and the worker read one story. A worker that edits commits in a git worktree and
branch of its own, `git worktree add ../<repo>-<name> -b crew/<name>-<topic>`, unless its task
names the branch, its base or the path, or says the user allowed the main branch (`gitRules`,
`src/prompts/worker.ts`). The orchestrator's git rule says what the worker does by default and
that a branch name or the user's go-ahead goes in the brief (`DELEGATION_RULES`), and the `task`
argument lists it among what a brief holds. `delegate` has no argument for a worktree: the rules
point at the worker's own, not at the Agent tool's `isolation`.

A worker edits apart from the repository it is listed in when it has a worktree of its own, and
the crew learns of one in two ways:

- An agent the Agent tool started with `isolation: "worktree"` is in the `worktrees` atom from its
  spawn: the engine made the worktree and starts the agent, and the agents it starts, there.
- A worker that makes one for itself is marked `isApart` on the list. The engine knows nothing of
  that worktree, so `watchCall` reads a worker's Bash and PowerShell calls: one that ran without an
  error and holds `git worktree add` (`addsWorktree`, `src/crew/own-worktree.ts`) marks it.

`apartIds` (`src/crew/workers.ts`) joins the two, and everything that asks whether a worker is in
the repository reads it: the roster's row says `worktree of`, a delegate result says `in a
worktree of` and names such a worker in no heads-up, and a teammate's preamble says `own worktree
of`. Only the engine's worktree is where a worker's own agents start, so only it makes their
preamble say so (`shared` in `briefFor`).

The mark stays for the worker's life: the crew cannot tell a worker that went back to the
repository from one still in its worktree. What it does not see: a path in quotes with a space in
it, and an `add` that failed inside a command that ended well. A wrong mark hides only the
worker's name in a heads-up; two workers that edit one file are still told so, by the file's path.

### What a worker's conversation holds

`turn.complete` gives a turn's usage summed over its requests: what the turn cost, not how large
the conversation is. So the crew reads it off each response: `noteStep` (`src/crew/context.ts`) is
a hook on `turn.step`, the model's response as it streams, the main conversation's and every
agent's. It passes the stream on untouched (`yield* next(e)`) and, when the response of an agent
ends, keeps the sum of its usage (input, cache read, cache write and output: what the next
request sends again) in memory. Nothing is written per request; when the worker's turn ends,
`onTurnComplete` keeps the figure on the worker (`context`). The roster shows it (`context ~38k`),
an unnamed reuse reads it for the ceiling, and its result says it.

A response of 1000 output tokens passes as about 130 chunks. Measured on Claude Code 2.1.322
with a hook that only counted and passed on, three runs each way: the requests took 5.4 to 5.7 s
with the hook and 6.1 to 10.6 s without, so nothing the hook adds shows against the model's own
variation.

### Names

A worker's name is 2 to 4 characters, so a card's four columns hold it whole, and no two members
of the session share one: `claimName` (`src/crew/workers.ts`) skips every name and address of the
list, the shelf and the cast, and every name given in this load. It holds that name from the
moment it gives it, so two spawns of one response, which both read the list before either worker
is on it, never take the same one. A worker cleared from the list keeps its name: the engine
still knows it by it, a message wakes it with its history, and the rows still show it.

New workers take the next name of the pool (`src/persona/names.ts`), then a letter and a number
(`A1` … `Z999`). A name an Agent call gives is kept when it fits and is free; otherwise the agent
takes the next name, the call's name stays its address unless another member has it (then its id
is), and the call reads the name and the address after its result (`renamedAgent`). Delegate's
own spawns, and one it handed to the orchestrator to start, keep the name delegate gave.

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
  in a `[crew]` note on the person's next message. A missed task leaves its mark when the
  orchestrator gives it to another worker word for word (`letGoElsewhere`), and all of them do
  when the next send to that agent fails for the same reason and the engine lists it no more:
  the result names them by title. A mark left with no task goes.

Every send is recorded after it goes (inside `quiet`): the feed line, both workers' last message,
the route a reply is matched by, the run the send starts, and a placed line for a message between
agents.

### A run's life

- A **run** opens when a worker starts working: its first turn, a task or a message that wakes it
  (`beginRun`). A reused worker's time starts again.
- Each tool call is counted (`noteCall`): the call count, what the worker does, the **phase** its
  tool says, and the last sign of life. A call that sets the worker working shows at once; the
  rest are held (`src/progress/calls.ts`) and written every other frame of the pane, in one write of
  the workers and one of the runs: the pane draws both, so a write per call would draw it whole
  for each call. `endRun` writes them first, so a run ends with all its calls. A worker's plan comes from the progress tool (`setPlan`), or from its todo
  list (`noteTodos`) when it declared none.
- The file a call of an editing tool changes (`Edit`, `MultiEdit`, `Write`, `NotebookEdit`) is
  kept on the run once the call has run (`holdEdit`, written with the frame's calls into
  `Run.edited`): each file once, in the order first edited, the latest 40. A file changed through
  the shell is not seen. When a worker edits a file that another worker's run in flight has
  edited, it reads after its own edit's result who that worker is, and to settle the file with
  it (`overlapNote`, `src/crew/edits.ts`): once for each worker, other worker and file of a load.
  Nothing is refused: two workers may be meant to change one file in turn. Paths are compared
  whole, so workers in different worktrees of one repository never overlap.
- `turn.complete` ends the run (`endRun`) as done, failed or stopped, puts the report's first
  line in the feed, shows an end toast, and, for a worker whose report goes to another worker,
  queues an end line for the conversation. A run whose end never arrived is closed by the
  progress tick once the worker is not busy and nothing happened for 5 s: the engine shows it
  ended, or no longer lists it (see below).
- A **round** runs from the first worker starting while none ran to the last one ending. While it
  lasts, a **check-in** is placed every interval (3 minutes by default) when something changed;
  when it closes, a **summary** is placed if two or more workers ran or it outlasted the
  interval. The newest check-in follows the round in place: its lines are read again from the
  runs into its member of the `shown` family, written when a phase, step, run or what a worker
  does changes and for its times once a minute. Only the newest check-in's render hook reads that
  member, so a follow-up draws that row again and none of the others, which read the list alone. The engine has no call to
  replace or remove a placed row; a row is redrawn when state its hook read changes, and a hook
  that passes draws nothing.
- Nothing is placed while the orchestrator's turn is streaming: rows wait in `due` and go when
  the turn ends.

### Background tasks

A Bash or PowerShell call the engine answers with a `backgroundTaskId`, and a Monitor call with a
`taskId`, is recorded in `background` with the agent whose call it was (none for the main
conversation's) as the call is answered (`watchCall`). A shell the engine ends with its caller's
final response (`backgroundEndsWithFinalResponse`) is not recorded. An entry goes when a TaskStop
for it succeeds, the model's or the crew's, and when a Stop or SubagentStop's
`background_tasks`, the session's work in flight, lacks it (unless it is under 5 s old).

When an agent's turn ends (`turn.complete`) its tasks are marked; the progress tick stops a
marked task at once, or, when the engine says the agent waits for it (`backgroundWakesOwner`),
once it has run 10 minutes past that end. A turn start unmarks them. Before such a stop the crew
asks `$.tool.check`: a TaskStop the rules would ask the person for is not called, so no dialog
opens on its own; the entry stays, marked failed, and a toast says to press Stop. A failed or
refused stop is not tried again on its own. The main conversation's tasks are never stopped on
their own. At `session.end` every agent's task is stopped, quietly. The team view lists them all
with a Stop each, which calls TaskStop as the person (the dialog may ask them), and the main view
shows how many there are beside the crew's count, a press away from that list. The crew's own
TaskStop calls pass `watchCall` as nobody's activity (`next.origin`).

A second and a half after a task is recorded, while it is still listed, the crew reads the
process table (PowerShell's on Windows, `ps -A -o pid=,ppid=,lstart=,args=` in the C locale
elsewhere) and puts on its entry the id of its root process (`rootOf`): of the processes started
no earlier than the task and running its command (`matchesCommand`, below), none of Claude Code's
nor one another entry has, the one whose parent is none of them. The team view shows it
(`pid 51452`). The engine gives no id of its own; a table that cannot be read, or holds no such
process, leaves the entry without one.

On Windows (`OS` is `Windows_NT`) TaskStop ends the task's shell but not what it started, which
runs on with no parent. So around every successful TaskStop of a recorded task, the crew's own
(but at the session's end) and the model's alike (`beforeTaskStop` in `watchCall`, the main
session's included), the crew reads the process table (`Get-CimInstance Win32_Process` through
PowerShell, 8 s at most) before the call, and looks again 1, 3 and 8 seconds after it, without
holding up the tick or the call, until none of the task's processes runs. At each look it ends
with `taskkill /T /F` each of the task's processes that has no parent (its id is gone or names a
younger process). The task's processes started no earlier than the task (5 s of slack; a shell
backgrounded at its timeout started that long before its call was answered) and either run its
command (`matchesCommand`: the first four words of each simple command, up to a quoted or expanded
one, in order, paths to their names, `npm` for `npm-cli.js`) or sat under a process that did in the
table before the stop, when that one was read. A command line naming `claude` is never ended. What
ends is logged to the debug log; what does not, and a table no look could read, said in a toast.

Each look spawns PowerShell and takes about a second, so looks are shared (`tableSince`). The
table before a stop is the look under way, or one that started under 1.5 s ago, when there is one:
any table read before the stop shows what ran then. A sweep of the progress tick reads one before
its first stop and takes it for the table before each of its stops, which go one after another. A
look after a stop, and the look for a task's process, take only a look that started then or
later. A look that could not be read is not shared once it ends.

### The brief and `[crew]` notes

At the process's first session start the brief is built and frozen (`freezeBrief`): it goes into
the system prompt as the `crew:orchestrator` section (`prompt.compose`). A changed section would
rewrite the prompt cache from there on, so it does not change for the rest of the process: a
reload, an enable or a worker respawn starts the session again and finds the brief in its atom
(the host keeps atoms across them). The delegation rules (`DELEGATION_RULES`) are in the
`delegate` tool's description and nowhere else: policy plugins can keep out a system section but
not a tool description, and a rule in both places would be read twice in every request. The
description holds no name, persona or mode, only constant text, so the tool list at the head of
the cache is the same in every session and for every user's settings. The section says who the
orchestrator is, its persona and whether delegation was on, and points at the description for
how to delegate. When the
user changes delegation, the name or the personality, a note is
queued (`note`); it rides as context on the user's next message, and only the latest settings
are told. `toldBy` remembers, per conversation, what its last note said, so a resumed or cleared
conversation gets a note when the settings no longer match.

### Compaction

Every compaction of the main conversation (`/compact`, the engine's threshold, a plugin's) passes
`onCompact` (`session.compact`), which adds the crew's instructions after the person's own while
delegation is on or the crew has workers: what coordinating the crew needs kept, and what to leave
out. A crew worker's own compaction (`agentId` one of the crew's) gets the worker's. The crew never
skips a compaction: an automatic one runs because the context is full.

The summary is followed by the crew's state through `prompt.context` (`crewContext`), not a message
added to the compacted list: the engine asks for the context again after a compaction and sends a
block of a plugin's own where the conversation holds none, placed where it never splits a tool call
from its result. The block is the roster's text as it stands at that request, with a line saying it
goes stale; an empty crew adds none.

The orchestrator asks for a compaction with `mcp__crew__compact` (`focus`, `after`), and the
`compactAt` option asks for one when the context reaches that share of the auto-compaction
threshold (read with `$.session.usage({ breakdown: 'summary' })` once a minute; the fill itself is
free to read). Both are read only within the window and gap below, as no ask runs outside them and
the fill changes only with a main response. A turn cannot compact itself, so the ask waits in `compactAsk`, and the progress tick
runs it (`compactWhenSafe`) while the main turn is not under way, no worker is busy, no row is due
and no takeover's run is under way (one whose tasks missed their worker holds nothing back) nor a task waiting for a run to end; `after: "reports"` also waits for the round to close and for a main turn
since the last run ended. It also runs only within 4 minutes of the main turn's end
(`COMPACT_WARM_MIN`): the summary request reads the whole transcript again, and past the prompt
cache's 5 minutes it is billed uncached, so an ask that misses the window stays queued until the
tick after the next main turn ends. The crew starts at most one every 10 minutes (`COMPACT_GAP_MIN`)
and does not wait for it: one a turn that began refuses stays queued for the next safe moment; one that
stands or is skipped clears its ask, with a toast.

### Keeping in step with the engine

Every 3.2 s `syncCrew` reads `$.agent.list()`: statuses follow the engine's, unknown agents
started before the plugin loaded are adopted, and a shelved worker that works again comes back
with its history. The same pass lifts takeovers whose run ended. One runs at a time: a call
while one is under way, the timer's or the roster's, waits for that one. `STATUS_OF`
(`src/crew/workers.ts`) maps every status the engine's types name, so one they add fails `tsc`;
a status an engine newer than those types reports changes nothing the crew knows: a worker keeps
its status, a shelved one stays on the shelf, and an unknown agent waits for one the crew reads.

The engine ends an agent a while after its last `turn.complete` (seconds, or until background
work it owns is over) and then drops it from the list. So the list never sets a worker the crew
saw finish back to busy: a status read in that gap would outlive the agent. What does wake a
finished worker (a message, a resume, a turn's start, a tool call) has a hook. A busy worker
the engine lists no more, with nothing heard from it for a minute (`GONE_MS`), takes its run's
end, or `stopped` when that end never reached the crew and the engine had listed it. Which agents
it listed is an atom: the engine may drop one around a reload, where no sync of the next load sees it.

No report comes from a worker ended that way, and none from one that is stuck, so the orchestrator,
which is told not to poll, would wait for good. The sync notes both as a **silence**
(`src/crew/silence.ts`): `gone`, a busy worker it just ended with no end of its run heard, and
`quiet`, a busy worker with no tool call, turn or message for `QUIET_MIN` (10 minutes), unless it
has a busy agent of its own to wait for; it looks for those every 30 s at most. Each is said once, at the end of the next delegate or
roster result of the main conversation or in a `[crew]` note on the person's next message, and a
toast says it at once. A quiet worker heard from again is forgotten, so its next quiet spell is
told anew. A worker's own calls are told nothing.

## Rendering

- **The pane** (`ui.render`, component `Pane`, request id `crew`). It opens only when a surface is
  attached, and opens when one attaches. Its views are `main`, `edit` and `crew` (the team view).
  On the terminal the figures are `Raster`s of half-block cells, repainted in place by
  `$.ui.blit` on the pane tick without a render pass, and only when a frame changes something.
  The desktop app, the editors and the phone draw the figures as `Svg`; no blit reaches them, so
  the pane is redrawn every few seconds there (`pane.asPage`).
- **Rows in the conversation.** `ToolUse` and `ToolResult` of `delegate`, `SendMessage` and
  `TaskStop` from the main conversation, and `UserMessage` for a worker's report or message and
  for task notifications. Each surface draws them its own way, and `callRow` (`tool-use.tsx`) and
  `saidRow` (`user-message.tsx`) work out what they say for all of them: who to whom, title, foot,
  how it ended and in whose colour. Drawing only: the stored transcript and what any model reads
  stay the same. Anything the crew cannot place, and errors, keep the engine's drawing.
  - `terminal`: bubbles in the worker's colour. In full-screen mode a cut bubble opens with a
    click on its `…`.
  - `desktop` and `vscode`: one-line cards (`card.tsx`, `crewCard`). A worker's figure as `Svg`, its
    pose frozen at the row's end, beside the line (`cardLine`), and a `Button` of its own, `▸`, where
    the line does not hold the whole text: a press shows it under the line as `Markdown` and is kept
    in `opened`, as a bubble's is. The figure stands apart because a `Button` holds only text. A
    card ignores `isExpanded`: on a surface with no ctrl+o the engine may set it on every row. A
    crew call's `ToolResult` is blank there as on the terminal, its words being in the card.
  - `mobile`: the engine's rows, with no hook, as on the narrow screen the pane is a page of its own.
    A surface under any other name is not selected by the matchers either, and keeps them too. The
    engine names only these four: an editor that reports `vscode` gets the cards, and one that runs
    Claude Code in its own terminal (JetBrains IDEs do) is `terminal`.
  A row the atoms know nothing of, as in a conversation resumed after Claude Code restarted, is
  drawn from what the row carries (`recover.ts`): the worker's name and address from the call's
  input or result, or the name a message's sender has; its colour where the row gives the
  agent's id, the plain one (`PLAIN`) where not; no title or time the row does not hold. So
  that no row of this session is read that way, `call` marks every delegate of the main
  conversation and every SendMessage and TaskStop the session sees, a worker's own and one that
  reached no one of the crew with no worker.
- **Placed rows** (`$.ui.place`, component `Placed`): check-ins, summaries, end lines and message
  lines. Display only: neither the model nor the transcript file reads them.
- **The status line** (`$.ui.status`) and **toasts** (`$.ui.toast`).

## Where the code depends on engine wording

These read text or answers whose shape Claude Code may change; each is a known limitation. What
reads one falls back when it comes in no shape the crew knows, and nothing breaks, so the change
is noticed in the debug log: `unrecognized($, kind, detail)` (`src/engine.ts`) writes
`crew: unrecognized <kind>: <what came>` there, once a load for each kind.
`tests/engine-wording.test.tsx` pins the shapes the crew reads and that an unknown one logs once.

- The auto-mode refusal of a spawn with no verdict, matched by `UNREVIEWED` in
  `src/crew/delegate.ts`: the engine gives a refusal as text alone. Any other refusal in auto
  mode's words, which may be that one worded anew, is passed on as it came and logged
  (`auto-mode spawn refusal`).
- The usage probe's control protocol: the `get_usage` request and its response
  (`src/usage/limits.ts`). An answer missing, not JSON, without `rate_limits`, with
  `rate_limits` lacking `model_scoped`, or with a window lacking `display_name` or `utilization`,
  is logged (`usage probe answer`); Fable's window is then left out.
- Task notifications: their origin kind and statuses (`completed`, `failed`, `killed`) in
  `src/ui/transcript/bubble.ts` and `user-message.tsx`, both fields of the `UserMessage` row.
  A worker's end with another status shows the word as it came and is logged
  (`task notification status`); a row that carries a task under another origin kind keeps the
  engine's drawing and is logged (`task notification origin`).
- TaskStop's error for a task already over (`isGone` in `src/background/tasks.ts`), which forgets
  the entry; any other error keeps it, says so in a toast and is logged (`TaskStop error`).
- What tells a worker's rows apart where the atoms know none (`src/ui/transcript/recover.ts`):
  a subagent's notification opening `Agent "`, TaskStop's `task_type` `local_agent`,
  SendMessage's `resumedAgentId`, and a subagent's message from the name it was started with.
  A row in no such shape may be no worker's (a shell's end, another session's message), so it
  keeps the engine's drawing and logs nothing.
- Model ids, turned into the names people say and into the Agent tool's aliases
  (`src/model-label.ts`). These degrade on their own and log nothing: `modelLabel` shows an
  unknown id as it is, and `modelAlias` gives it no alias, so the Agent call names no model.

## Invariants

- **No progress reaches a model**, except the progress tool's reply and an active worker's step
  in the roster. The files a run in flight has edited are not progress but what is taken: a
  delegate result's heads-up names them, and a worker reads of another's edit of a file it edits.
- **The brief is frozen per process**, reloads included; later changes reach the model as one `[crew]` note with the
  next user message.
- **Text a model reads is English and pinned** by `tests/golden/model-text.ts`; a change there is
  deliberate and says why.
- **`delegate`'s description holds no setting** and stays under 3950 characters (Claude Code
  cuts at 4096).
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
- **A text builder is told, it does not choose**: `src/prompts/` reads no worker's status and
  `src/util/` no locale; their callers pass in the mates, whether a worker is busy, and the words.

## Forced by the tools

- The validator reads hook matchers only from the file that registers the hook, allows one hooks
  module per plugin, follows `$` across an import only into function declarations, and finds
  state only where the atom is declared. Hence `register.tsx` with inline matchers, function
  declarations for hook bodies, and every atom in `atoms.ts`.
- The crew's three tool matchers are patterns (`/^mcp__crew__delegate$/`…), so type-checking does
  not depend on which MCP tools the engine's generated list held at the last load.
- The runtime strips types only: no `enum`, no parameter properties.
- A module's `let` cannot be assigned from another module; a load's runtime state lives in the
  parts of `runtime` (`src/runtime.ts`), each written by one module, which others reach through
  its functions.
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
- **Brief.** Who the orchestrator is: the `crew:orchestrator` system prompt section, frozen per
  process. How it delegates is in the `delegate` tool's description, which the brief points at.
- **Preamble.** What a worker reads ahead of its first task: how to report, the git rules, its
  teammates, the progress tool.
- **`[crew]` note.** Context attached to the user's next message when delegation, the name or the
  personality changed after the brief was frozen.
- **toldBy.** The store's record, per conversation, of what its last `[crew]` note said.
- **Intended (intent).** What `delegate` meant a new worker to be (where it works, its type, and
  its task and what its call asked when handed to the orchestrator to start), by address, until the spawn hook reads it.
- **Isolated.** An Agent call that asked for `isolation: "worktree"`: its agent works in its own
  worktree.
- **Apart.** A worker that edits in a git worktree of its own, the engine's or one it made, and so
  is not busy in the repository it is listed in.
- **Run.** One stretch of a worker's work, from the turn, task or message that starts it to its
  turn's end. Its time, calls, phase and plan belong to it.
- **Phase.** What a run is busy with, read off its tool calls: thinking, reading, editing,
  running, testing, web, delegating, waiting.
- **Plan, step.** What a worker declared with the progress tool (each step of N as it starts; the
  first call sets the plan, and a call at step 0 that only declares it is still taken), or read
  off its todo list.
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
  and goes with the next task given to that worker, unless it is given to another word for word
  or that worker cannot be reached again.
- **Waiting task.** A task a delegate call gave with `after`, the name of a busy worker: it is
  kept in `waiting` and given from the main conversation when that worker's run ends
  (`releaseWaiting`, `src/crew/waiting.ts`: at the tick after the turn's end, at the next sync,
  or before a delegate), to that worker, to the one the call named, or to a new one
  (`startBehind`). A new worker starts only from a hook of the main conversation, when its next
  turn starts (which the run's report opens) or at its next delegate call: a spawn made from the
  timer goes past the crew's own `agent.spawn` hook, and its agent would have no brief. Several for one worker go together, in order; one whose own worker is busy
  then waits for that worker's run instead. When the run it waited for failed or was stopped,
  its worker is not reached, or no worker can start (auto mode has no turn to hand it over in),
  it is not given: it stays only until the orchestrator is told, in a delegate result or a
  `[crew]` note on the person's next message, and nothing tries again. A queued compaction waits
  while one is held.
- **Relay.** A worker's message to a free teammate, sent on from the main conversation at the
  next tick.
- **Route.** Where a worker's message went, by the head of its text, so a reply is matched.
- **Call.** A crew call of the main conversation (`delegate`, `SendMessage`, `TaskStop`) by its
  tool use id, and the worker it reached (`call`, one value per call); the bubbles are drawn from it.
- **Job.** What a worker was last given: a task's title or a message's gist. End toasts and lines
  name it.
- **Cast (members).** Everyone the crew has had this session, kept so old rows keep their names
  and colours after the list lets a worker go.
- **Shelf (dropped).** Workers cleared from the list or let go by its size limit. They keep their
  names and history; one that works again, or that a delegate call names, comes back, and the
  roster shows one asked for by name.
- **Nap.** A free worker dozes (`zZ`); it and a finished one (done, failed, stopped) leave the
  card row the `napAfter` option's time after their status changed (5 s by default, never with
  `never`), once their end stopped standing out, and stay in the crew. The orchestrator naps after 3 minutes with nothing to do.
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
