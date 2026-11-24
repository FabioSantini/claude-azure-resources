// Turns what the scanner reports into index rows. Only the id is taken from the agent, and only an id its own
// az call returned in this scan; name, type, group and subscription are read off that id. At most MAX_ROWS.
import { armFields } from './arm-id'
import type { NewRow } from '../types'

export const MAX_ROWS = 500

function toRow(raw: unknown, seen: ReadonlyMap<string, string>): NewRow | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const given = (raw as { id?: unknown }).id
  const id = typeof given === 'string' ? seen.get(given.trim().toLowerCase()) : undefined
  const fields = id === undefined ? undefined : armFields(id)
  return fields && id ? { id, ...fields, source: 'agent' } : undefined
}

/** The rows among the first MAX_ROWS reported whose id az returned (seen: lower-cased id -> az's id). Never throws. */
export function agentRows(rows: unknown, seen: ReadonlyMap<string, string>): NewRow[] {
  if (!Array.isArray(rows)) return []
  return rows.slice(0, MAX_ROWS).flatMap((r) => {
    const row = toRow(r, seen)
    return row ? [row] : []
  })
}
