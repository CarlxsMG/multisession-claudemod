// The session's own events: its start, the engine's measures, an app
// attaching, and the model it runs on.
import type { HookFor } from 'claude-code'

import type { MoodLines } from '../../types'
import { TICK_MS } from '../config'
import { enlist } from '../crew/feed'
import { relaySoon } from '../crew/relay'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { setPalette256 } from '../figure/color256'
import { defaultLook, normalizeLook } from '../figure/look'
import { t } from '../i18n'
import { settleLocale } from '../i18n/locale'
import { startProgress } from '../progress/tracker'
import { PROGRESS_SPEC, ROSTER_SPEC, delegateSpec } from '../prompts/tools'
import { checkConversation, freezeBrief } from '../settings/notes'
import {
  STORE_KEYS,
  readDropped,
  readMainModel,
  readWorkers,
  updateIsOn,
  updateLimits,
  updateLook,
  updateMainModel,
  updateMoodLines,
} from '../state/atoms'
import { tick } from '../ui/pane/animation'
import { APPLE_TYPE_TICK_MS, TYPE_TICK_MS, typeTick } from '../ui/pane/feed'
import { openPaneOnAttach, openPaneWhenShown } from '../ui/pane/index'
import { hasApp, probe, probeUsage, toLimits } from '../usage/limits'

/**
 * Reads the main session's model, or takes the one a switch names: the pane
 * alone is drawn again, and only when it changed.
 */
export async function readModel($: Engine, id = '') {
  const now = id !== '' ? id : await $.session.model().catch(() => '')
  if (now !== '' && now !== (await readMainModel($))) await updateMainModel($, () => now)
}

type OnSessionStartHook = HookFor<'session.start'>
/**
 * Sets the crew up for a session: the colors its terminal shows, what the
 * store kept, the timers, the `/crew` command and the pane.
 */
export async function onSessionStart($: Engine, e: Parameters<OnSessionStartHook>[1], next: Parameters<OnSessionStartHook>[2]) {
  await settleLocale($)
  // Terminal.app gets the engine's 256 colors unless it was told it shows
  // more (macOS 26 and later can): the figures pick theirs from those first.
  const isAppleTerminal = (await $.env.get('TERM_PROGRAM')) === 'Apple_Terminal'
  const isTruecolor = (await $.env.get('COLORTERM')) === 'truecolor' || (await $.env.get('FORCE_COLOR')) === '3'
  setPalette256(isAppleTerminal && !isTruecolor)
  const stored = await $.store.get(STORE_KEYS.look)
  await updateLook($, () => (stored !== undefined ? normalizeLook(stored) : defaultLook()))
  const storedOn = await $.store.get(STORE_KEYS.isOn)
  if (typeof storedOn === 'boolean') await updateIsOn($, () => storedOn)
  const storedLines = (await $.store.get(STORE_KEYS.lines)) as Partial<MoodLines> | undefined
  if (typeof storedLines?.sig === 'string' && typeof storedLines.moods === 'object' && storedLines.moods !== null) {
    const saved = { sig: storedLines.sig, moods: storedLines.moods }
    await updateMoodLines($, () => saved)
  }

  await $.command.register({
    name: 'crew',
    description: t().command.description,
    argumentHint: t().command.argumentHint,
  })
  await $.tool.register(delegateSpec(await freezeBrief($)))
  // A resumed conversation's latest note is the last one it got: when it no
  // longer matches the settings, the next message says so.
  await checkConversation($, true)
  await $.tool.register(ROSTER_SPEC)
  await $.tool.register(PROGRESS_SPEC)
  await enlist($, [...(await readDropped($)), ...(await readWorkers($))])
  // Messages a reload caught on their way go on at the first tick.
  relaySoon()
  $.clock.every(TICK_MS, () => tick($))
  $.clock.every(isAppleTerminal ? APPLE_TYPE_TICK_MS : TYPE_TICK_MS, () => typeTick($))
  await startProgress($)
  const usage = await quiet($, $.session.usage(), 'usage')
  if (usage?.rateLimits) await updateLimits($, () => toLimits(usage.rateLimits))
  await readModel($)
  // Only the person's own session asks: a headless one never does. The
  // desktop app and the editors run theirs as the SDK, not interactive,
  // with the app attached, now or once it attaches.
  probe.isAllowed = e.isInteractive || (await hasApp($))
  void probeUsage($)
  await openPaneWhenShown($)

  return next(e)
}

type OnMeasureHook = HookFor<'session.measure'>
/**
 * The engine measures after each turn and whenever a window moves a point.
 * Keeps the account's usage windows as the engine measured them.
 */
export async function onMeasure($: Engine, e: Parameters<OnMeasureHook>[1], next: Parameters<OnMeasureHook>[2]) {
  if (e.changed.includes('rateLimits')) {
    await updateLimits($, () => toLimits(e.rateLimits))
    void probeUsage($)
  }
  return next(e)
}

type OnAttachHook = HookFor<'session.attach'>
/**
 * The desktop app attaches after its session started: a person is there.
 * Opens the pane; an app's surface, not the terminal, also lets the usage
 * probe run.
 */
export async function onAttach($: Engine, e: Parameters<OnAttachHook>[1], next: Parameters<OnAttachHook>[2]) {
  const attached = await next(e)
  openPaneOnAttach($)
  if (!probe.isAllowed && e.surface !== 'terminal') {
    probe.isAllowed = true
    void probeUsage($)
  }
  return attached
}

type OnModelSwitchHook = HookFor<'classic.PostModelSwitch'>
/**
 * /model, the picker, a host, a fallback or a resume switched it. Takes the
 * model it switched to.
 */
export async function onModelSwitch($: Engine, e: Parameters<OnModelSwitchHook>[1], next: Parameters<OnModelSwitchHook>[2]) {
  await readModel($, e.to_model)
  return next(e)
}
