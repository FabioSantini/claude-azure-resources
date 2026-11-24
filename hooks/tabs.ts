// Tabs: the resources of one type each. The selected tab is an atom, read and written only here.
import { atom, read, update } from 'claude-code'
import type { IndexRow } from '../types'
import { typeLabel } from './type-catalog'

export type Tab = { key: string; label: string; count: number; rows: IndexRow[] }

export function groupByType(rows: IndexRow[]): Tab[] {
  const byKey = new Map<string, Tab>()
  for (const row of rows) {
    const key = row.type.toLowerCase()
    const tab = byKey.get(key) ?? { key, label: typeLabel(row.type), count: 0, rows: [] }
    tab.rows.push(row)
    tab.count++
    byKey.set(key, tab)
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function pickTab(tabs: Tab[], selected: string | undefined): Tab | undefined {
  return tabs.find((t) => t.key === selected) ?? tabs[0]
}

const selectedTab = atom({ plugin: 'azure-resources', key: 'selectedTab' } as const, '', { shape: 'selected-tab-1' })

export async function readSelectedTab($: Parameters<typeof read>[0]): Promise<string | undefined> {
  return (await read($, selectedTab)) || undefined
}

export async function selectTab($: Parameters<typeof update>[0], key: string): Promise<void> {
  await update($, selectedTab, () => key)
}
