// A check-in or a round's summary, placed in the conversation: display
// only, so the model and the transcript file never read it. The newest is
// whole; once another stands below it, a row folds to one line.
//  ─ crew · 2 active · round 6m
//    Pip   editing  6m  Edit app.ts
//    Bolt  reading  4m  Read README.md
import type { MatchedHook } from 'claude-code'

import type { Look } from '../../../types'
import { PLUGIN } from '../../config'
import type { Engine } from '../../engine'
import { accentOf, nameColorOf } from '../../figure/accent'
import type { Piece } from '../../progress/text/pieces'
import { checkInRows } from '../../progress/text/rows'
import { seeColumns } from '../../progress/tracker'
import { readCheckins, readLook } from '../../state/atoms'
import { hash } from '../../util/random'
import { END } from '../../words'
import { rowWidth } from './bubble'

// What a placed row's pieces look like: names in their worker's color.
function pieceStyle(piece: Piece, look: Look): { color?: string; bold?: boolean; dimColor?: boolean } {
  switch (piece.role) {
    case 'crew':
      return { color: nameColorOf(look), bold: true }
    case 'name':
      return { color: accentOf({ seed: hash(piece.id ?? '') }, look), bold: true }
    case 'done':
    case 'failed':
    case 'stopped':
      return { color: END[piece.role].color }
    case 'phase':
    case 'step':
      return {}
    default:
      return { dimColor: true }
  }
}

type DrawPlacedHook = MatchedHook<'ui.render', { component: 'Placed' }>
/** Draws a row the crew placed in the conversation, from the row it keeps. */
export async function drawPlaced($: Engine, e: Parameters<DrawPlacedHook>[1], next: Parameters<DrawPlacedHook>[2]) {
  if (e.props.plugin !== PLUGIN) return next(e)
  const list = await readCheckins($)
  const row = list.find(c => c.id === e.props.id)
  if (row === undefined) return next(e)
  seeColumns(e.viewport?.columns)
  const look = await readLook($)
  // An end's line, and a message's, stands apart: it neither folds nor
  // folds a check-in.
  const isWhole = list.findLast(c => c.kind === 'checkin' || c.kind === 'summary')?.id === row.id
  const width = e.viewport?.columns !== undefined ? rowWidth(e.viewport.columns) : Infinity
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      {checkInRows(isWhole && row.shown !== undefined ? { ...row, ...row.shown } : row, width, isWhole).map(pieces => (
        <Text wrap="truncate-end">
          {pieces.map(p => (
            <Text {...pieceStyle(p, look)}>{p.text}</Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}
