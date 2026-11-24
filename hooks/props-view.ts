// The "All properties" view of a card: which cards are open, the redacted data as lines minus the hidden keys.
import { atom, read, update } from 'claude-code'
import { HIDDEN_KEYS } from './type-catalog'

const MAX_LINES = 40

export const expanded = atom({ plugin: 'azure-resources', key: 'expanded' } as const, [] as string[], { shape: 'expanded-1' })

export async function readExpanded($: Parameters<typeof read>[0]): Promise<string[]> {
  return await read($, expanded)
}

/** Opens or closes one card; ids of cards not in `visible` are dropped, so the list stays as small as the view. */
export async function toggleExpanded($: Parameters<typeof update>[0], id: string, visible: readonly string[]): Promise<void> {
  await update($, expanded, (ids) => {
    const kept = ids.filter((x) => x !== id && visible.includes(x))
    return ids.includes(id) ? kept : [...kept, id]
  })
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The value without HIDDEN_KEYS at any depth (inside arrays too). */
export function withoutHidden(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutHidden)
  if (!isObj(v)) return v
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v)) if (!HIDDEN_KEYS.includes(k)) out[k] = withoutHidden(x)
  return out
}

function summary(v: unknown): string | undefined {
  if (Array.isArray(v)) return `[…] ${v.length} items`
  if (isObj(v)) return `{…} ${Object.keys(v).length} keys`
  return undefined
}

/** Key → value lines to a fixed depth of 2: root keys, then the first level inside objects. Hidden keys never appear. */
export function dataLines(data: unknown): string[] {
  const clean = withoutHidden(data)
  if (!isObj(clean)) return []
  const out: string[] = []
  for (const [k, v] of Object.entries(clean)) {
    out.push(`${k}: ${summary(v) ?? String(v)}`)
    if (isObj(v)) for (const [k2, v2] of Object.entries(v)) out.push(`  ${k2}: ${summary(v2) ?? String(v2)}`)
  }
  return out.length > MAX_LINES ? [...out.slice(0, MAX_LINES), `… ${out.length - MAX_LINES} more`] : out
}

const two = (n: number) => String(n).padStart(2, '0')

/** `dd/mm HH:MM` in local time; an unreadable time is returned as is. */
export function shortTime(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`
}
