export type AzTarget =
  | { kind: 'ids'; ids: string[] }
  | { kind: 'named'; name: string; group: string; command: string }

/** Length of the separator starting at `i` (outside quotes), or 0. */
function separatorAt(s: string, i: number): number {
  const two = s.slice(i, i + 2)
  if (two === '&&' || two === '||' || two === '$(') return 2
  const c = s[i] as string
  return c === ';' || c === '|' || c === '&' || c === '\n' || c === '\r' || c === ')' ? 1 : 0
}

/** True when the raw line (quoting ignored) holds anything that can hide a second command. Never throws. */
export function hasShellMeta(commandLine: string): boolean {
  const s = String(commandLine ?? '')
  return /[`<>\\\n\r]|\$\(|\$\{/.test(s) || s.replace(/&&/g, '').includes('&')
}

function makeTokenizer() {
  const pieces: string[][] = []
  let tokens: string[] = []
  let cur = ''
  let has = false
  const endToken = () => {
    if (has) tokens.push(cur)
    cur = ''
    has = false
  }
  return {
    pieces,
    add(c: string) {
      cur += c
      has = true
    },
    mark() {
      has = true
    },
    endToken,
    endPiece() {
      endToken()
      if (tokens.length) pieces.push(tokens)
      tokens = []
    },
  }
}

/** Split a command line into tokenized pieces (quotes removed). Never throws. */
export function splitPieces(commandLine: string): string[][] {
  const s = String(commandLine ?? '').replace(/`\r?\n/g, ' ')
  const tk = makeTokenizer()
  let quote = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string
    const sep = quote ? 0 : separatorAt(s, i)
    if (quote) {
      if (c === quote) quote = ''
      else tk.add(c)
    } else if (c === '"' || c === "'") {
      quote = c
      tk.mark()
    } else if (sep) {
      tk.endPiece()
      i += sep - 1
    } else if (/\s/.test(c)) tk.endToken()
    else tk.add(c)
  }
  tk.endPiece()
  return tk.pieces
}

const isFlag = (t: string) => t.startsWith('-')

function flagValue(args: string[], names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const t = args[i] as string
    if (names.includes(t)) return args[i + 1]
    const eq = t.indexOf('=')
    if (eq > 0 && t.startsWith('--') && names.includes(t.slice(0, eq))) return t.slice(eq + 1)
  }
  return undefined
}

function idsOf(args: string[]): string[] | undefined {
  const at = args.indexOf('--ids')
  if (at < 0) return undefined
  const ids: string[] = []
  for (const t of args.slice(at + 1)) {
    if (isFlag(t)) break
    ids.push(t)
  }
  return ids
}

function targetOf(piece: string[]): AzTarget | undefined {
  const args = piece.slice(1)
  const firstFlag = args.findIndex(isFlag)
  const command = (firstFlag < 0 ? args : args.slice(0, firstFlag)).join(' ')
  const ids = idsOf(args)
  if (ids) {
    if (!ids.length || ids.some((x) => x.includes('$'))) return undefined
    return { kind: 'ids', ids }
  }
  const name = flagValue(args, ['--name', '-n'])
  const group = flagValue(args, ['--resource-group', '-g'])
  if (!name || !group || isFlag(name) || isFlag(group)) return undefined
  if (name.includes('$') || group.includes('$')) return undefined
  return { kind: 'named', name, group, command }
}

/** Azure resources targeted by the `az` invocations in a shell command line. */
export function extractTargets(commandLine: string): AzTarget[] {
  const out: AzTarget[] = []
  for (const piece of splitPieces(commandLine)) {
    const head = (piece[0] ?? '').toLowerCase()
    if (head !== 'az' && head !== 'az.cmd') continue
    const t = targetOf(piece)
    if (t) out.push(t)
  }
  return out
}
