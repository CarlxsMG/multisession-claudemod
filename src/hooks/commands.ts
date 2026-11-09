// The `/crew` command and its verbs.
import type { MatchedHook } from 'claude-code'

import { messageWorker } from '../crew/message'
import { clearFinished } from '../crew/sync'
import { reachWorker } from '../crew/workers'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { randomLookFor } from '../figure/look'
import { lookCode, parseLookCode } from '../figure/share-code'
import { verbOf } from '../i18n'
import { parseEvery } from '../progress/check-in'
import { placeCheckIn, setEvery } from '../progress/placed'
import { seeCommandColumns } from '../progress/status'
import { crewReply } from '../prompts/commands'
import { changeLook } from '../settings/look'
import { setMode } from '../settings/notes'
import { readIsOn, readLook, updateView } from '../state/atoms'
import { openPane } from '../ui/pane/index'

type RunCrewCommandHook = MatchedHook<'command.run', { command: 'crew' }>
/** Runs `/crew` and its subcommands. */
export async function runCrewCommand($: Engine, e: Parameters<RunCrewCommandHook>[1]) {
  const args = e.args.trim()
  const verb = (args.split(/\s+/)[0] ?? '').toLowerCase()
  const rest = args.slice(verb.length).trim()
  const look = await readLook($)
  seeCommandColumns(e.presentation.columns)

  switch (verb === '' ? '' : verbOf(verb)) {
    case '':
      await updateView($, () => 'main')
      await openPane($)
      return { text: crewReply.opened(look.name) }
    case 'edit':
      await updateView($, () => 'edit')
      await openPane($, true)
      return { text: crewReply.editing(look.name) }
    case 'team':
      await updateView($, () => 'crew')
      await openPane($)
      return { text: crewReply.teamOpened(look.name) }
    case 'msg': {
      // Only the worker is split off: the message keeps its lines and spacing.
      const who = rest.split(/\s+/)[0] ?? ''
      const said = rest.slice(who.length).trim()
      // Nothing to say brings nobody back from the shelf.
      const worker = said === '' ? undefined : await reachWorker($, who)
      if (worker === undefined) return { text: crewReply.msgUsage }
      await messageWorker($, worker, said)
      return { text: crewReply.sent(worker.name) }
    }
    case 'code': {
      const code = lookCode(look)
      // The editor's toast sends the person here when a copy fails, so the code
      // is the answer also when a plugin denies this one, which rejects it.
      const copied = await quiet($, $.ui.copy({ text: code }), '/crew code')
      return { text: crewReply.code(look.name, copied?.isCopied === true, code) }
    }
    case 'import': {
      const parsed = parseLookCode(rest)
      if (parsed === undefined) return { text: crewReply.badCode }
      const saved = await changeLook($, parsed)
      return { text: crewReply.imported(saved.name) }
    }
    case 'random': {
      const saved = await changeLook($, current => randomLookFor(current))
      return { text: crewReply.newLook(saved.name) }
    }
    case 'mode': {
      const value = rest === 'on' ? true : rest === 'off' ? false : !(await readIsOn($))
      await setMode($, value)
      return { text: value ? crewReply.modeOn(look.name) : crewReply.modeOff(look.name) }
    }
    case 'clear': {
      await clearFinished($)
      return { text: crewReply.cleared }
    }
    case 'progress': {
      if (rest !== '') {
        const every = parseEvery(rest)
        if (every === undefined) return { text: crewReply.progressUsage }
        await setEvery($, every)
      }
      // A command's text is stored where the model reads it, so it says
      // nothing: the row placed in the conversation, which no model reads,
      // says how the crew is doing and the interval.
      await placeCheckIn($, true)
      return {}
    }
    default:
      return { text: crewReply.help }
  }
}
