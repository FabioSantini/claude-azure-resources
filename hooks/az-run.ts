// The mod's own az calls: three read-only command shapes, no shell.
import { isArmId } from './arm-id'
import { redactString } from './redact'

export type AzResult =
  | { ok: true; data: unknown }
  | { ok: false; error: 'not-logged-in' | 'not-found' | 'timeout' | 'failed'; message: string }

type RunOut = { exitCode: number; stdout: string; stderr: string }
export type Runner = (argv: readonly string[], init?: { timeoutMs?: number }) => Promise<RunOut>
type AzHost = { process: { run: Runner } }

const LIST_FLAGS = new Set(['--name', '--resource-group'])
const LIST_VALUE = /^[A-Za-z0-9._()-]{1,90}$/

function isAllowedList(rest: readonly string[]): boolean {
  if (rest.length % 2 !== 0) return false
  const seen = new Set<string>()
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i]!
    if (!LIST_FLAGS.has(flag) || seen.has(flag) || !LIST_VALUE.test(rest[i + 1] ?? '')) return false
    seen.add(flag)
  }
  return true
}

export function isAllowedModArgs(args: readonly string[]): boolean {
  const [a, b, ...rest] = args
  if (a === 'account' && b === 'show') return rest.length === 0
  if (a === 'resource' && b === 'show') return rest.length === 2 && rest[0] === '--ids' && isArmId(rest[1] ?? '')
  if (a === 'resource' && b === 'list') return isAllowedList(rest)
  return false
}

const fail = (error: Extract<AzResult, { ok: false }>['error'], raw: string): AzResult => {
  const line = raw.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  return { ok: false, error, message: redactString(line).slice(0, 200) }
}

function classify(stderr: string): 'not-logged-in' | 'not-found' | 'failed' {
  if (/az login/i.test(stderr)) return 'not-logged-in'
  if (/ResourceNotFound|could not be found/i.test(stderr)) return 'not-found'
  return 'failed'
}

export async function runAz(
  $: AzHost,
  python: string,
  args: readonly string[],
  timeoutMs = 30000,
): Promise<AzResult> {
  if (!isAllowedModArgs(args)) throw new Error('az command not allowed')
  const run: Runner = (argv, init) => $.process.run(argv, init)
  let out: RunOut
  try {
    out = await run([python, '-IBm', 'azure.cli', ...args, '-o', 'json'], { timeoutMs })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return fail(/time(d)?[ -]?out/i.test(msg) ? 'timeout' : 'failed', msg)
  }
  if (out.exitCode !== 0) return fail(classify(out.stderr), out.stderr)
  try {
    return { ok: true, data: JSON.parse(out.stdout) }
  } catch {
    return fail('failed', 'az output was not valid JSON')
  }
}
