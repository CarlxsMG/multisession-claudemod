import type { Register } from 'claude-code'

import { onSessionEnd, onStop, onSubagentStop } from '../src/background/sweep'
import { chooseCompactAt } from '../src/crew/compaction'
import { onSend } from '../src/crew/sends'
import { nameShell } from '../src/crew/shell-title'
import { onSpawn } from '../src/crew/spawn'
import { hideWorkerType } from '../src/crew/worker-type'
import { chooseNapAfter } from '../src/crew/workers'
import { guardRunaway } from '../src/guard/runaway'
import { runCrewCommand } from '../src/hooks/commands'
import { crewContext, onCompact } from '../src/hooks/compact'
import { composePrompt, onSubmit } from '../src/hooks/prompt'
import { onAttach, onMeasure, onModelSwitch, onSessionStart } from '../src/hooks/session'
import { compactTool, delegateTool, progressTool, rosterTool } from '../src/hooks/tools'
import { onTurnComplete, onTurnStart } from '../src/hooks/turns'
import { watchCall } from '../src/hooks/watch'
import { DELEGATE_FAILED, SEND_UNSURE } from '../src/prompts/results'
import { chooseLocale } from '../src/i18n/locale'
import { drawPane, onClose, onDetach } from '../src/ui/pane/index'
import { drawPlaced } from '../src/ui/transcript/placed'
import { drawToolCard, drawToolResult, drawToolUse } from '../src/ui/transcript/tool-use'
import { drawUserCard, drawUserMessage } from '../src/ui/transcript/user-message'
import { chooseUsageProbe } from '../src/usage/limits'

// A drawing's `.catch`: the event passed on, which replays what the hook's
// last `next` answered, or draws what is beneath it when there was none.
function passOn<E, R>(_: unknown, e: E, next: (e: E) => R): R {
  return next(e)
}

// The tools whose calls the crew draws as its rows in the conversation.
const CREW_TOOLS = ['mcp__crew__delegate', 'SendMessage', 'TaskStop']

// Every hook the crew registers. Each matcher's value is written out in this
// file, CREW_TOOLS's too: the validator reads a matcher's value only from the
// file that registers the hook, not through an import.
//
// A hook that fails (throws, overruns, answers a wrong shape) is the engine's
// to skip: what is beneath it runs in its place, or what its last `next`
// answered stands, and the engine reports it by name. Every hook here but a
// guard and a drawing wants just that. A guard, whose failing must not let
// through what it guards, carries a `.catch` that says what that is. A drawing
// carries one that passes the event on (`next` replays what it last answered),
// so its row is the engine's: the test kit fails a test whose render hook the
// engine had to skip, the fallback the crew means included. Any other hook
// with one that only passes the event on would change no outcome, and have the
// engine report as failed closed a hook that failed open. The validator's
// "gating hook without .catch" names an event that lets a hook refuse, not a
// hook that does.
export const register: Register = (on, options) => {
  chooseLocale(options.language)
  chooseUsageProbe(options.usageProbe)
  chooseNapAfter(options.napAfter)
  chooseCompactAt(options.compactAt)

  on('session.start', ($, e, next) => onSessionStart($, e, next))

  on('command.run', { command: 'crew' }, ($, e) => runCrewCommand($, e))

  // ---- the crew's own tools ----
  // Matched as patterns: a tool's name as a string type-checks only where
  // the engine's generated list of MCP tools has it, which depends on the
  // servers connected the last time the plugin loaded.

  on('tool.call', { tool: /^mcp__crew__delegate$/ }, ($, e) => delegateTool($, e)).catch(($, e, next) =>
    // Beneath it no tool answers: the model is told what to use instead.
    next.called ? next(e) : { deny: DELEGATE_FAILED },
  )

  on('tool.call', { tool: /^mcp__crew__roster$/ }, ($, e) => rosterTool($, e))

  on('tool.call', { tool: /^mcp__crew__progress$/ }, ($, e) => progressTool($, e))

  on('tool.call', { tool: /^mcp__crew__compact$/ }, ($, e) => compactTool($, e))

  on('prompt.compose', ($, e, next) => composePrompt($, e, next))

  // ---- compaction ----

  on('session.compact', ($, e, next) => onCompact($, e, next))
  on('prompt.context', ($, e, next) => crewContext($, e, next))

  // ---- watching the session ----

  on('tool.call', ($, e, next) => watchCall($, e, next))
  // A guard with no `.catch`: if it fails, the command runs as asked.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, (_, e, next) => guardRunaway(e, next))
  // Beneath the watch, which records the call as the model sent it.
  on('tool.call', { tool: ['Bash', 'PowerShell', 'Monitor'] }, ($, e, next) => nameShell($, e, next))
  on('session.measure', ($, e, next) => onMeasure($, e, next))
  on('session.attach', ($, e, next) => onAttach($, e, next))
  on('session.detach', ($, e, next) => onDetach($, e, next))

  on('turn.start', ($, e, next) => onTurnStart($, e, next))
  on('classic.PostModelSwitch', ($, e, next) => onModelSwitch($, e, next))

  on('turn.complete', ($, e, next) => onTurnComplete($, e, next))
  on('classic.Stop', ($, e, next) => onStop($, e, next))
  on('classic.SubagentStop', ($, e, next) => onSubagentStop($, e, next))
  on('session.end', ($, e, next) => onSessionEnd($, e, next))

  on('agent.spawn', ($, e, next) => onSpawn($, e, next))
  // The crew's own agent type, which only delegate starts. If this fails the
  // model is offered the type: an agent it starts so is one more on the list.
  on('agent.offer', { agent: /^crew:worker$/ }, ($, e) => hideWorkerType($, e))

  on('session.send', ($, e, next) => onSend($, e, next)).catch(($, e, next) =>
    // Sent once only: a send that failed on its way is not tried again.
    next.called ? { isDelivered: false as const, reason: SEND_UNSURE } : next(e),
  )

  on('prompt.submit', ($, e, next) => onSubmit($, e, next))

  on('ui.close', ($, e, next) => onClose($, e, next))

  // ---- the pane ----

  on('ui.render', { component: 'Pane', requestId: 'crew' }, ($, e) => drawPane($, e)).catch(passOn)

  // ---- the conversation's crew rows ----
  // Drawn only: the stored transcript, and what any model reads, stay as they
  // were. Anything the crew cannot place and an error keep the engine's own
  // drawing; ctrl+o's full view shows each bubble whole (see crewBubble). The
  // terminal draws bubbles, the desktop app and VS Code one-line cards a press
  // opens (see crewCard), and every other surface, the phone's among them, the
  // engine's own rows: a matcher selects only the surfaces it names.
  on('ui.render', { component: 'ToolUse', surface: 'terminal', props: { tool: CREW_TOOLS } }, ($, e, next) => drawToolUse($, e, next)).catch(passOn)
  on('ui.render', { component: 'ToolUse', surface: ['desktop', 'vscode'], props: { tool: CREW_TOOLS } }, ($, e, next) => drawToolCard($, e, next)).catch(passOn)
  on('ui.render', { component: 'ToolResult', surface: ['terminal', 'desktop', 'vscode'], props: { tool: CREW_TOOLS } }, ($, e, next) =>
    drawToolResult($, e, next),
  ).catch(passOn)
  on('ui.render', { component: 'UserMessage', surface: 'terminal' }, ($, e, next) => drawUserMessage($, e, next)).catch(passOn)
  on('ui.render', { component: 'UserMessage', surface: ['desktop', 'vscode'] }, ($, e, next) => drawUserCard($, e, next)).catch(passOn)
  on('ui.render', { component: 'Placed' }, ($, e, next) => drawPlaced($, e, next)).catch(passOn)
}
