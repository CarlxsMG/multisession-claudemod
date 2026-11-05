// A bubble's rows drawn on the terminal, with the press that opens a cut
// one whole or closes it.
import type { Elements } from 'claude-code'

import type { Engine } from '../../engine'
import { t } from '../../i18n'
import { readOpened, updateOpened } from '../../state/atoms'
import { appendKept } from '../../util/bounded'
import type { Seg } from './bubble'

type Press = { key: string; label: string; onPress: () => void }

// Every bubble sits on the left, whoever speaks. With `press`, its marked
// glyph is a plain Button that runs it: the pointer inverts that one cell,
// as it does any Button, and nothing else of the bubble.
function drawBubble(ui: Elements['terminal'], rows: readonly Seg[][], press?: Press) {
  const { Box, Text, Button } = ui
  const piece = (x: Seg) => (
    <Text {...(x.color !== undefined ? { color: x.color } : {})} bold={x.bold === true} dimColor={x.dim === true}>
      {x.text}
    </Text>
  )
  return (
    <Box flexDirection="column">
      {rows.map(row => {
        const at = press === undefined ? -1 : row.findIndex(x => x.press === true)
        if (press === undefined || at < 0) return <Text wrap="truncate-end">{row.map(piece)}</Text>
        return (
          <Box flexDirection="row">
            <Text wrap="truncate-end">{row.slice(0, at).map(piece)}</Text>
            <Button key={press.key} plain label={press.label} onPress={press.onPress}>
              {piece(row[at]!)}
            </Button>
            <Text wrap="truncate-end">{row.slice(at + 1).map(piece)}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

const OPENED_KEEP = 200

async function toggleOpened($: Engine, id: string) {
  await updateOpened($, list => (list.includes(id) ? list.filter(x => x !== id) : appendKept(list, [id], OPENED_KEEP)))
}

/**
 * A crew row's bubble, built by `build` with as many text rows as it shows.
 * Where the surface reports clicks (the fullscreen terminal) a long text is
 * cut to `max` rows and a click on its "…" opens it whole, and one on the
 * "▴" its bottom border then holds closes it; where it does not, nothing
 * could open it, so it is whole from the start. The full view (ctrl+o)
 * shows it whole too.
 */
export async function crewBubble(
  $: Engine,
  e: { requestId: string; viewport?: { isFullscreen?: boolean } },
  ui: Elements['terminal'],
  isExpanded: boolean,
  max: number,
  build: (rows: number, mark?: 'more' | 'less') => { rows: Seg[][]; isCut: boolean },
) {
  const canClick = e.viewport?.isFullscreen === true && !isExpanded
  const isWhole = canClick && (await readOpened($)).includes(e.requestId)
  const drawn = !canClick ? build(Infinity) : isWhole ? build(Infinity, 'less') : build(max, 'more')
  if (!drawn.rows.some(row => row.some(x => x.press === true))) return drawBubble(ui, drawn.rows)
  return drawBubble(ui, drawn.rows, {
    key: `${e.requestId}:${isWhole ? 'less' : 'more'}`,
    label: isWhole ? t().transcript.showLess : t().transcript.showAll,
    onPress: () => void toggleOpened($, e.requestId),
  })
}
