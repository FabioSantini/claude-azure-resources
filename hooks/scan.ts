// The scan run: which agents are scanners, starting one, and what happens when it ends.
import { readBusy, setBusy, setScanProbe, updateAll } from './snapshots'
import { readRows } from './index-store'
import { SCANNER_TYPE } from './scan-spec'
import { isAllowedGroupName, scannerToolSet } from './agent-guard'
import { forgetIds } from './seen-ids'
import { isScannableFolder, type FolderHost } from './scan-folder'

export type ScanOpts = { azPython: string; parallel: number; memoryTools: readonly string[] }

type Listed = { id: string; type: string; status: string }
type Spawned = { agentId?: string; deny?: string }
/** What the scan needs of $ (a narrow shape keeps type-checking cheap). */
export type ScanHost = Parameters<typeof updateAll>[0] & FolderHost & {
  session: { cwd: () => Promise<string> }
  agent: {
    spawn: (args: { subagentType: string; prompt: string; description: string }) => Promise<Spawned>
    list: () => Promise<readonly Listed[]>
  }
}

export const SCAN_STARTED = 'Azure resources: scan started.'
export const SCAN_BUSY = 'Azure resources: busy, try again shortly.'
export const SCAN_FAILED = 'Azure resources: scan could not start.'
export const SCAN_NO_FOLDER = 'Azure resources: open a project folder to scan.'

// Every scanner id seen in this module's life: never shrinks, so a finished or resumed scanner stays guarded.
const guarded = new Set<string>()
// Scanners whose end has not been handled yet; `anonymous` counts started scans whose spawn answered no id.
const running = new Set<string>()
let anonymous = 0
// Scanner ends heard while a spawn has not answered yet, matched once it does.
const ended = new Set<string>()
let starting = false
let spawning = 0
let spawned: Promise<unknown> = Promise.resolve()
let scanning = false
let opts: ScanOpts = { azPython: '', parallel: 4, memoryTools: [] }
let toolSet = scannerToolSet()
// The project folder of the last scan started, for the scanner's file guard.
let scanCwd: string | undefined

export function configureScan(o: ScanOpts): void {
  opts = o
  toolSet = scannerToolSet(o.memoryTools)
  setScanProbe(() => scanning)
}

export const isGuarded = (agentId: string): boolean => guarded.has(agentId)

/** The configured memory tools, for the scanner agent type and its task. */
export const scanMemoryTools = (): readonly string[] => opts.memoryTools

/** What the guard lets a scanner call: the base tools, the configured memory tools and ToolSearch. */
export const scanToolSet = (): ReadonlySet<string> => toolSet

/** The project folder captured when the scan started; undefined when no scan runs (the scanner's file calls are then denied). */
export const scanFolder = (): string | undefined => scanCwd

/** Synchronous: false means the call is certainly not a scanner's. */
export const mayBeScanner = (agentId: string): boolean => guarded.has(agentId) || spawning > 0

/** Waits for scanner spawns in flight, so their ids are known. */
export const settleSpawns = (): Promise<unknown> => spawned.catch(() => undefined)

export function adopt(agentId: string | undefined): void {
  if (agentId) guarded.add(agentId)
}

/** Runs a scanner spawn, marking it in flight until its id is known. */
export function trackSpawn<T extends { agentId?: string }>(work: () => Promise<T>): Promise<T> {
  spawning++
  const job = work().then((r) => (adopt(r.agentId), r))
  spawned = Promise.all([spawned.catch(() => undefined), job.catch(() => undefined)])
  return job.finally(() => {
    spawning--
  })
}

export function scannerPrompt(cwd: string, groups: string[], memoryTools: readonly string[] = []): string {
  const known = `Project folder: ${cwd}. Resource groups already known: ${groups.length > 0 ? groups.join(', ') : 'none'}.`
  return memoryTools.length > 0 ? `${known} Memory tools you may use: ${memoryTools.join(', ')}.` : known
}

async function knownGroups($: ScanHost, cwd: string): Promise<string[]> {
  const rows = await readRows($, cwd)
  // Only names the guard's `-g` accepts, so the scanner is never told to run a refused command.
  return [...new Set(rows.map((r) => r.resourceGroup).filter(isAllowedGroupName))]
}

/** No scan runs from here: its project folder is dropped at once, so the scanner's file calls are denied. */
async function setIdle($: ScanHost): Promise<void> {
  scanning = false
  scanCwd = undefined
  forgetIds()
  await setBusy($, 'idle')
}

/** The scan is over: free the busy state, then refresh the cards. */
async function endScan($: ScanHost): Promise<void> {
  await setIdle($)
  await updateAll($, await $.session.cwd(), opts.azPython, opts.parallel)
}

const isLive = (status: string): boolean => status === 'pending' || status === 'running' || status === 'waiting'

async function spawnScanner($: ScanHost, cwd: string): Promise<Spawned> {
  const prompt = scannerPrompt(cwd, await knownGroups($, cwd), opts.memoryTools)
  return trackSpawn(() => $.agent.spawn({ subagentType: SCANNER_TYPE, prompt, description: 'Azure resources scan' }))
}

/** Ties the started scan to its scanner; one that already ended ends the scan now. */
function claim($: ScanHost, agentId: string | undefined): void {
  const gone = agentId ? ended.has(agentId) : ended.size > 0
  starting = false
  ended.clear()
  if (gone) void endScan($).catch(() => undefined)
  else if (agentId) running.add(agentId)
  else anonymous++ // no id: the scanner's agent.report ends it
}

/** Starts the scanner agent; answers the text the command shows. */
export async function startScan($: ScanHost, cwd: string): Promise<string> {
  if (scanning) return SCAN_BUSY
  scanning = true // set before any await, so two calls cannot both start
  try {
    if ((await readBusy($)) !== 'idle') {
      scanning = false
      return SCAN_BUSY
    }
    if (!(await isScannableFolder($, cwd))) {
      scanning = false
      return SCAN_NO_FOLDER
    }
    await setBusy($, 'scan')
    scanCwd = cwd
    starting = true
    const res = await spawnScanner($, cwd)
    if (res.deny !== undefined) throw new Error('refused')
    claim($, res.agentId)
    return SCAN_STARTED
  } catch {
    starting = false
    ended.clear()
    await setIdle($)
    return SCAN_FAILED
  }
}

/** A scanner's run ended (agent.report: completed, failed or stopped). */
export async function finishScan($: ScanHost, agentId: string): Promise<void> {
  if (running.delete(agentId)) return endScan($)
  if (anonymous > 0) {
    anonymous--
    return endScan($)
  }
  if (starting) ended.add(agentId)
}

/** After a reload: guard the scanners still listed, and free a busy state no live scanner holds. */
export async function adoptListed($: ScanHost): Promise<void> {
  const mine = (await $.agent.list()).filter((a) => a.type === SCANNER_TYPE)
  for (const a of mine) adopt(a.id)
  const live = mine.filter((a) => isLive(a.status))
  for (const a of live) running.add(a.id)
  if (live.length > 0) scanning = true
  else if ((await readBusy($)) === 'scan') await setIdle($)
}
