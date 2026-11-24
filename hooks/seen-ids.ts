// The resource ids the scanner got back from its own `az resource list` calls in the running scan:
// report_resources keeps only these, so a row cannot be made up from file text.
import { armFields } from './arm-id'

// Lower-cased id -> the id as az spelled it.
const seen = new Map<string, string>()
// Every "id": "/subscriptions/..." in az's JSON; read by pattern, so an output cut short still gives its whole ids.
const ID_FIELD = /"id"\s*:\s*"(\/subscriptions\/[^"]{1,600})"/g

/** The resource ids in az's JSON output, in order; anything not a strict resource id is skipped. Never throws. */
export function idsFromAzOutput(stdout: unknown): string[] {
  if (typeof stdout !== 'string') return []
  return [...stdout.matchAll(ID_FIELD)].map((m) => m[1]!).filter((id) => armFields(id) !== undefined)
}

/** Remembers the ids of one Bash result ({ result: { stdout } }) of the scanner. */
export function rememberIds(answer: unknown): void {
  const result = (answer as { result?: { stdout?: unknown } } | undefined)?.result
  for (const id of idsFromAzOutput(result?.stdout)) seen.set(id.toLowerCase(), id)
}

export const seenIds = (): ReadonlyMap<string, string> => seen

/** The scan ended: nothing seen in it counts any more. */
export function forgetIds(): void {
  seen.clear()
}
