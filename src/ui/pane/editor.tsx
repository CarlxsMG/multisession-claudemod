// The pane's editor: the orchestrator's look and personality, part by part.
import type { EditTab, Look } from '../../../types'
import type { Engine } from '../../engine'
import { nameColorOf } from '../../figure/accent'
import type { Anim } from '../../figure/anim'
import {
  ACCS,
  COLORS,
  EYES,
  FACIALS,
  HAIRS,
  MOUTHS,
  NAME_COLORS,
  SHIRTS,
  SKINS,
  pictureRows,
} from '../../figure/catalog'
import type { Named } from '../../figure/catalog'
import { hex, paintColor } from '../../figure/color256'
import { picture } from '../../figure/critter'
import { defaultLook, randomLookFor } from '../../figure/look'
import { lookCode, parseLookCode } from '../../figure/share-code'
import { t } from '../../i18n'
import type { Messages } from '../../i18n/en'
import { VIBES, vibeOf } from '../../persona/vibes'
import { changeLook } from '../../settings/look'
import { readEditTab, updateEditTab, updateView } from '../../state/atoms'
import { pane } from './animation'
import { ORCH_SEED } from './widgets'
import type { PaneUi, Sprite } from './widgets'

// The columns a part's name takes before its ◀ value ▶.
const LABEL_COLUMNS = 10

/**
 * The orchestrator's editor: its preview, cheering for each change, and its
 * parts by tab, each press drawn at once.
 */
export async function drawEditor($: Engine, ui: PaneUi, sprite: Sprite, look: Look, width: number, height: number) {
  const { Box, Text, Button } = ui
  const Input = 'Input' in ui ? ui.Input : undefined
  const tab = await readEditTab($)
  const words = t().editor
  const vibe = vibeOf(look)
  const poses: Anim[] = ['idle', 'working', 'happy', 'delegating', 'thinking']
  // Twice the size where the editor still fits whole: the preview and
  // some twenty rows of tabs and controls.
  const scale = width >= 40 && height >= 2 * pictureRows(true) + 20 ? 2 : 1
  const preview = sprite(
    'preview',
    f =>
      f - pane.changedFrame < 4
        ? picture(look, { anim: 'happy', frame: f, since: pane.changedFrame, seed: ORCH_SEED, podium: true })
        : picture(look, { anim: poses[Math.floor(f / 24) % poses.length]!, frame: f, seed: ORCH_SEED, podium: true }),
    scale,
    words.previewAlt(look.name),
  )

  const tabs = Object.entries(words.tabs) as [EditTab, string][]
  const menu = (
    <Box flexDirection="column">
      {tabs.map(([id, label]) => (
        <Button key={`tab-${id}`} plain label={label} onPress={() => void updateEditTab($, () => id)}>
          <Text bold={id === tab} color={id === tab ? 'claude' : 'text'} dimColor={id !== tab}>
            {id === tab ? `▸ ${label}` : `  ${label}`}
          </Text>
        </Button>
      ))}
    </Box>
  )

  // One row per part: ◀ value ▶, each press drawn at once. Every value
  // takes the widest one's room, so the arrows line up down the rows.
  const VALUE = Math.max(...Object.values(t().parts).flatMap(names => Object.values(names).map(name => name.length)))
  const stepper = (id: string, label: string, options: readonly { label: string; pick: Partial<Look> }[], at: number) => {
    const i = Math.max(0, at)
    const step = (by: number) => () =>
      void changeLook($, options[(i + by + options.length) % options.length]!.pick)
    return (
      <Box flexDirection="row" columnGap={1}>
        <Text dimColor>{label.padEnd(LABEL_COLUMNS)}</Text>
        <Button key={`prev-${id}`} plain label={words.previous(label)} onPress={step(-1)}>
          <Text bold color="claude">◀</Text>
        </Button>
        <Text bold>{(options[i]?.label ?? '').padEnd(VALUE)}</Text>
        <Button key={`next-${id}`} plain label={words.next(label)} onPress={step(1)}>
          <Text bold color="claude">▶</Text>
        </Button>
        <Text dimColor>{`${i + 1}/${options.length}`}</Text>
      </Box>
    )
  }
  // The name's color beside the name: ◀ ██ ▶.
  const recolor = (by: number) => () =>
    void changeLook($, { nameColor: (look.nameColor + by + NAME_COLORS.length) % NAME_COLORS.length })
  const nameColorStepper = (
    <Box flexDirection="row">
      <Button key="prev-nameColor" plain label={words.previous(words.nameColor)} onPress={recolor(-1)}>
        <Text bold color="claude"> ◀ </Text>
      </Button>
      <Text backgroundColor={nameColorOf(look)}>{'  '}</Text>
      <Button key="next-nameColor" plain label={words.next(words.nameColor)} onPress={recolor(1)}>
        <Text bold color="claude"> ▶ </Text>
      </Button>
    </Box>
  )
  const part = (key: keyof Messages['parts'], label: string, table: Record<string, unknown>) => {
    const keys = Object.keys(table)
    const names: Record<string, string> = t().parts[key]
    const options = keys.map(value => ({ label: names[value] ?? value, pick: { [key]: value } as Partial<Look> }))
    return stepper(key, label, options, keys.indexOf(look[key]))
  }

  // A palette to click: the color in use between brackets. A swatch is
  // painted background, which fills its cells in any font, as blocks may not.
  const colorName = (id: string): string => (t().colors as Record<string, string>)[id] ?? id
  const swatches = (key: 'skin' | 'hairColor' | 'shirtColor' | 'pants' | 'shoes' | 'accColor', label: string, list: Named) => (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>{label} · </Text>
        <Text bold>{colorName(list[look[key]]?.[0] ?? '')}</Text>
      </Text>
      <Box flexDirection="row" flexWrap="wrap">
        {list.map(([id, color], i) => (
          <Button key={`${key}-${i}`} plain label={`${label}: ${colorName(id)}`} onPress={() => void changeLook($, { [key]: i } as Partial<Look>)}>
            <Text bold>{i === look[key] ? '[' : ' '}</Text>
            <Text backgroundColor={paintColor(hex(color))}>{'  '}</Text>
            <Text bold>{i === look[key] ? ']' : ' '}</Text>
          </Button>
        ))}
      </Box>
    </Box>
  )

  const controls =
    tab === 'face' ? (
      <Box flexDirection="column" gap={1}>
        {swatches('skin', words.fur, SKINS)}
        <Box flexDirection="column">
          {part('eyes', words.eyes, EYES)}
          {part('mouth', words.mouth, MOUTHS)}
          {part('facial', words.facial, FACIALS)}
          {stepper('blush', words.cheeks, [
            { label: words.cheeksPlain, pick: { blush: false } },
            { label: words.cheeksBlush, pick: { blush: true } },
          ], look.blush ? 1 : 0)}
        </Box>
      </Box>
    ) : tab === 'hair' ? (
      <Box flexDirection="column" gap={1}>
        {part('hair', words.shape, HAIRS)}
        {swatches('hairColor', words.color, COLORS)}
      </Box>
    ) : tab === 'clothes' ? (
      <Box flexDirection="column" gap={1}>
        {part('shirt', words.markings, SHIRTS)}
        {swatches('shirtColor', words.color, COLORS)}
        {swatches('pants', words.paws, COLORS)}
        {swatches('shoes', words.feet, COLORS)}
      </Box>
    ) : tab === 'extras' ? (
      <Box flexDirection="column" gap={1}>
        {part('acc', words.accessory, ACCS)}
        {swatches('accColor', words.color, COLORS)}
      </Box>
    ) : tab === 'persona' ? (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center">
          {Input && (
            <Box flexGrow={1} flexShrink={0} minWidth={24}>
              <Input key="look-name" label={words.name} placeholder={look.name} submitLabel={words.save} onSubmit={v => void changeLook($, { name: v })} />
            </Box>
          )}
          {nameColorStepper}
        </Box>
        <Box flexDirection="column">
          <Text dimColor>{words.personality}</Text>
          <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
            {Object.keys(VIBES).map(id => (
              <Button
                key={`vibe-${id}`}
                label={vibeOf({ vibe: id }).label}
                {...(id === look.vibe ? { variant: 'primary' as const } : {})}
                onPress={() => void changeLook($, { vibe: id })}
              />
            ))}
          </Box>
          <Text dimColor italic wrap="truncate-end">
            {`“${vibe.lines.delegating?.[0]?.replace('{w}', t().editor.sampleWorker) ?? ''}” · “${vibe.lines.happy?.[0] ?? ''}”`}
          </Text>
        </Box>
      </Box>
    ) : (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row">
          <Button
            key="look-copy"
            label={words.copyCode}
            hotkey="c"
            onPress={p => {
              void $.ui.copy({ text: lookCode(look), surface: p.surface }).then(r =>
                $.ui.toast(r.isCopied ? words.copied(look.name) : lookCode(look)),
              )
            }}
          />
        </Box>
        {Input && (
          <Input
            key="look-import"
            label={words.import}
            placeholder={words.importHint}
            submitLabel={words.importVerb}
            onSubmit={v => {
              const parsed = parseLookCode(v)
              if (parsed === undefined) $.ui.toast(words.badCode)
              else void changeLook($, parsed)
            }}
          />
        )}
      </Box>
    )

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={nameColorOf(look)} wrap="truncate-end">
        {look.name} <Text color="text">· {vibe.label}</Text> <Text dimColor>· {words.heading}</Text>
      </Text>
      <Box flexDirection={width >= 36 ? 'row' : 'column'} gap={2}>
        {preview}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} justifyContent="space-between" gap={1}>
          <Box borderStyle="round" borderColor={nameColorOf(look)} paddingX={1} alignSelf="flex-start">
            <Text italic>{look.phrase}</Text>
          </Box>
          {menu}
        </Box>
      </Box>
      {controls}
      <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
        <Box flexDirection="row" columnGap={1}>
          <Button key="look-random" label={words.random} hotkey="r" onPress={() => void changeLook($, current => randomLookFor(current))} />
          <Button key="look-reset" label={words.reset} onPress={() => void changeLook($, defaultLook())} />
        </Box>
        <Button key="look-done" label={words.done} variant="primary" hotkey={words.doneKey} onPress={() => void updateView($, () => 'main')} />
      </Box>
    </Box>
  )
}
