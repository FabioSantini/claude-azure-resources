// One resource card: name and status badge, type, key fields two per line, footer, optional All properties.
import type { IndexRow, Snapshot } from '../types'
import { dataLines, shortTime } from './props-view'
import { isPending } from './new-rows'
import { stripControls } from './sanitize'
import { keyFields, statusOf, typeColor, typeLabel, type KeyField, type Tone } from './type-catalog'

export type Ui = {
  Box: (p: Record<string, unknown>) => unknown
  Text: (p: Record<string, unknown>) => unknown
  Button: (p: Record<string, unknown>) => unknown
  Link: (p: Record<string, unknown>) => unknown
}

const MAX_LINE = 200
const LOADING = 'Loading…'
const NOT_REFRESHED = 'Not refreshed yet — press Refresh'
const MAX_LINK_LABEL = 60
const MAX_HREF = 2048

/** Control and bidi/format characters become spaces; a line is cut to `max` (200) characters. */
export function safeText(s: string, max = MAX_LINE): string {
  const clean = stripControls(s)
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export function errorText(code: string): string {
  if (code === 'not-logged-in') return 'Run az login in a terminal'
  if (code === 'not-found') return 'Not found on Azure'
  if (code === 'timeout') return 'Timed out'
  return `Failed: ${code.replace(/^failed:/, '')}`
}

const TONE_COLOR: Record<Tone, string | undefined> = { ok: 'success', busy: 'warning', bad: 'error', unknown: undefined }

function badge(snap: Snapshot | undefined): { text: string; tone: Tone } {
  return snap?.error ? { text: 'Error', tone: 'bad' } : statusOf(snap?.data)
}

function fieldValue(ui: Ui, f: KeyField, key: string) {
  const { Text, Link } = ui as any
  // A link only when the value needs no cleaning: what is opened is exactly what is shown, cut.
  if (f.isLink && stripControls(f.value) === f.value && f.value.length <= MAX_HREF) {
    return <Link key={key} href={f.value} label={safeText(f.value, MAX_LINK_LABEL)} />
  }
  return <Text key={key} wrap="truncate">{safeText(f.value)}</Text>
}

function fieldCell(ui: Ui, f: KeyField, key: string) {
  const { Box, Text } = ui as any
  return (
    <Box key={key} flexDirection="column" width="50%" paddingRight={1}>
      <Text dimColor>{safeText(f.label)}</Text>
      {fieldValue(ui, f, `${key}:v`)}
    </Box>
  )
}

function fieldRows(ui: Ui, row: IndexRow, snap: Snapshot | undefined) {
  const { Box } = ui as any
  // No snapshot yet: the fields show as — until the first refresh lands. An error keeps its own line.
  if (snap !== undefined && snap.data === undefined) return []
  const fields = keyFields(row.type, snap?.data, row)
  const out = []
  for (let i = 0; i < fields.length; i += 2) {
    const pair = fields.slice(i, i + 2)
    out.push(
      <Box key={`fields:${row.id}:${i}`} flexDirection="row">
        {pair.map((f, j) => fieldCell(ui, f, `field:${row.id}:${i + j}`))}
      </Box>,
    )
  }
  return out
}

function header(ui: Ui, row: IndexRow, snap: Snapshot | undefined) {
  const { Box, Text } = ui as any
  const b = badge(snap)
  const color = TONE_COLOR[b.tone]
  return (
    <Box key={`head:${row.id}`} flexDirection="row" justifyContent="space-between">
      <Text bold wrap="truncate">{safeText(row.name)}</Text>
      <Text color={color} dimColor={color === undefined}>{safeText(`● ${b.text}`)}</Text>
    </Box>
  )
}

type Actions = { onRefresh: () => void; isExpanded: boolean; onToggle: () => void }

function footer(ui: Ui, row: IndexRow, snap: Snapshot | undefined, a: Actions) {
  const { Box, Text, Button } = ui as any
  const status = snap?.error ? errorText(snap.error) : snap ? `Updated ${shortTime(snap.at)}` : isPending(row.id) ? LOADING : NOT_REFRESHED
  return (
    <Box key={`foot:${row.id}`} flexDirection="row" justifyContent="space-between" flexWrap="wrap">
      <Text key={`status:${row.id}`} color={snap?.error ? 'error' : undefined} dimColor={!snap?.error}>{safeText(status)}</Text>
      <Box key={`actions:${row.id}`} flexDirection="row" gap={1}>
        <Button key={`refresh:${row.id}`} onPress={a.onRefresh}>Refresh</Button>
        <Button key={`props:${row.id}`} onPress={a.onToggle}>{a.isExpanded ? 'Hide properties' : 'All properties'}</Button>
      </Box>
    </Box>
  )
}

export function Card(ui: Ui, row: IndexRow, snap: Snapshot | undefined, onRefresh: () => void, isExpanded: boolean, onToggle: () => void) {
  const { Box, Text } = ui as any
  return (
    <Box key={`card:${row.id}`} flexDirection="column" borderStyle="round" paddingX={1}>
      {header(ui, row, snap)}
      <Text color={typeColor(row.type)}>{safeText(typeLabel(row.type))}</Text>
      {fieldRows(ui, row, snap)}
      {footer(ui, row, snap, { onRefresh, isExpanded, onToggle })}
      {isExpanded &&
        dataLines(snap?.data).map((line, i) => (
          <Text key={`line:${row.id}:${i}`} dimColor>{safeText(line)}</Text>
        ))}
    </Box>
  )
}
