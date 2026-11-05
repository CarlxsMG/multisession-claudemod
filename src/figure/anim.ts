// What a figure does in each state, frame by frame: its pose, how it moves,
// and the mark over its head.
import { END } from '../ui/labels'
import { hash } from '../util/random'
import type { Glyph } from './raster'

/** The states a figure has a routine for. */
export type Anim =
  | 'idle'
  | 'sleep'
  | 'thinking'
  | 'working'
  | 'delegating'
  | 'happy'
  | 'starting'
  | 'waiting'
  | 'done'
  | 'failed'
  | 'stopped'

/** A figure at one frame of its state's routine (`seed` sets it apart from the others). */
export type Pose = {
  anim: Anim
  frame: number
  seed: number
  // 'in' or 'out' while a message just arrived or left
  mail?: 'in' | 'out'
  podium?: boolean
  // The frame the routine began on, to start it from its first beat.
  since?: number
}

/** Where an arm is. */
export type Arm = 'up' | 'high' | 'wave' | 'chin'

/**
 * What a figure does on one frame: how high it stands, its arms, its eyes,
 * and the mark over its head.
 */
export type Beat = {
  dy: number
  left?: Arm | undefined
  right?: Arm | undefined
  eyes?: 'left' | 'right' | 'up' | 'down' | 'closed' | undefined
  yawn?: boolean
  tap?: boolean
  mark?: string
  markColor?: number
}

const GOLD = 0xffd54f
const CYAN = 0x4dd0e1
const GREY = 0x90a4ae
const WHITE = 0xe0e0e0
const ORANGE = 0xffb74d
const GREEN = 0x66bb6a
/** The red of a figure's `!` mark, which the diamond's outline shares. */
export const RED = 0xef5350
// The envelope of a message that just went or came.
const PINK = 0xf06292
const SPIN = ['|', '/', '-', '\\']
// Every mark takes one cell, a corner of the row above the head.
const THINK = ['.', 'o', 'O']
const SEND = ['>', '>', '']
const SNORE = ['z', 'z', 'Z', '']
const HOP = [0, -1, -1, 0]
// What a waiting figure does now and then; 'rest' is nothing at all.
const IDLE_ACTS = ['look', 'wave', 'stretch', 'tap', 'look', 'rest'] as const

// Each mood is a short routine counted in frames and mostly still: a beat of
// action, then a pause.
function beat(anim: Anim, frame: number, seed: number): Beat {
  switch (anim) {
    case 'idle': {
      const at = frame % 30
      const act = IDLE_ACTS[hash(`${seed}:${Math.floor(frame / 30)}`) % IDLE_ACTS.length]!
      if (act === 'stretch' && at >= 16 && at < 24) {
        return { dy: -1, left: 'high', right: 'high', eyes: 'closed', yawn: at >= 18 && at < 22 }
      }
      // A slow breath, a blink, and one thing done in the middle of the round.
      const moves: Beat = { dy: at % 12 >= 10 ? -1 : 0, eyes: at === 6 || at === 27 ? 'closed' : undefined }
      if (at >= 16 && at < 24) {
        if (act === 'look') moves.eyes = at < 20 ? 'left' : 'right'
        else if (act === 'wave') moves.right = at % 2 === 0 ? 'high' : 'wave'
        else if (act === 'tap') moves.tap = at % 2 === 0
      }
      return moves
    }
    case 'thinking': {
      const at = frame % 16
      return {
        dy: 0,
        right: 'chin',
        eyes: at === 13 ? 'closed' : at >= 8 && at < 12 ? 'left' : 'up',
        mark: at % 8 < 6 ? THINK[Math.floor((at % 8) / 2)]! : '',
        markColor: WHITE,
      }
    }
    case 'working': {
      // Typing in bursts, with a look at the screen between them.
      const at = frame % 20
      if (!(at < 8 || (at >= 11 && at < 16))) {
        return { dy: 0, eyes: at === 18 ? 'closed' : undefined, mark: '·', markColor: GREY }
      }
      return {
        dy: at % 4 === 1 ? -1 : 0,
        left: frame % 2 === 0 ? 'up' : undefined,
        right: frame % 2 === 0 ? undefined : 'up',
        eyes: 'down',
        mark: SPIN[at % 4]!,
        markColor: GOLD,
      }
    }
    case 'delegating': {
      // Points at the teammate, waves it off, then waits.
      const at = frame % 12
      return {
        dy: 0,
        right: at < 5 ? 'up' : at < 9 ? (at % 2 === 0 ? 'high' : 'wave') : undefined,
        eyes: at < 5 ? 'right' : undefined,
        mark: SEND[Math.floor(at / 2) % 3]!,
        markColor: CYAN,
      }
    }
    case 'happy': {
      // Two hops, then the arms stay up a moment.
      const at = frame % 12
      const dy = at < 8 ? HOP[at % 4]! : 0
      const cheer = dy < 0 || (at >= 8 && at < 11)
      return {
        dy,
        left: cheer ? 'high' : undefined,
        right: cheer ? 'high' : undefined,
        mark: Math.floor(at / 2) % 2 === 0 ? '*' : '+',
        markColor: GOLD,
      }
    }
    case 'sleep':
      return { dy: 0, eyes: 'closed', mark: SNORE[Math.floor(frame / 3) % 4]!, markColor: GREY }
    case 'stopped':
      return { dy: 0, eyes: 'closed', mark: END.stopped.mark, markColor: GREY }
    case 'waiting': {
      // Looks around for whoever it waits on, then taps a foot.
      const at = frame % 16
      return {
        dy: 0,
        eyes: at < 4 ? 'left' : at >= 6 && at < 10 ? 'right' : undefined,
        tap: at >= 12 && at % 2 === 0,
        mark: at < 10 ? '?' : '',
        markColor: ORANGE,
      }
    }
    case 'starting': {
      const at = frame % 8
      return { dy: 0, right: at < 4 ? (at % 2 === 0 ? 'high' : 'wave') : undefined, mark: '+', markColor: CYAN }
    }
    case 'done': {
      const at = frame % 24
      return { dy: 0, eyes: at === 5 ? 'closed' : at >= 14 && at < 17 ? 'left' : undefined, mark: '✓', markColor: GREEN }
    }
    case 'failed':
      return { dy: 0, eyes: 'down', mark: frame % 8 < 5 ? '!' : '', markColor: RED }
  }
}

/**
 * Figures run out of step with one another, unless the pose says when its
 * routine began.
 */
export function poseTime(pose: Pose): number {
  return Math.max(0, pose.since !== undefined ? pose.frame - pose.since : pose.frame + (pose.seed % 97))
}

/** What a figure does at its pose's frame. */
export function poseBeat(pose: Pose): Beat {
  return beat(pose.anim, poseTime(pose), pose.seed)
}

/** The mark over the head on the right, and the mail on the left. */
export function glyphsOf(moves: Beat, pose: Pose, width: number): Glyph[] {
  const glyphs: Glyph[] = []
  if (moves.mark) glyphs.push({ col: width - moves.mark.length, row: 0, ch: moves.mark, color: moves.markColor ?? GREY })
  if (pose.mail !== undefined) {
    glyphs.push({ col: 0, row: 0, ch: pose.mail === 'in' ? '«' : '»', color: PINK })
  }
  return glyphs
}
