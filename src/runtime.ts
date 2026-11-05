// What one load of the plugin keeps in memory beside its atoms: the
// bookkeeping its hooks, timers and drawings leave each other, which no
// other load reads. A reload reads afresh only the modules whose code
// changed, so it all lives here and a session's start sets it afresh in one
// place (`resetRuntime`), whatever modules the reload kept. Each part is
// read and written only by the module named over it; another module goes
// through that one's functions. It imports types only, so any module may
// import it whatever it imports itself.
import type { NoteFirst, Phase } from '../types'
import type { Cells } from './figure/raster'

/** A worker's tool calls since the pane's last frame: what it does now, and each call's kind and time. */
export type HeldCalls = { activity: string; calls: { kind: Phase | undefined; at: number }[] }

// Everything a session starts afresh, as a load starts it.
function fresh() {
  return {
    /** `src/crew/spawn.ts`: what an Agent call whose agent the crew named otherwise reads after its result, by tool_use_id. */
    spawn: { renamed: new Map<string, string>() },
    /**
     * `src/crew/relay.ts` and `src/crew/takeover.ts`: whether the next tick
     * sends on the messages that wait, and lifts the marks of runs that ended.
     * A load starts with relays due: messages a reload caught on their way
     * go on at the first tick.
     */
    due: { relay: true, release: false },
    /** `src/crew/workers.ts`: the names given in this load, the moment each is chosen. */
    names: { claimed: new Set<string>() },
    /**
     * `src/progress/tracker.ts`: the check-in interval in minutes (0 for off)
     * as the store keeps it (undefined before it is read: the default), the
     * status line as last pinned (undefined until the first progress tick
     * pins what is true then), the transcript's width as its rows were last
     * drawn and the terminal's as a command last ran, how long each worker's
     * last run took, and whether a progress tick is under way.
     */
    progress: {
      everyMin: undefined as number | undefined,
      statusShown: undefined as string | undefined,
      rowColumns: 0,
      commandColumns: 80,
      ranFor: new Map<string, number>(),
      isTicking: false,
    },
    /** `src/progress/calls.ts`: the workers' tool calls held for the pane's next frame. */
    calls: { held: new Map<string, HeldCalls>() },
    /** `src/usage/limits.ts`: whether this session may ask for the usage, and when it last did. */
    probe: { isAllowed: false, at: -Infinity },
    /**
     * `src/ui/pane/animation.ts`: the timer's frame, whether a surface that
     * draws the pane as a page has it open, the frame of the look's last
     * change, until when the last drawing had a bubble typing out, when a
     * worker it showed napping leaves the row or an end stops standing out
     * (0 for none), and the rasters it drew by key, each with how to draw any
     * frame and the cells it shows now.
     */
    pane: {
      frame: 0,
      asPage: false,
      changedFrame: -100,
      typingUntil: 0,
      napDue: 0,
      mounted: new Map<string, (frame: number) => Cells>(),
      blitted: new Map<string, string>(),
    },
    /** `src/ui/pane/index.tsx`: whether the pane opens with the first surface that attaches. */
    paneOpen: { isDue: false },
    /**
     * `src/crew/feed.ts`: what end-of-task rows drawn since the pane's last
     * frame were first drawn with, by request id, until that frame keeps it.
     */
    notes: { held: new Map<string, NoteFirst>() },
    /** `src/settings/notes.ts`: the conversation the last `[crew]` check was for. */
    told: { checked: undefined as string | undefined },
    /** `src/settings/mood-lines.ts`: the personality Haiku is writing lines for now, and one it could not. */
    lines: { writingSig: '', failedSig: '' },
    /** `src/engine.ts`: the kinds of engine text logged as unrecognized. */
    logged: { unrecognized: new Set<string>() },
  }
}

/**
 * What a session's start carries on: the chains that order work under way
 * (`src/crew/delegate.ts`'s delegate calls, `src/progress/calls.ts`'s
 * writes), which a call or a write an earlier session started still holds
 * its place in, and the count that keeps placed rows' ids apart
 * (`src/progress/tracker.ts`), as those rows outlive the load.
 */
const carried = {
  delegating: Promise.resolve() as Promise<unknown>,
  writing: Promise.resolve(),
  placedSeq: 0,
}

/**
 * The load's runtime state. Each part stays the same object, and
 * `resetRuntime` sets its fields: a module may hold a part, never a field's
 * map or set.
 */
export const runtime = { ...fresh(), carried }

/** Sets everything a session starts afresh as a load starts it; `carried` goes on. */
export function resetRuntime() {
  const next = fresh()
  for (const key of Object.keys(next) as (keyof typeof next)[]) Object.assign(runtime[key], next[key])
}
