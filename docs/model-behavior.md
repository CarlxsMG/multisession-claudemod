# What each model reads

Every text crew puts in front of a model: who reads it and when, what builds it, and what holds it
still. Read this before changing what the models are told. The texts are not repeated here:
`tests/golden/model-text.ts` holds each one exactly, under the keys the tables name.
[ARCHITECTURE.md](../ARCHITECTURE.md) explains the flows around them.

## The rules

- **English, whatever the UI's language.** The builders in `src/prompts/` never call `t()`. What
  a person chose or a model wrote (a name, a catchphrase, a task, a report) goes in as it is.
  [The texts outside `src/prompts/`](#outside-srcprompts) include one that does not follow this:
  the engine's refusals and failed sends, passed on as they came.
- **The brief is frozen per process.** `freezeBrief` (`src/settings/notes.ts`) builds it at the
  first `session.start` and keeps it in the `brief` atom; a later `session.start` (a reload, an
  enable, a worker respawn) finds it there and keeps it. The system prompt takes it from there and
  it does not change for the rest of the process, because a changed section rewrites the prompt
  cache. The `delegate` tool's description holds no setting at all: it carries only the
  delegation rules, constant text, so the tool list is the same in every session. Later changes reach the
  model as a `[crew]` note. `tests/briefs.test.tsx` checks it.
- **The delegation rules are in the `delegate` description alone.** The brief says who the
  orchestrator is and points there. A policy plugin can keep out a system section but not a tool
  description, and a rule in both would be read twice in every request. A rule says when to do
  something; what an argument does is said in that argument's description, once.
  `tests/briefs.test.tsx` checks that no rule is in the brief.
- **The `delegate` description stays under 3950 characters.** Claude Code cuts a tool
  description at 4096. The description holds the delegation rules, so a rule added to them
  spends this room. `tests/briefs.test.tsx` checks it.
- **Each text is pinned.** `tests/model-text.test.tsx` makes the plugin send each text through the
  hook that sends it, and compares what comes out exactly with the golden file, so a change of
  wording fails it. [What the golden file does not hold](#what-the-golden-file-does-not-hold) lists
  the gaps.
- **A text builder is told, it does not choose.** `src/prompts/` reads no worker's status. Its
  callers pass in the mates, whether a worker is busy, and the words.
- **Progress reaches no model**, apart from the progress tool's reply and an active worker's step
  in the roster. `tests/progress-model.test.tsx` checks it, in Spanish, so that a word of the UI's
  in a model's text stands out. The files a run in flight has edited are not progress: a delegate
  result's heads-up names them, and a worker reads of another worker's edit of a file it edits.

## The orchestrator

The main conversation's model. It also reads [the texts every model with the crew's tools
reads](#every-model-with-the-crews-tools).

| Text | How it arrives | When | Built by | Golden keys |
| --- | --- | --- | --- | --- |
| The brief | System prompt section `crew:orchestrator`, by `composePrompt` (`src/hooks/prompt.ts`), which leaves out a prompt composed for a `teammate` | Every request of the load | `orchestratorPrompt` (`src/prompts/orchestrator.ts`) | `brief.on`, `brief.off`, `persona.<personality>` |
| The line on when to compact | System prompt section `crew:compact`, by `composePrompt`, apart from the brief so the `delegate` description keeps its room | Every request of the load | `COMPACT_BRIEF` (`src/prompts/compact.ts`) | `brief.compact` |
| The settings note | Context on the person's next message, by `onSubmit` (`src/hooks/prompt.ts`) | After delegation, the name or the personality changed (`setMode`, `src/settings/look.ts`), or when a conversation's last note no longer matches (`checkConversation`: at a load, a `/clear`, a resume). Only the latest settings are told | `crewNote` (`src/prompts/orchestrator.ts`) | `note.on`, `note.off` |
| The note of held tasks | Context on the person's next message, by `onSubmit` | Held tasks missed their worker and no crew tool has said so | `heldMissedNote` (`src/prompts/results.ts`) | `note.heldMissed` |
| A task that waited for a run and was not given | The end of the next delegate result (`tellWaiting`, `src/crew/waiting.ts`), else context on the person's next message, by `onSubmit` | The run it waited for failed or was stopped, its worker was not reached, or no worker could start. Said once | `notGiven`, `notGivenNote`, `afterEnded`, `afterNotReached`, `afterNotStarted` (`src/prompts/results.ts`) | `result.notGiven`, `note.notGiven` |
| A worker no report will come from, or that went quiet | The end of the next delegate or roster result of the main conversation (`tellSilent`, `src/crew/silence.ts`), else context on the person's next message, by `onSubmit` | The sync ended a busy worker the engine dropped with no end heard, or a busy worker gave no sign of life for `QUIET_MIN`. Said once; a quiet worker heard from again is told anew when it goes quiet again | `goneSilent`, `quietSilent` (`src/prompts/results.ts`) | `note.goneSilent`, `result.quietSilent` |
| A worker that was busy when Claude Code restarted | As the row above | `restoreCrew` (`src/crew/persist.ts`) read the crew back at `session.start` and stopped it. Said once | `cutSilent`, `HELD_OVER_RESTART` (`src/prompts/results.ts`) | `note.cutSilent` |
| `delegate`'s result: started, given or held | Tool result, from `delegate` (`src/crew/delegate.ts`) | Each call | `started`, `given`, `heldTokens`, `heldFor`, `heldAfter`, `afterOver`, `headsUp`, `heldMissed`, `heldWentFirst`, `heldLetGo`, `heldDropped` (`src/prompts/results.ts`) | `result.heldAfter`, `result.heldAfterOther`, `result.heldAfterNew`, `result.afterOver`, `result.started`, `result.startedBesideBusy`, `result.givenHolding`, `result.startedBesideEdits`, `result.givenBesideBusy`, `result.givenInWorktree`, `result.held`, `result.heldMore`, `result.heldMissed`, `result.heldWentFirst`, `result.heldLetGo`, `result.heldDropped` |
| `delegate`'s result: turned down | Tool result | A call it cannot carry out | `TASK_REQUIRED`, `noWorker`, `FORK_REFUSED`, `noRepo`, `noModel`, `unreachable`, `afterNeedsWorker`, `notStarted` | `result.noTask`, `result.noWorker`, `result.fork`, `result.noRepo`, `result.noModel`, `result.unreachable`, `result.afterNeedsWorker`, `result.notStarted` |
| `delegate`'s result: start it yourself | Tool result | Auto mode refused the spawn with no verdict | `autoModeHandoff` | `result.autoMode`, `result.autoModeWithModel` |
| `delegate`'s failure | The `.catch` of its hook in `hooks/register.tsx`, as a denial | `delegate` itself threw | `DELEGATE_FAILED` | `result.failed` |
| The progress tool's refusal | Tool result, from `progressTool` (`src/hooks/tools.ts`) | The orchestrator called a worker's tool | `PROGRESS_NOT_FOR_MAIN` | `progress.orchestrator` |
| The compaction instructions | Added to the summarizer's instructions, after the person's own `/compact` text, by `onCompact` (`src/hooks/compact.ts`); a compaction the crew starts (`compactWhenSafe`, `src/crew/compaction.ts`) carries them after `compactFocus`, the orchestrator's `focus` | Each compaction of the main conversation while delegation is on or the crew has workers: `/compact`, the engine's threshold, a plugin's. Never skipped | `COMPACT_MAIN`, `compactFocus`, `withCrewInstructions` (`src/prompts/compact.ts`) | `compact.main` |
| The crew after a compaction | A `crewState` context block, by `crewContext` (`src/hooks/compact.ts`) on `prompt.context`, which the engine asks again after a compaction and sends where the conversation holds none | The first request after a compaction or a resume, while the crew has workers | `crewStateNote` (`src/prompts/compact.ts`) over the roster's text | `compact.crewState` |
| The compact tool's answers | Tool result, from `compactTool` (`src/hooks/tools.ts`) | Each call: queued, with the wait the 10-minute gap leaves; a worker's call is turned down | `compactQueued`, `COMPACT_NOT_FOR_WORKERS` (`src/prompts/compact.ts`) | `result.compactQueued`, `result.compactQueuedWait`, `result.compactNotForWorkers` |
| What `/crew` answers: its replies, usage lines and help | Command output, from `runCrewCommand` (`src/hooks/commands.ts`), which the engine shows and stores in the conversation as a `<local-command-stdout>` row | Each `/crew` the person runs | `crewReply` (`src/prompts/commands.ts`) | `command.help`, `command.opened`, `command.editing`, `command.teamOpened`, `command.msgUsage`, `command.sent`, `command.code`, `command.codeCopied`, `command.badCode`, `command.imported`, `command.newLook`, `command.modeOn`, `command.modeOff`, `command.cleared`, `command.progressUsage` |

`tests/model-text.test.tsx` pins what `/crew` answers in an English and in a Spanish UI, in every
personality. That the model reads it is the engine's part, which no test covers: `src/hooks/commands.ts`
says so, and stored conversations hold those rows. `/crew code` puts a share code there. A reply says
nothing of progress, by the rule above: `/crew progress` replies nothing and places a row, which no
model reads, to say how the crew is doing.

## Workers and forks

A task's own words reach a worker as the orchestrator wrote them; these texts go around them.

| Text | How it arrives | When | Built by | Golden keys |
| --- | --- | --- | --- | --- |
| The worker preamble | Ahead of the first prompt, by `onSpawn` (`src/crew/spawn.ts`) | At the spawn of a worker `delegate` started or handed to the orchestrator to start, and of any other agent that is not a fork while delegation is on | `workerPreamble` (`src/prompts/worker.ts`) | `preamble.repo`, `preamble.teammates`, `preamble.childOfWorker`, `preamble.readOnly`, `preamble.ownWorktree`, `preamble.parentWorktree` |
| The crew's agent type: its system prompt | The system prompt of a `crew:worker` agent, where the engine's own text for a general-purpose agent would stand; the engine's notes follow it. Registered at `session.start` by `registerWorkerType` (`src/crew/worker-type.ts`) | Every request of a worker `delegate` started with no type asked, or `general-purpose` | `WORKER_ROLE`, in `WORKER_AGENT` (`src/prompts/worker.ts`) with the type's description, which the orchestrator reads in its list of agent types | `agent.worker` |
| The fork preamble | Ahead of the first prompt, by `onSpawn` | At the spawn of a fork while delegation is on. A fork of the main session also hears the git rules, which a worker's fork has from its parent | `forkPreamble`, `gitRules` (`src/prompts/worker.ts`) | `fork.ofWorker`, `fork.ofMain` |
| How a new task ends | After the task, in the send from the main conversation (`deliver`, `src/crew/deliver.ts`) | Each task given to a worker that already ran. A worker `delegate` started reports as before; another agent is told how | `taskClose` (`src/prompts/worker.ts`) | `task.reused`, `task.notFromDelegate` |
| New teammates | One line ahead of how the task ends, in the same send, by `giveTask` (`src/crew/delegate.ts`) | A task `delegate` gives a worker that already ran, when teammates are there that neither its preamble nor an earlier task told it of (`untoldMatesOf`, `src/crew/workers.ts`); never the agents it started itself. Held tasks and relays carry none | `newMates` (`src/prompts/worker.ts`) | `task.reused` |
| Held tasks | A send from the main conversation, by `delegate` or `sendHeld` (`src/crew/takeover.ts`) | When a run that held them ends, or ahead of the next task after they missed it | `heldTasks`, `taskClose` (`src/prompts/worker.ts`) | `task.heldAlone`, `task.heldTogether` |
| Tasks that waited for a run | A send from the main conversation, by `sendWaiting` (`src/crew/waiting.ts`) | When the run a delegate call's `after` named ends | `heldTasks`, `taskClose` (`src/prompts/worker.ts`) | `task.afterTogether` |
| A teammate's message | A send from the main conversation, by `relayOne` (`src/crew/relay.ts`) | At the tick after a worker wrote to a free teammate | `relayText` (`src/prompts/worker.ts`) | `relay` |
| Another worker's edit of a file | Context after the tool's result, by `watchCall` (`src/hooks/watch.ts`) from `overlapNote` (`src/crew/edits.ts`) | A worker's `Edit`, `MultiEdit`, `Write` or `NotebookEdit` of a file that another worker's run in flight has edited; once for each worker, other worker and file | `sameFile` (`src/prompts/worker.ts`) | `edit.sameFile` |
| The person's message | A send from the main conversation, by `messageWorker` (`src/crew/message.ts`) | `/crew msg`, or the pane | `fromUser` (`src/prompts/worker.ts`) | `message.fromUser` |
| The worker's compaction instructions | Added to the summarizer's instructions, after any of its own, by `onCompact` | Each compaction of a crew worker's own conversation (`agentId` one of the crew's) | `COMPACT_WORKER`, `withCrewInstructions` (`src/prompts/compact.ts`) | `compact.worker` |
| `delegate`'s refusal | Tool result, from `refuseWorker` (`src/crew/delegate.ts`) | A worker called `delegate` | `notForWorkers` (`src/prompts/results.ts`) | `result.notForWorkers` |
| The progress tool's answers | Tool result, from `progressTool` (`src/hooks/tools.ts`) | Each call | `progressReply`, `PROGRESS_INVALID`, `PROGRESS_NO_RUN` (`src/prompts/results.ts`) | `progress.declared`, `progress.step`, `progress.last`, `progress.invalid`, `progress.noRun` |

With delegation off, the Agent tool's agents start with nothing added; `delegate`'s workers still
hear the preamble. A resumed agent and an agent of a workflow start with nothing added in either
mode.

## Every model with the crew's tools

The specs are registered at `session.start` (`src/hooks/session.ts`), so an agent has them in its
tool list as the orchestrator does. That is why the `delegate` description says its rules are the
orchestrator's alone, and why the progress tool's description stays short. A fork of the main
conversation reads the brief too, whose first line tells it to ignore it. A worker of the crew's own
type, `crew:worker`, which is what `delegate` starts when no other type is asked, has neither the
`delegate` nor the compact tool; a worker of another type, a fork and the Agent tool's agents have
all four.

| Text | How it arrives | When | Built by | Golden keys |
| --- | --- | --- | --- | --- |
| The `delegate` tool's spec | Tool list | Every request of the load | `DELEGATE_SPEC` (`src/prompts/tools.ts`), its description `DELEGATE_ABOUT` and `DELEGATION_RULES` (`src/prompts/orchestrator.ts`) | `spec.delegate.description`, `spec.delegate.inputSchema` |
| The roster tool's spec | Tool list | Every request | `ROSTER_SPEC` (`src/prompts/tools.ts`) | `spec.roster` |
| The progress tool's spec | Tool list | Every request | `PROGRESS_SPEC` (`src/prompts/tools.ts`) | `spec.progress` |
| The compact tool's spec | Tool list | Every request | `COMPACT_SPEC` (`src/prompts/tools.ts`) | `spec.compact` |
| The roster | Tool result, from `rosterText` (`src/crew/roster.ts`), which gathers what the rows say | Each call | `rosterList`, `rosterRow`, `emptyCrew` (`src/prompts/roster.ts`), `noWorker` (`src/prompts/results.ts`) | `roster.empty`, `roster.crew`, `roster.one`, `roster.oneContext`, `roster.unknown` |
| A name the crew gave instead | Context after an Agent call's result, by `src/hooks/watch.ts` | The name the call gave does not fit a worker, or another member has it | `renamedAgent` (`src/prompts/results.ts`) | `result.renamedAgent` |
| A command that does not end, refused | A denial, from `guardRunaway` (`src/guard/runaway.ts`) on Bash and PowerShell calls | A command `findRunaway` finds would run until killed: `tail -f`, `watch`, a watch mode, an endless loop | `runawayDenied` (`src/prompts/results.ts`) | `result.runaway` |
| A send that may not have gone out | The reason on the send, from the `.catch` of `session.send` in `hooks/register.tsx` | `onSend` failed after the send may have left | `SEND_UNSURE` (`src/prompts/results.ts`) | `send.failed` |

A worker's message to a free teammate is answered as delivered, and the engine words that answer.

## Haiku

`ensureLines` (`src/settings/mood-lines.ts`) asks Haiku through `$.model.complete` for a batch of
the figure's mood lines. It is called every 10 s from the pane's tick, and asks once per signature
(locale, name, personality, catchphrase), never while the person is in the editor. The prompt is
`linesPrompt` (`src/persona/lines.ts`), golden key `haiku.prompt`.

This is the one prompt that follows the UI's language: it is written in English, names the language
it wants the lines in, and carries the catchphrase, so the golden file holds it as a crew in Spanish
asks it. What comes back is parsed by `parseMoodLines` and drawn beside the figure; no model reads it.

## Outside `src/prompts/`

`src/prompts/` holds what the crew writes for a model, with these exceptions.

| Text | Where it lives | In the golden file | Language |
| --- | --- | --- | --- |
| Each personality's description, in the persona line of the brief and of the note | `VIBES` (`src/persona/vibes.ts`) | Yes: `persona.<personality>` | English |
| The prompt for the mood lines | `linesPrompt` (`src/persona/lines.ts`) | Yes: `haiku.prompt` | English, asking for the UI's language |
| An active worker's last tool call in its roster row: the tool's name and what it acts on | `describe` (`src/progress/phase.ts`) | As it appears in `roster.crew` | No UI words: the tool's name, then the call's own input |
| An active worker's step in its roster row | `stepText` (`src/progress/plan.ts`) | As it appears in `roster.crew` | Numbers |
| The files a busy worker's run has edited, in a delegate result's heads-up, and the file's name in the word on another worker's edit | The path each editing call names, as seen from the repository (`under`, `src/util/path.ts`) | As they appear in `result.startedBesideEdits` and `edit.sameFile` | No UI words: the call's own input |
| A worker's status in its roster row | The status values in `types/index.d.ts` | As they appear in `roster.crew` | English |
| Tool names and limits named in the texts | `src/config.ts` | Wherever they appear | English |
| The engine's refusals and failed sends, passed on as they came | `notStarted`, `unreachable`, `heldMissed`, `heldMissedNote` and the roster's `not delivered` take them as an argument | Only the tests' own wording | The engine's |

## What the golden file does not hold

The golden file holds each text as the tests build it, so a branch they do not reach is not pinned.
These are not; `tests/messaging.test.tsx` and `tests/roster.test.tsx` match some of them by pattern,
which does not hold their exact words:

- `rosterList`'s `+N more`;
- `rosterRow`'s takeover marks: `answering`, `N tasks waiting`, `not delivered`;
- the singular of `heldMissed`, `heldMissedNote` and `heldWentFirst`;
- the plural of `headsUp`, and `noWorker` with no workers.

The golden file also holds two entries no model reads: `usage.argv` and `usage.stdin`, the command
line and the control request of the usage probe (`src/usage/limits.ts`). A headless `claude`
answers that request by reading the account's usage, and runs no model.

## What no model reads

The pane, the status line, the toasts, the rows placed in the conversation (`$.ui.place`), the
bubbles and cards (their render hooks draw; the stored transcript stays as it was), the feed, and
the `/crew` command's line in the command menu.

## Changing a text

1. Change the builder, and update `tests/golden/model-text.ts` by hand in the same commit. The
   commit message says why the model should read the new text.
2. A result of `delegate` is also read back: `readDelegate` and `delegatedTo`, beside the builders
   in `src/prompts/results.ts`, parse it for the conversation's rows. Keep them in step;
   `tests/unit/results.test.ts` covers them.
3. A setting the model must hear of during a load cannot go only in the brief, which is frozen,
   and never goes in a tool's description: it also goes in the `[crew]` note (`crewNote`, and
   `sameSettings` in `src/settings/notes.ts`). A delegation rule goes in `DELEGATION_RULES`, not in
   the brief, and spends the `delegate` description's room.
4. A new text gets a golden key, an `expectText` in `tests/model-text.test.tsx` that goes through
   the hook that sends it, and a row here.
5. The `task` argument of `delegate` tells the orchestrator what a worker's preamble already
   gives (the report format and the git, progress and messaging rules), so that briefs do not
   repeat them. Take one of those out of `workerPreamble` and that sentence is no longer true:
   `tests/briefs.test.tsx` holds the two together.
6. A change to a delegation rule, the brief or the `delegate` tool's description changes what the
   orchestrator does, which no test sees: run the eval suite before and after
   ([Evals](../CONTRIBUTING.md#evals)).
