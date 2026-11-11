# Changelog

All notable changes to crew are written here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The orchestrator can compact its own conversation at a good moment with `mcp__crew__compact`:
  before a new phase, or once a batch of reports is told to you. It runs between turns once no
  worker is busy, at most once every 10 minutes, and a toast says when it ran. The `compactAt`
  option (`off`, `70%`, `85%`) has the crew queue one on its own as the context fills, ahead of
  Claude Code's automatic compaction.
- Compacting the orchestrator's conversation keeps what coordinating the crew needs: the summary
  is asked to keep each worker's name, address and what it owns, tasks in flight, your decisions,
  branches, pull requests and issues, and to leave out file dumps and superseded reports, after
  any instructions you typed after `/compact`. The crew's roster follows the summary, and a
  worker's own compaction keeps its task, its branch and its teammates' addresses.
- Claude Code's own list of running agents shows each crew agent's name ahead of its task,
  `(Mika) Fix the tests`, so the workers there can be told apart as in the pane.
- A worker's background shells and Monitors show its name ahead of their description in that
  list too, `(Mika) Start the dev server`; the main conversation's and foreground shells keep theirs.
- The crew keeps track of the shells and Monitors agents leave running in the background, which
  slow Claude Code down, and stops a worker's once its turn ends (one the worker waits for after
  10 minutes) and at the end of the session. The team view lists them with a Stop each, and the
  main view says how many there are. The main conversation's are listed, never stopped on their
  own; a stop that would need your approval is left for your press, with a toast saying so.
- The team view's list of background tasks shows each task's process id (`pid 51452`), read
  from the process table a moment after the task starts.

### Changed

- The pane's feed shows the newest message first, so what just happened is at the top without
  scrolling; when not every message fits, the oldest are the ones left out.
- A worker started as `Explore` or `Plan`, which edit nothing, no longer reads how to commit, write
  comments or fork itself: about 1100 characters less at its start. Every other type, a
  project's own agents included, reads the whole preamble as before.
- The crew keeps a worker's last report whole, with its line breaks and up to 8000 characters,
  where it kept 1200 on one line, and `mcp__crew__roster` shows it so for one worker asked for
  alone. After a compaction the orchestrator can read a long report again, a list of files or of
  check results included, without waking the worker that wrote it. The roster's list is as short
  as before.
- A worker given a new task is told, in one line, of the teammates that joined since it was last
  told who is there, so it can message them without looking at the roster or asking the
  orchestrator. Nothing is added when nobody is new.
- A worker with a plan of three steps or more calls the progress tool as each step starts, from
  step 1; the call that only declared the plan, step 0, is no longer asked of it, which saves a
  request per task. A plan declared at step 0 still works.
- A delegation that names no worker reuses a free one only if it finished a task in the last 4
  minutes, while its conversation is still in the prompt cache: waking one idle longer sends its
  whole conversation again uncached, for a task that may have nothing to do with it. Such a worker
  is passed over and named in the result, and still takes a task when the orchestrator names it.
  The result of an unnamed reuse says what the worker holds (its last task, when it finished, the
  tokens it used), and the roster says when each free worker finished.

### Fixed

- In the desktop app the editor's palettes show their coloured cells, its steppers their ◀ ▶
  and its tabs the `▸` on the one open, and the pane's Delegate switch and Edit button read as on
  the terminal, instead of each showing the words meant for a screen reader (`Color: Cream`).
- On Windows a background task the crew stops no longer leaves what its shell started running,
  such as `timeout.exe` or a dev server's node: the processes it left with no parent, started
  after it and running its command, are ended too.
- On Windows what a stopped background shell left running is ended after a stop of yours or
  Claude's too, not only the crew's own; the crew looks again for a few seconds while the shell
  is still going away, matches a command that runs a quoted script, and says in a toast when it
  cannot read the process table.
- In the desktop app a card in the pane shows a worker's whole name, as the terminal does,
  instead of `V...` on every card or a name cut short, and the card for the
  workers that do not fit shows its count. There a worker's transcript opens from its name in
  the team view.
- In the desktop app the side borders of the pane's message bubbles line up with their corners,
  and with the next bubble's.
- In the desktop app the columns that line up on the terminal line up there too: the usage
  beside the delegation switch, the switch's word, the editor's tabs and parts, and the
  check-ins and summaries placed in the conversation.

## [0.2.0] - 2026-11-06

### Added

- In the desktop app and VS Code the crew's rows in the conversation are one-line cards: the
  worker's figure, who to whom, the title, what the call's result says and how it ended, and a
  press on `▸` shows the task or the report whole. The terminal keeps its bubbles and the phone
  Claude Code's own rows.
- A `usageProbe` option (`on` or `off`, `on` by default) that turns off the headless `claude -p`
  the crew runs for Fable's weekly window; with `off` the pane shows only the 5-hour and weekly
  windows, which come from Claude Code.
- A `napAfter` option (`5s`, `30s`, `2m` or `never`, `5s` by default) that sets how long a free
  or finished worker stays in the pane's row; a finished one still stays while its end stands out.

### Changed

- Finished workers (done, failed or stopped) leave the pane's row as free ones do, at the soonest
  once their end stops standing out (30 seconds); the team view and the roster still list them.
- The newest check-in in the conversation follows the round in place, its steps and phases as
  they change and its times once a minute, instead of keeping what it showed when it was placed.
- A worker's tool calls no longer draw the pane again one by one: what it does, its call count
  and its phase are written once per frame of the pane (400 ms), so a card and the team view
  can trail its last call by that much.
- A stopped run has a mark of its own, `■`, in the status line, the rows, the toasts, the bubbles
  and on its figure, so it reads apart from a failed one (`×`) without colour.
- The editor's figure cheers only for a change to the look: a press on the value already chosen
  leaves it as it was.
- The timer that types out the pane's bubbles runs only while one types, instead of waking the
  session about eleven times a second from start to end.
- A round's summary of more than eight workers sizes its columns to the lines it shows, as a
  check-in does, not also to the workers it only counts.
- What `/crew` answers, its help included, is in English whatever the UI speaks, because Claude
  Code stores it where the model reads it. A Spanish UI keeps its pane, editor, toasts and rows,
  the Spanish verbs (`/crew codigo`) still work, and a name stays as it was written.

### Fixed

- A reload of the plugin (`/reload-plugins`, an update) no longer loses what calls under way
  had told the crew: an agent the orchestrator starts for `delegate` after auto mode refused the
  spawn is still taken as that worker, in its repository; an Agent call that asked for a
  worktree still starts its agent there; a worker's todo list stays its plan; a message between
  workers is still told by its summary; and a worker's end in the conversation keeps the task
  and time it first showed.
- The orchestrator greets a new session awake, and naps after three idle minutes of it, instead
  of sleeping from the start until its first turn.
- A worker or fork that Claude Code ends a while after its last turn no longer shows as working
  for good: it stays done, and a busy one Claude Code no longer lists, silent for a minute, is
  closed with its run's end, or as stopped, also when Claude Code drops it around a reload.
- No two workers share a name any more: two forks started in one response, an agent a worker
  starts, and a worker cleared with `/crew clear` each keep a name of their own. Names are 2 to
  4 characters, so a card shows them whole; a name an Agent call gives that is longer, shorter
  or taken is replaced, and the call is told the name and the address. Past the last name of the
  pool, workers take a letter and a number (`A1`).
- A full model id given to `delegate` (`claude-sonnet-4-5`) starts the worker on its family's
  alias, and reuses one asked for that alias, instead of failing the spawn; a haiku id gives the
  session's model, as `haiku` does, and a model that names no family is turned down with the
  aliases it takes.
- A worker's message to a free teammate that failed on its way no longer loses the messages
  queued after it: each is sent on by itself.
- The orchestrator no longer cheers for a turn that was stopped or failed; `/crew msg` sends the
  message with its lines and spacing as typed; and once the desktop app or an editor leaves the
  session, the pane is no longer drawn again every few seconds for it.
- After Claude Code restarts, a resumed conversation's crew bubbles draw as the crew's again,
  not as Claude Code's own rows: from what each row holds (names, delegate titles, how a run ended
  and its time), with nothing kept on disk. A worker's colour comes back only where the row
  carries its id; elsewhere the bubble is grey.
- A blank name submitted in the editor keeps the orchestrator's name instead of resetting it to
  Nova.
- A share code with no field of a look in it (`CREW1.bnVsbA`, which holds `null`) is turned down as
  a bad code, in the editor and by `/crew import`, instead of replacing the whole look with the
  default. A code that holds only some fields still imports.
- A copy of the share code from the editor that fails, or that another plugin denies, shows a
  short toast pointing to `/crew code`, instead of the whole code in a toast too brief to read or
  no toast at all. `/crew code` answers with the code when its own copy is denied too.

## [0.1.0] - 2026-11-05

The first public release.

### Added

- A pane beside the chat (`/crew`) with the orchestrator, a mascot you design, its speech bubble,
  the Delegate ON/OFF switch, the account's usage windows, a card per worker with its state, step
  or time, a team view and a feed of the crew's messages.
- Delegation by default: the orchestrator's brief in the system prompt and the `delegate` tool's
  description, frozen per load, with later setting changes told in a `[crew]` note.
- The `mcp__crew__delegate`, `mcp__crew__roster` and `mcp__crew__progress` tools: workers that
  are reused with their context, named or by repository; held tasks for a worker another worker
  woke; plans and steps declared by workers.
- Workers that report briefly, follow git rules (their own commits, never on the main branch
  unless asked), work in worktrees when asked, and message each other, a message to a free
  teammate being sent on from the main conversation.
- Bubbles in the conversation for the crew's calls and reports (terminal), drawn only.
- Progress no model reads: a status line, end toasts, lines for messages between workers,
  check-ins every few minutes and a summary per round; `/crew progress` sets their interval.
- A mascot editor, six personalities with fixed lines and a batch Haiku writes, and `CREW1.`
  share codes.
- An English and a Spanish UI, chosen by the `language` option or Claude Code's language setting.
- macOS, Linux and Windows support, with figures drawn as cells on the terminal and SVG in the
  desktop app, the editors and on the phone.

[Unreleased]: https://github.com/CarlxsMG/multisession-claudemod/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/CarlxsMG/multisession-claudemod/compare/ff806e592bc0656773bfd943528f6ab9b9b43900...v0.2.0
[0.1.0]: https://github.com/CarlxsMG/multisession-claudemod/tree/ff806e592bc0656773bfd943528f6ab9b9b43900
