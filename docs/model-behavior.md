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
- **The brief is frozen per load.** `freezeBrief` (`src/settings/notes.ts`) builds it at
  `session.start` and keeps it in the `brief` atom. The system prompt and the `delegate` tool's
  description both take it from there and neither changes for the rest of the load, because a
  changed section or tool description rewrites the whole prompt cache. Later changes reach the
  model as a `[crew]` note. `tests/briefs.test.tsx` checks it.
- **The `delegate` description stays under 3950 characters**, with the longest name and
  personality. Claude Code cuts a tool description at 4096. The description holds the whole brief,
  so a line added to the brief spends this room. `tests/briefs.test.tsx` checks it.
- **Each text is pinned.** `tests/model-text.test.tsx` makes the plugin send each text through the
  hook that sends it, and compares what comes out exactly with the golden file, so a change of
  wording fails it. [What the golden file does not hold](#what-the-golden-file-does-not-hold) lists
  the gaps.
- **A text builder is told, it does not choose.** `src/prompts/` reads no worker's status. Its
  callers pass in the mates, whether a worker is busy, and the words.
- **Progress reaches no model**, apart from the progress tool's reply and an active worker's step
  in the roster. `tests/progress-model.test.tsx` checks it, in Spanish, so that a word of the UI's
  in a model's text stands out.

## The orchestrator

The main conversation's model. It also reads [the texts every model with the crew's tools
reads](#every-model-with-the-crews-tools).

| Text | How it arrives | When | Built by | Golden keys |
| --- | --- | --- | --- | --- |
| The brief | System prompt section `crew:orchestrator`, by `composePrompt` (`src/hooks/prompt.ts`), which leaves out a prompt composed for a `teammate` | Every request of the load | `orchestratorPrompt` (`src/prompts/orchestrator.ts`) | `brief.on`, `brief.off`, `persona.<personality>` |
| The settings note | Context on the person's next message, by `onSubmit` (`src/hooks/prompt.ts`) | After delegation, the name or the personality changed (`setMode`, `src/settings/look.ts`), or when a conversation's last note no longer matches (`checkConversation`: at a load, a `/clear`, a resume). Only the latest settings are told | `crewNote` (`src/prompts/orchestrator.ts`) | `note.on`, `note.off` |
| The note of held tasks | Context on the person's next message, by `onSubmit` | Held tasks missed their worker and no crew tool has said so | `heldMissedNote` (`src/prompts/results.ts`) | `note.heldMissed` |
| `delegate`'s result: started, given or held | Tool result, from `delegate` (`src/crew/delegate.ts`) | Each call | `started`, `given`, `heldFor`, `headsUp`, `heldMissed`, `heldWentFirst` (`src/prompts/results.ts`) | `result.started`, `result.startedBesideBusy`, `result.givenBesideBusy`, `result.givenInWorktree`, `result.held`, `result.heldMore`, `result.heldMissed`, `result.heldWentFirst` |
| `delegate`'s result: turned down | Tool result | A call it cannot carry out | `TASK_REQUIRED`, `noWorker`, `FORK_REFUSED`, `noRepo`, `noModel`, `unreachable`, `notStarted` | `result.noTask`, `result.noWorker`, `result.fork`, `result.noRepo`, `result.noModel`, `result.unreachable`, `result.notStarted` |
| `delegate`'s result: start it yourself | Tool result | Auto mode refused the spawn with no verdict | `autoModeHandoff` | `result.autoMode`, `result.autoModeWithModel` |
| `delegate`'s failure | The `.catch` of its hook in `hooks/register.tsx`, as a denial | `delegate` itself threw | `DELEGATE_FAILED` | `result.failed` |
| The progress tool's refusal | Tool result, from `progressTool` (`src/hooks/tools.ts`) | The orchestrator called a worker's tool | `PROGRESS_NOT_FOR_MAIN` | `progress.orchestrator` |
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
| The worker preamble | Ahead of the first prompt, by `onSpawn` (`src/crew/spawn.ts`) | At the spawn of a worker `delegate` started or handed to the orchestrator to start, and of any other agent that is not a fork while delegation is on | `workerPreamble` (`src/prompts/worker.ts`) | `preamble.repo`, `preamble.teammates`, `preamble.childOfWorker`, `preamble.ownWorktree`, `preamble.parentWorktree` |
| The fork preamble | Ahead of the first prompt, by `onSpawn` | At the spawn of a fork while delegation is on. A fork of the main session also hears the git rules, which a worker's fork has from its parent | `forkPreamble`, `gitRules` (`src/prompts/worker.ts`) | `fork.ofWorker`, `fork.ofMain` |
| How a new task ends | After the task, in the send from the main conversation (`deliver`, `src/crew/deliver.ts`) | Each task given to a worker that already ran. A worker `delegate` started reports as before; another agent is told how | `taskClose` (`src/prompts/worker.ts`) | `task.reused`, `task.notFromDelegate` |
| Held tasks | A send from the main conversation, by `delegate` or `sendHeld` (`src/crew/takeover.ts`) | When a run that held them ends, or ahead of the next task after they missed it | `heldTasks`, `taskClose` (`src/prompts/worker.ts`) | `task.heldAlone`, `task.heldTogether` |
| A teammate's message | A send from the main conversation, by `relayOne` (`src/crew/relay.ts`) | At the tick after a worker wrote to a free teammate | `relayText` (`src/prompts/worker.ts`) | `relay` |
| The person's message | A send from the main conversation, by `messageWorker` (`src/crew/message.ts`) | `/crew msg`, or the pane | `fromUser` (`src/prompts/worker.ts`) | `message.fromUser` |
| `delegate`'s refusal | Tool result, from `refuseWorker` (`src/crew/delegate.ts`) | A worker called `delegate` | `notForWorkers` (`src/prompts/results.ts`) | `result.notForWorkers` |
| The progress tool's answers | Tool result, from `progressTool` (`src/hooks/tools.ts`) | Each call | `progressReply`, `PROGRESS_INVALID`, `PROGRESS_NO_RUN` (`src/prompts/results.ts`) | `progress.declared`, `progress.step`, `progress.last`, `progress.invalid`, `progress.noRun` |

With delegation off, the Agent tool's agents start with nothing added; `delegate`'s workers still
hear the preamble. A resumed agent and an agent of a workflow start with nothing added in either
mode.

## Every model with the crew's tools

The specs are registered at `session.start` (`src/hooks/session.ts`), so a worker has them in its
tool list as the orchestrator does. That is why the brief's first line tells a worker or fork
reading it to ignore it, and why the progress tool's description stays short.

| Text | How it arrives | When | Built by | Golden keys |
| --- | --- | --- | --- | --- |
| The `delegate` tool's spec | Tool list | Every request of the load | `delegateSpec` (`src/prompts/tools.ts`), its description `DELEGATE_ABOUT` and the frozen brief | `spec.delegate.description.on`, `spec.delegate.description.off`, `spec.delegate.inputSchema` |
| The roster tool's spec | Tool list | Every request | `ROSTER_SPEC` (`src/prompts/tools.ts`) | `spec.roster` |
| The progress tool's spec | Tool list | Every request | `PROGRESS_SPEC` (`src/prompts/tools.ts`) | `spec.progress` |
| The roster | Tool result, from `rosterText` (`src/crew/roster.ts`), which gathers what the rows say | Each call | `rosterList`, `rosterRow`, `emptyCrew` (`src/prompts/roster.ts`), `noWorker` (`src/prompts/results.ts`) | `roster.empty`, `roster.crew`, `roster.one`, `roster.unknown` |
| A name the crew gave instead | Context after an Agent call's result, by `src/hooks/watch.ts` | The name the call gave does not fit a worker, or another member has it | `renamedAgent` (`src/prompts/results.ts`) | `result.renamedAgent` |
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
3. A setting the model must hear of during a load cannot go only in the brief or a tool's
   description, which are frozen: it also goes in the `[crew]` note (`crewNote`, and `sameSettings`
   in `src/settings/notes.ts`). A line added to the brief spends the `delegate` description's room.
4. A new text gets a golden key, an `expectText` in `tests/model-text.test.tsx` that goes through
   the hook that sends it, and a row here.
