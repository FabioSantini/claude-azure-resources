// New rows of azure.md (report_resources, the recorder): queued for a refresh, then shown;
// at most `parallel` az lookups at a time, each row once while it has no snapshot.
import type { IndexRow } from '../types'
import { readView, refreshOne, showRows } from './snapshots'

type Host = Parameters<typeof refreshOne>[0] & Parameters<typeof showRows>[0]
export type RefreshOpts = { azPython: string; parallel: number }
// Each queued row keeps the host and options that queued it, in its own closure (the engine
// refuses $ stored in an object).
type Job = { id: string; limit: number; run: () => Promise<unknown> }

// Ids queued or being refreshed; a row already here is not queued again.
const pending = new Set<string>()
const waiting: Job[] = []
let active = 0

/** Synchronous: whether a refresh of this row is queued or in flight. */
export const isPending = (id: string): boolean => pending.has(id)

function pump(): void {
  while (waiting.length > 0 && active < (waiting[0] as Job).limit) {
    const job = waiting.shift() as Job
    active++
    void job.run().finally(() => {
      active--
      pending.delete(job.id)
      pump()
    })
  }
}

/** Queues one row's refresh; `run` closes over the host and options of the caller. False if already pending. */
export function enqueue(id: string, limit: number, run: () => Promise<unknown>): boolean {
  if (pending.has(id)) return false
  pending.add(id)
  waiting.push({ id, limit: Math.max(1, Math.floor(limit) || 1), run })
  pump()
  return true
}

/** Queues a refresh for each row with no snapshot yet. Never rejects. */
export async function refreshMissing($: Host, list: IndexRow[], opts: RefreshOpts): Promise<void> {
  try {
    const { snaps } = await readView($)
    for (const r of list) {
      if (Object.hasOwn(snaps, r.id)) continue
      const id = r.id
      enqueue(id, opts.parallel, () => refreshOne($, opts.azPython, id))
    }
  } catch {
    // the next Update refreshes them
  }
}

/** Queues the new rows' refresh, then shows them, so their cards already read Loading…. Never rejects. */
export async function showNewRows($: Host, cwd: string, list: IndexRow[], opts: RefreshOpts): Promise<void> {
  await refreshMissing($, list, opts)
  await showRows($, cwd, list)
}
