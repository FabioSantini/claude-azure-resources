// The scanner's file tools (Read, Glob): kept inside the project folder and away from secrets; Read only of project text files.
// A second layer under the agent type's tool list; it answers a deny reason, never throws.
// Lexical only: real-read.ts judges again where a path lands once links are followed.
import { normalSegments } from './path-segments'

/** The files Read may open: these extensions, or these exact names (case-insensitive). The denylist still wins. */
export const READ_EXTENSIONS: readonly string[] = ['.md', '.txt', '.bicep', '.tf', '.yml', '.yaml', '.json', '.ps1', '.sh', '.toml']
export const READ_NAMES: readonly string[] = ['dockerfile', 'makefile']
/** Secret files, by basename (case-insensitive; '*' is any run of characters). */
export const SECRET_NAMES: readonly string[] = [
  '.env*', '*.env', '*credential*', 'appsettings*.json', 'local.settings.json', '*.tfstate*', '*.tfvars*', '*secret*',
  '*.pem', '*.key', '*.pfx', '*.p12', '*.ppk*', 'id_*', '*.kdbx', '*.jks*', '*.keystore*', '.htpasswd*', '.pgpass*',
  '.npmrc*', '.pypirc*', '.netrc*', '.git-credentials', '*.publishsettings*', '.dockerconfigjson',
]
/** Secret folders: any path segment below the project folder with one of these names (case-insensitive). */
export const SECRET_FOLDERS: readonly string[] = [
  '.git', '.azure', '.ssh', '.aws', '.kube', '.docker', '.gnupg', '.config', '.claude', 'vault', 'secrets', 'node_modules',
]

export const OUTSIDE = 'azure-resources: the scanner may use files only inside the project folder, by absolute path, never secrets.'
const BAD_PATTERN = 'azure-resources: a scanner Glob pattern stays below its path: no .., no absolute prefix, no ~, no braces.'

const escape = (s: string) => s.replace(/[\\^$.+?()[\]{}|]/g, (c) => `\\${c}`)
const NAME_RES = SECRET_NAMES.map((g) => new RegExp(`^${g.split('*').map(escape).join('.*')}$`, 'i'))
const FOLDERS = new Set(SECRET_FOLDERS.map((f) => f.toLowerCase()))
const DRIVE = /^[A-Za-z]:\//
// Stream names (':'), short names ('~'), wildcards and control characters: never in a path the scanner opens.
const ODD = /[:~*?"<>|\x00-\x1f]/
// A Glob pattern leaving its path: any '..', a root, network or drive prefix, a home folder; braces could rebuild them.
const PATTERN_ESCAPE = /\.\.|^[\\/]|^[A-Za-z]:|[~{}]/

/** An absolute path as segments, or undefined when relative or odd. Windows drops trailing dots and spaces of a name. */
function segmentsOf(raw: string, folded: boolean): string[] | undefined {
  const path = raw.replace(/\\/g, '/')
  const drive = DRIVE.test(path) ? path.slice(0, 2) : ''
  if (!drive && !path.startsWith('/')) return undefined
  if (path.startsWith('//') || ODD.test(path.slice(drive.length))) return undefined
  const named = normalSegments(path.slice(drive.length), folded)
  // '' is a '..' (or all-dots) segment: never folded away, always refused.
  if (named.some((s) => s === '')) return undefined
  return drive ? [folded ? drive.toLowerCase() : drive, ...named] : named
}

/** The path's segments below the project folder, or undefined when it is not inside it. */
function below(raw: unknown, cwd: string): string[] | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  const folded = DRIVE.test(cwd.replace(/\\/g, '/'))
  const root = segmentsOf(cwd, folded)
  const p = segmentsOf(raw, folded)
  if (!root || !p || p.length < root.length) return undefined
  return root.every((s, i) => s === p[i]) ? p.slice(root.length) : undefined
}

const isSecret = (rel: readonly string[]): boolean =>
  rel.some((s) => FOLDERS.has(s.toLowerCase())) || (rel.length > 0 && NAME_RES.some((re) => re.test(rel[rel.length - 1]!)))

/** A file or folder the scanner may open: an absolute path inside the project folder, not a secret. */
export function isOpenable(raw: unknown, cwd: string): boolean {
  const rel = below(raw, cwd)
  return rel !== undefined && !isSecret(rel)
}

const isReadableName = (name: string): boolean => {
  const n = name.toLowerCase()
  return READ_NAMES.includes(n) || READ_EXTENSIONS.some((ext) => n.endsWith(ext) && n.length > ext.length)
}

/** A file Read may open: openable, and a project text file by its name. */
export function isReadable(raw: unknown, cwd: string): boolean {
  const rel = below(raw, cwd)
  return rel !== undefined && rel.length > 0 && !isSecret(rel) && isReadableName(rel[rel.length - 1]!)
}

const isSafePattern = (p: unknown): boolean => typeof p === 'string' && p !== '' && !PATTERN_ESCAPE.test(p)

/** The deny reason for a scanner's Read or Glob call, or undefined when it may run. Other tools: undefined. */
export function judgeFileCall(tool: string, input: Readonly<Record<string, unknown>>, cwd: string): string | undefined {
  if (tool === 'Read') return isReadable(input.file_path, cwd) ? undefined : OUTSIDE
  if (tool !== 'Glob') return undefined
  // Glob answers names only; its path is required, so the guard and the tool agree on the folder.
  if (!isOpenable(input.path, cwd)) return OUTSIDE
  return isSafePattern(input.pattern) ? undefined : BAD_PATTERN
}
