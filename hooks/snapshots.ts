// Snapshots of `az resource show`, kept redacted in an atom and in $.store.
import { atom, read, update } from 'claude-code'
import { isArmId } from './arm-id'
import { runAz, type AzResult } from './az-run'
import { readRows } from './index-store'
import { redact, redactString } from './redact'
import type { Busy, IndexRow, Snapshot } from '../types'

export const snapshots = atom({ plugin: 'azure-resources', key: 'snapshots' } as const, {}, { shape: 'snapshots-1' })
export const rows = atom({ plugin: 'azure-resources', key: 'rows' } as const, [], { shape: 'rows-1' })
export const busy = atom({ plugin: 'azure-resources', key: 'busy' } as const, 'idle' as Busy, { shape: 'busy-1' })

export const STORE_KEY = 'snapshots-1'

type Store = { store: { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<void> } }
type Host = Parameters<typeof update>[0] & Store
type RefreshHost = Host & { process: { run: (argv: readonly string[], init?: { timeoutMs?: number }) => Promise<{ exitCode: number; stdout: string; stderr: string }> } }

export function errorCode(res: Extract<AzResult, { ok: false }>): string {
  return res.error === 'failed' ? `failed:${res.message}` : res.error
}

export function failedMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : 'unknown error'
  return `failed:${redactString(raw).slice(0, 200)}`
}

export async function fetchSnapshot($: Pick<RefreshHost, 'process'>, python: string, id: string, previous?: Snapshot): Promise<Snapshot> {
  const at = new Date().toISOString()
  if (!isArmId(id)) return { id, at, error: 'failed:not a valid resource id' }
  try {
    const res = await runAz($, python, ['resource', 'show', '--ids', id])
    if (res.ok) return { id, at, data: redact(res.data) }
    return { id, at, error: errorCode(res), ...(previous?.data !== undefined ? { data: previous.data } : {}) }
  } catch (e) {
    return { id, at, error: failedMessage(e) }
  }
}

export const MAX_STORED = 300

/** The newest `max` snapshots by `at`: $.store is one JSON for every project. */
export function pruneSnapshots(all: Record<string, Snapshot>, max = MAX_STORED): Record<string, Snapshot> {
  const newest = Object.values(all).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, max)
  const out: Record<string, Snapshot> = {}
  for (const s of newest) out[s.id] = s
  return out
}

/** Best-effort: a failed store write never reaches the caller. */
async function saveSnapshots($: Host): Promise<void> {
  try {
    await $.store.set(STORE_KEY, pruneSnapshots(await read($, snapshots)))
  } catch {
    // the cards keep their snapshots for this session
  }
}

async function refreshSnapshot($: RefreshHost, python: string, id: string): Promise<Snapshot> {
  const previous = (await read($, snapshots))[id]
  const snap = await fetchSnapshot($, python, id, previous)
  await update($, snapshots, (all) => ({ ...all, [id]: snap }))
  return snap
}

/** One card's Refresh. Never rejects. */
export async function refreshOne($: RefreshHost, python: string, id: string): Promise<Snapshot> {
  try {
    const snap = await refreshSnapshot($, python, id)
    await saveSnapshots($)
    return snap
  } catch (e) {
    return { id, at: new Date().toISOString(), error: failedMessage(e) }
  }
}

function toSnapshot(v: unknown): Snapshot | undefined {
  const o = v as Record<string, unknown> | null
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || typeof o.at !== 'string' || !isArmId(o.id)) return undefined
  const snap: Snapshot = { id: o.id, at: o.at }
  if (o.data !== undefined) snap.data = redact(o.data)
  if (typeof o.error === 'string') snap.error = o.error
  return snap
}

/** Keeps only valid entries (ARM id, id/at/data/error), data re-redacted; anything else stored is dropped. */
export function parseStored(stored: unknown): Record<string, Snapshot> {
  const out: Record<string, Snapshot> = {}
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out
  for (const v of Object.values(stored)) {
    const snap = toSnapshot(v)
    if (snap) out[snap.id] = snap
  }
  return out
}

/** Never rejects: a corrupt or unreadable store must not break the session. */
export async function loadSnapshots($: Host): Promise<void> {
  try {
    const kept = parseStored(await $.store.get(STORE_KEY))
    // A snapshot refreshed while the store was loading is newer than the stored one.
    if (Object.keys(kept).length > 0) await update($, snapshots, (cur) => ({ ...kept, ...cur }))
  } catch {
    // ignored on purpose
  }
}

async function inBatches(list: IndexRow[], size: number, work: (r: IndexRow) => Promise<unknown>): Promise<void> {
  const n = Math.max(1, Math.floor(size) || 1)
  for (let i = 0; i < list.length; i += n) await Promise.all(list.slice(i, i + n).map(work))
}

export const ALREADY_RUNNING = -1
// Set synchronously, before any await, so two concurrent calls cannot both start.
let running = false
// Whether a scan is still running: the scan tells this module, which cannot import it.
let isScanning: () => boolean = () => false
// The folder whose rows the `rows` atom holds, as this module's life saw it.
let rowsCwd: string | undefined

export const isUpdating = (): boolean => running

export function setScanProbe(probe: () => boolean): void {
  isScanning = probe
}

/** Re-reads azure.md and refreshes every card from Azure; returns the row count, or ALREADY_RUNNING. */
export async function updateAll(
  $: RefreshHost & Parameters<typeof readRows>[0],
  cwd: string,
  python: string,
  parallel: number,
): Promise<number> {
  if (running) return ALREADY_RUNNING
  running = true
  try {
    await update($, busy, () => 'update' as Busy)
    const list = await readRows($, cwd)
    rowsCwd = cwd
    await update($, rows, () => list)
    await inBatches(list, parallel, (r) => refreshSnapshot($, python, r.id).catch(() => undefined))
    await saveSnapshots($)
    return list.length
  } finally {
    running = false
    await update($, busy, () => (isScanning() ? 'scan' : 'idle') as Busy)
  }
}

/** New rows of azure.md reach a pane that already shows this folder's rows. Never rejects. */
export async function showRows($: Host, cwd: string, list: IndexRow[]): Promise<void> {
  try {
    if (rowsCwd !== undefined && rowsCwd !== cwd) return
    if ((await read($, rows)).length > 0) await update($, rows, () => list)
  } catch {
    // the next Update shows them
  }
}

/** What the pane draws; the atoms are read here because the module scan wants them in the reading file. */
export async function readView($: Host): Promise<{ rows: IndexRow[]; snaps: Record<string, Snapshot>; busy: Busy }> {
  return { rows: await read($, rows), snaps: await read($, snapshots), busy: await read($, busy) }
}

/** azure.md rows for a pane that has not refreshed yet; never rejects. */
export async function rowsFromFile($: Host & { session: { cwd: () => Promise<string> } } & Parameters<typeof readRows>[0]): Promise<IndexRow[]> {
  try {
    return await readRows($, await $.session.cwd())
  } catch {
    return []
  }
}

/** The busy state for the scan; the atom is written here because the module scan wants it in its own file. */
export async function readBusy($: Host): Promise<Busy> {
  return read($, busy)
}

export async function setBusy($: Host, value: Busy): Promise<void> {
  await update($, busy, () => value)
}
