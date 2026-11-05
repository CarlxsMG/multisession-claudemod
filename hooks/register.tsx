import type { Register } from 'claude-code'

import { onSend } from '../src/crew/sends'
import { onSpawn } from '../src/crew/spawn'
import { chooseNapAfter } from '../src/crew/workers'
import { runCrewCommand } from '../src/hooks/commands'
import { composePrompt, onSubmit } from '../src/hooks/prompt'
import { onAttach, onMeasure, onModelSwitch, onSessionStart } from '../src/hooks/session'
import { delegateTool, progressTool, rosterTool } from '../src/hooks/tools'
import { onTurnComplete, onTurnStart } from '../src/hooks/turns'
import { watchCall } from '../src/hooks/watch'
import { DELEGATE_FAILED, SEND_UNSURE } from '../src/prompts/results'
import { chooseLocale } from '../src/i18n/locale'
import { drawPane, onClose, onDetach } from '../src/ui/pane/index'
import { drawPlaced } from '../src/ui/transcript/placed'
import { drawToolCard, drawToolResult, drawToolUse } from '../src/ui/transcript/tool-use'
import { drawUserCard, drawUserMessage } from '../src/ui/transcript/user-message'
import { chooseUsageProbe } from '../src/usage/limits'

// The tools whose calls the crew draws as its rows in the conversation.
const CREW_TOOLS = ['mcp__crew__delegate', 'SendMessage', 'TaskStop']

// Every hook the crew registers. Each matcher's value is written out in this
// file, CREW_TOOLS's too: the validator reads a matcher's value only from the
// file that registers the hook, not through an import.
export const register: Register = (on, options) => {
  chooseLocale(options.language)
  chooseUsageProbe(options.usageProbe)
  chooseNapAfter(options.napAfter)

  on('session.start', ($, e, next) => onSessionStart($, e, next))

  on('command.run', { command: 'crew' }, ($, e) => runCrewCommand($, e))

  // ---- the crew's own tools ----
  // Matched as patterns: a tool's name as a string type-checks only where
  // the engine's generated list of MCP tools has it, which depends on the
  // servers connected the last time the plugin loaded.

  on('tool.call', { tool: /^mcp__crew__delegate$/ }, ($, e) => delegateTool($, e)).catch(($, e, next) =>
    next.called ? next(e) : { deny: DELEGATE_FAILED },
  )

  on('tool.call', { tool: /^mcp__crew__roster$/ }, ($, e) => rosterTool($, e)).catch(($, e, next) => next(e))

  on('tool.call', { tool: /^mcp__crew__progress$/ }, ($, e) => progressTool($, e)).catch(($, e, next) => next(e))

  on('prompt.compose', ($, e, next) => composePrompt($, e, next)).catch(($, e, next) => next(e))

  // ---- watching the session ----

  on('tool.call', ($, e, next) => watchCall($, e, next)).catch(($, e, next) => next(e))
  on('session.measure', ($, e, next) => onMeasure($, e, next))
  on('session.attach', ($, e, next) => onAttach($, e, next))
  on('session.detach', ($, e, next) => onDetach($, e, next))

  on('turn.start', ($, e, next) => onTurnStart($, e, next))
  on('classic.PostModelSwitch', ($, e, next) => onModelSwitch($, e, next)).catch(($, e, next) => next(e))

  on('turn.complete', ($, e, next) => onTurnComplete($, e, next))

  on('agent.spawn', ($, e, next) => onSpawn($, e, next)).catch(($, e, next) => next(e))

  on('session.send', ($, e, next) => onSend($, e, next)).catch(($, e, next) =>
    // Sent once only: a send that failed on its way is not tried again.
    next.called ? { isDelivered: false as const, reason: SEND_UNSURE } : next(e),
  )

  on('prompt.submit', ($, e, next) => onSubmit($, e, next)).catch(($, e, next) => next(e))

  on('ui.close', ($, e, next) => onClose($, e, next)).catch(($, e, next) => next(e))

  // ---- the pane ----

  on('ui.render', { component: 'Pane', requestId: 'crew' }, ($, e) => drawPane($, e))

  // ---- the conversation's crew rows ----
  // Drawn only: the stored transcript, and what any model reads, stay as they
  // were. Anything the crew cannot place and an error keep the engine's own
  // drawing; ctrl+o's full view shows each bubble whole (see crewBubble). The
  // terminal draws bubbles, the desktop app and VS Code one-line cards a press
  // opens (see crewCard), and every other surface, the phone's among them, the
  // engine's own rows: a matcher selects only the surfaces it names.
  on('ui.render', { component: 'ToolUse', surface: 'terminal', props: { tool: CREW_TOOLS } }, ($, e, next) =>
    drawToolUse($, e, next),
  ).catch(($, e, next) => next(e))
  on('ui.render', { component: 'ToolUse', surface: ['desktop', 'vscode'], props: { tool: CREW_TOOLS } }, ($, e, next) =>
    drawToolCard($, e, next),
  ).catch(($, e, next) => next(e))
  on('ui.render', { component: 'ToolResult', surface: ['terminal', 'desktop', 'vscode'], props: { tool: CREW_TOOLS } }, ($, e, next) =>
    drawToolResult($, e, next),
  ).catch(($, e, next) => next(e))
  on('ui.render', { component: 'UserMessage', surface: 'terminal' }, ($, e, next) => drawUserMessage($, e, next)).catch(
    ($, e, next) => next(e),
  )
  on('ui.render', { component: 'UserMessage', surface: ['desktop', 'vscode'] }, ($, e, next) => drawUserCard($, e, next)).catch(
    ($, e, next) => next(e),
  )
  on('ui.render', { component: 'Placed' }, ($, e, next) => drawPlaced($, e, next)).catch(($, e, next) => next(e))
}
