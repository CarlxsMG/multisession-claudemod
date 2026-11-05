// A crew row as a one-line card, where the surface draws pages (the desktop
// app, VS Code): the worker's figure, who to whom, the title and the foot, and
// a "▸" that opens the task or report whole beneath it:
//  ◆ Nova → Pip · Fix the tests · new                 ▸
//  ◆ Pip → Nova · ✓ done · 4m · Fix the tests
// What it says comes from the same reading of the row as the terminal's
// bubble.
import type { Elements } from 'claude-code'

import type { Look, Member } from '../../../types'
import type { Engine } from '../../engine'
import { accentHex } from '../../figure/accent'
import type { Anim } from '../../figure/anim'
import { diamondSvg } from '../../figure/diamond'
import { readOpened } from '../../state/atoms'
import { hash } from '../../util/random'
import { anyWorker, cardLine, rowWidth } from './bubble'
import type { Seg } from './bubble'
import { drawSeg, openPress } from './draw'

/** What a card shows. `title`: what its line holds of `text`, the whole a press opens. */
export type Card = { who: Member; look: Look; color: string; anim: Anim; names: Seg[]; title: string; foots: readonly (readonly Seg[])[]; text: string }

// The figure and the press take about these columns of the row. The surface's
// type is not the viewport's monospace cells, so this only keeps a line from
// reaching them; one it still finds too long truncates.
const CARD_CHROME_COLUMNS = 10
// The figure of a worker with no color of its own: `PLAIN`, which a figure's
// SVG cannot name as a theme's color.
const PLAIN_FIGURE = 0x90a4ae

function figureOf(who: Member, look: Look, anim: Anim): string {
  const seed = hash(who.id)
  const color = who.id === '' ? PLAIN_FIGURE : parseInt(accentHex({ seed }, look).slice(1), 16)
  return diamondSvg(seed, color, { anim, frame: 0, seed, since: 0 })
}

/**
 * Draws `card`, with its text whole under its line while a press holds it
 * open. A row's `isExpanded` plays no part: it opens nothing here, and a
 * surface with no ctrl+o may say it of every row. A line that holds the whole
 * text has nothing to open, so no press. The figure stands beside the text
 * and not in a Button, which holds only text; the "▸" is a Button of its own,
 * and the rest of the line stays text to read and select.
 */
export async function crewCard($: Engine, e: { requestId: string; viewport?: { columns: number } }, ui: Elements['desktop' | 'vscode'], card: Card) {
  const { Box, Text, Button, Svg, Markdown } = ui
  const { line, shown } = cardLine(card.names, card.title, card.foots, rowWidth(e.viewport?.columns) - CARD_CHROME_COLUMNS)
  const whole = card.text.trim()
  const canOpen = whole !== '' && whole !== shown
  const isOpen = canOpen && (await readOpened($)).includes(e.requestId)
  const press = canOpen ? openPress($, e.requestId, isOpen) : undefined
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={1}>
        <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={1}>
          <Svg source={figureOf(card.who, card.look, card.anim)} alt={card.who.name !== '' ? card.who.name : anyWorker().text} />
          <Text wrap="truncate-end">{line.map(x => drawSeg(Text, x))}</Text>
        </Box>
        {press !== undefined && (
          <Button key={press.key} plain label={press.label} onPress={press.onPress}>
            <Text color={card.color}>{isOpen ? '▴' : '▸'}</Text>
          </Button>
        )}
      </Box>
      {isOpen && <Markdown text={whole} />}
    </Box>
  )
}
