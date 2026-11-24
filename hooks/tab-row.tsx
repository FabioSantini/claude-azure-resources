// The tab row: colored names drawn by a Client where the surface has one, native buttons with a colored dot elsewhere.
import type { Register } from 'claude-code'
import { safeText } from './card'
import { readView, rowsFromFile } from './snapshots'
import { groupByType, selectTab, type Tab } from './tabs'
import type { TabNamesProps } from './tab-names-client'
import { typeColor } from './type-catalog'

type On = Parameters<Register>[0]

const CLIENT_KEY = 'tabs'
const CLIENT_MODULE = 'tab-names-client.tsx'
const MAX_KEY = 512

// Surfaces whose Client failed; the engine then draws the pane again and the buttons stand in there.
// A module variable: a reload clears it and the Client is tried again.
const failedOn = new Set<string>()

/** Only what the names draw: keys, safe labels, counts, colors and the selected key. No resource data. */
export function tabNamesProps(tabs: Tab[], selected: Tab | undefined): TabNamesProps {
  return {
    tabs: tabs.map((t) => ({ key: t.key, label: safeText(t.label), count: t.count, color: typeColor(t.key) })),
    selected: selected?.key ?? '',
  }
}

function fallbackRow(ui: any, tabs: Tab[], selected: Tab | undefined, onSelect: (key: string) => void) {
  const { Box, Text, Button } = ui
  return (
    <Box key={CLIENT_KEY} flexDirection="row" flexWrap="wrap" gap={1}>
      {tabs.map((t) => (
        <Button key={`tab:${t.key}`} variant={t === selected ? 'primary' : undefined} onPress={() => onSelect(t.key)}>
          <Text color={typeColor(t.key)}>●</Text> {safeText(`${t.label} ${t.count}`)}
        </Button>
      ))}
    </Box>
  )
}

// Only these surfaces run a Client; `$.ui.resolve` completes every table, so `ui.Client` is no test of it.
const CLIENT_SURFACES: readonly string[] = ['terminal', 'desktop']

/** Whether the tab row is a Client on this surface: one that has them, where it has not failed. */
export function usesClient(surface: string): boolean {
  return CLIENT_SURFACES.includes(surface) && !failedOn.has(surface)
}

export function tabRow(ui: any, surface: string, tabs: Tab[], selected: Tab | undefined, onSelect: (key: string) => void) {
  if (!usesClient(surface)) return fallbackRow(ui, tabs, selected, onSelect)
  const { Client } = ui
  return <Client key={CLIENT_KEY} module="./tab-names-client.tsx" props={tabNamesProps(tabs, selected)} />
}

function selection(data: unknown): string | undefined {
  if (data === null || typeof data !== 'object') return undefined
  const key = (data as { select?: unknown }).select
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY ? key : undefined
}

const isOurs = (e: { element: string; module: string }) => e.element === CLIENT_KEY && e.module.endsWith(CLIENT_MODULE)

type Host = Parameters<typeof readView>[0] & Parameters<typeof rowsFromFile>[0]

/** The keys of the tabs drawn now, from the same rows the pane draws. */
async function currentTabKeys($: Host): Promise<Set<string>> {
  const view = await readView($)
  const list = view.rows.length > 0 ? view.rows : await rowsFromFile($)
  return new Set(groupByType(list).map((t) => t.key))
}

/** A post from the names selects its tab only when the key is a tab drawn now. Never rejects. */
export async function onTabMessage($: Host, e: { element: string; module: string; data: unknown }): Promise<void> {
  const key = isOurs(e) ? selection(e.data) : undefined
  if (key === undefined) return
  try {
    if ((await currentTabKeys($)).has(key)) await selectTab($, key)
  } catch {
    // a selection that cannot be saved leaves the tab as it was
  }
}

/** The Client failed on this surface: the buttons stand in there from the next draw. */
export function onTabFault(e: { surface: string; element: string; module: string }): void {
  if (isOurs(e)) failedOn.add(e.surface)
}

/** A name picked in the Client selects its tab; a fault falls back to the buttons on that surface. */
export function registerTabEvents(on: On): void {
  on('ui.message', async ($, e, next) => {
    await onTabMessage($, e)
    return next(e)
  })
  on('ui.fault', ($, e, next) => {
    onTabFault(e)
    return next(e)
  })
}
