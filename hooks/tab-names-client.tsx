// Surface module: the tab row as colored names separated by a dim " | ". It holds no resource data;
// a pick goes back as `{ select: key }`. Self-contained on purpose: it runs on the drawing thread,
// without `$` and without the mod's other files.
import type { ClientKeyEvent, ClientModule, ClientPointerEvent, ClientSurface, RenderElement } from 'claude-code'

export type TabName = { key: string; label: string; count: number; color: string }
export type TabNamesProps = { tabs: TabName[]; selected: string }
type State = { focus: number }
export type Placed = { tab: TabName; x: number; y: number; width: number }

export const SEPARATOR = ' | '

const tabText = (t: TabName) => `${t.label} ${t.count}`

/** Where each name sits, in the region's cells: one row per line; a line never starts with a separator. */
export function placeTabs(tabs: TabName[], columns: number): Placed[][] {
  const limit = columns > 0 ? columns : Number.POSITIVE_INFINITY
  const lines: Placed[][] = []
  let current: Placed[] = []
  let end = 0
  for (const tab of tabs) {
    const width = tabText(tab).length
    const start = current.length === 0 ? 0 : end + SEPARATOR.length
    if (current.length > 0 && start + width > limit) {
      lines.push(current)
      current = [{ tab, x: 0, y: lines.length, width }]
      end = width
    } else {
      current.push({ tab, x: start, y: lines.length, width })
      end = start + width
    }
  }
  if (current.length > 0) lines.push(current)
  return lines
}

/** The name under a cell, or undefined for a separator, the end of a line or outside the names. */
export function tabAt(lines: Placed[][], x: number, y: number): TabName | undefined {
  for (const line of lines) {
    for (const p of line) {
      if (y === p.y && x >= p.x && x < p.x + p.width) return p.tab
    }
  }
  return undefined
}

function asProps(raw: unknown): TabNamesProps {
  const p = (raw ?? {}) as Partial<TabNamesProps>
  return { tabs: Array.isArray(p.tabs) ? p.tabs : [], selected: typeof p.selected === 'string' ? p.selected : '' }
}

function focusOf(s: ClientSurface<State>, props: TabNamesProps): number {
  const selected = props.tabs.findIndex((t) => t.key === props.selected)
  return s.state?.focus ?? Math.max(selected, 0)
}

function onKey(s: ClientSurface<State>, props: TabNamesProps, ev: ClientKeyEvent): void {
  const n = props.tabs.length
  if (n === 0) return
  const focus = Math.min(focusOf(s, props), n - 1)
  if (ev.key === 'right' || (ev.key === 'tab' && !ev.shift)) s.setState({ focus: (focus + 1) % n })
  else if (ev.key === 'left' || (ev.key === 'tab' && ev.shift)) s.setState({ focus: (focus + n - 1) % n })
  else if (ev.key === 'return' || ev.key === ' ') {
    const tab = props.tabs[focus]
    if (tab) s.post({ select: tab.key })
  }
}

function onPointer(s: ClientSurface<State>, lines: Placed[][], ev: ClientPointerEvent): void {
  if (ev.type !== 'down' || ev.button !== 'left') return
  const tab = tabAt(lines, ev.x, ev.y)
  if (tab) s.post({ select: tab.key })
}

function drawLine(s: ClientSurface<State>, line: Placed[], i: number, props: TabNamesProps, focus: number) {
  const { Box, Text } = s.elements
  const parts: RenderElement[] = []
  line.forEach((p, j) => {
    if (j > 0) parts.push(<Text key={`sep:${p.tab.key}`} dimColor>{SEPARATOR}</Text>)
    const isSelected = p.tab.key === props.selected
    const isFocused = props.tabs.indexOf(p.tab) === focus
    parts.push(
      <Text key={`tab:${p.tab.key}`} color={p.tab.color} bold={isSelected} underline={isSelected} inverse={isFocused}>
        {tabText(p.tab)}
      </Text>,
    )
  })
  return <Box key={`line:${i}`} flexDirection="row">{parts}</Box>
}

const TabNames: ClientModule<TabNamesProps, State> = (raw, s) => {
  const { Box } = s.elements
  const props = asProps(raw)
  const lines = placeTabs(props.tabs, s.columns)
  const focus = s.state === undefined ? -1 : focusOf(s, props)
  s.onPointer((ev) => onPointer(s, lines, ev))
  s.onKey((ev) => onKey(s, props, ev))
  return <Box flexDirection="column">{lines.map((line, i) => drawLine(s, line, i, props, focus))}</Box>
}

export default TabNames
