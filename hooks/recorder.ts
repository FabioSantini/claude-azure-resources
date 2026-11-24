// Records the Azure resources named by successful az commands into azure.md.
import { isArmId } from './arm-id'
import { extractTargets, type AzTarget } from './az-parse'
import { runQueued } from './az-queue'
import { runAz, type Runner } from './az-run'
import { addRows, readRows, type StoreHost } from './index-store'
import type { IndexRow, NewRow } from '../types'

export type RecorderHost = StoreHost & {
  session: { cwd: () => Promise<string> }
  process: { run: Runner }
}

export const MAX_TARGETS = 5

const ID_RE = /^\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)\/providers\/([^/]+)\/([^/]+)\/([^/]+)/i

// `cwd|name|group` already looked up (or being looked up) in this module's life.
const resolved = new Set<string>()

function rowFromId(id: string): NewRow | undefined {
  const m = isArmId(id) ? ID_RE.exec(id) : null
  if (!m) return undefined
  const [, subscription, resourceGroup, ns, type, name] = m
  return { id, name: name!, type: `${ns}/${type}`, resourceGroup: resourceGroup!, subscription: subscription!, source: 'hook' }
}

type Listed = { id?: unknown; name?: unknown; type?: unknown; resourceGroup?: unknown }

function rowFromListed(r: Listed): NewRow | undefined {
  if (typeof r.id !== 'string') return undefined
  const base = rowFromId(r.id)
  if (!base) return undefined
  const str = (v: unknown, d: string) => (typeof v === 'string' && v !== '' ? v : d)
  return { ...base, name: str(r.name, base.name), type: str(r.type, base.type), resourceGroup: str(r.resourceGroup, base.resourceGroup) }
}

const pair = (name: string, group: string) => `${name}|${group}`.toLowerCase()

async function knownPairs($: RecorderHost, cwd: string): Promise<Set<string>> {
  return new Set((await readRows($, cwd)).map((r) => pair(r.name, r.resourceGroup)))
}

/** One `resource list` through the global queue, unless the pair is known or already looked up. */
async function namedRows($: RecorderHost, python: string, cwd: string, t: Extract<AzTarget, { kind: 'named' }>, known: Set<string>): Promise<NewRow[]> {
  const key = `${cwd.toLowerCase()}|${pair(t.name, t.group)}`
  if (known.has(pair(t.name, t.group)) || resolved.has(key)) return []
  resolved.add(key)
  const res = await runQueued(() => runAz($, python, ['resource', 'list', '--name', t.name, '--resource-group', t.group]))
  if (!res?.ok || !Array.isArray(res.data)) {
    resolved.delete(key) // not answered: a later command may try again
    return []
  }
  return (res.data as Listed[]).flatMap((r) => rowFromListed(r ?? {}) ?? [])
}

async function rowsFor($: RecorderHost, python: string, cwd: string, targets: AzTarget[]): Promise<NewRow[]> {
  const rows: NewRow[] = []
  let known: Set<string> | undefined
  for (const t of targets) {
    if (t.kind === 'ids') rows.push(...t.ids.flatMap((id) => rowFromId(id) ?? []))
    else rows.push(...(await namedRows($, python, cwd, t, (known ??= await knownPairs($, cwd)))))
  }
  return rows
}

/** The first MAX_TARGETS az targets of a command line; none for anything else. Never throws. */
export function targetsOf(commandLine: string): AzTarget[] {
  try {
    return extractTargets(commandLine).slice(0, MAX_TARGETS)
  } catch {
    return []
  }
}

/** Never rejects: a recorder failure must not reach Claude's command. */
export async function recordTargets(
  $: RecorderHost,
  cwd: string,
  targets: AzTarget[],
  python: string,
  onAdded: (rows: IndexRow[]) => Promise<void> = async () => undefined,
): Promise<void> {
  try {
    const rows = await rowsFor($, python, cwd, targets)
    if (rows.length > 0) await onAdded(await addRows($, cwd, rows))
  } catch {
    // swallowed on purpose
  }
}

export function recordFromCommand($: RecorderHost, cwd: string, commandLine: string, python: string): Promise<void> {
  return recordTargets($, cwd, targetsOf(commandLine), python)
}

type Ran = { deny?: unknown; isError?: unknown; [k: string]: unknown }

/** Runs the tool, then records in the background; returns the result untouched. A command with no az target costs only its parse. */
export async function observeRun<R>(
  $: { session: { cwd: () => Promise<string> } },
  commandLine: string,
  next: () => Promise<R>,
  record: (cwd: string, targets: AzTarget[]) => Promise<void>,
): Promise<R> {
  const ran = await next()
  const flags = ran as Ran
  try {
    if (flags.deny !== undefined || flags.isError === true) return ran
    const targets = targetsOf(commandLine)
    if (targets.length > 0) void $.session.cwd().then((cwd) => record(cwd, targets)).catch(() => undefined)
  } catch {
    // never fail the command
  }
  return ran
}
