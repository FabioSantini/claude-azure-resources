// Whether a folder may be scanned: never the user's home folder nor a filesystem or drive root,
// where "the project" would hold every key and token of the machine, nor a folder inside a secret folder.
import { SECRET_FOLDERS } from './file-guard'
import { normalSegments } from './path-segments'

export type FolderHost = {
  fs: { stat: (path: string, options: { resolve: boolean }) => Promise<{ realPath?: string }> }
  env: { get: (name: string) => Promise<string | undefined> }
}

/** Forward slashes, no trailing slash, lower case when it is a Windows path. */
function normal(path: string): string {
  const s = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[A-Za-z]:/.test(s) ? s.toLowerCase() : s
}

/** A filesystem root (`/`), a drive root (`C:`) or a network share root (`//server/share`). */
function isRoot(folder: string): boolean {
  if (folder === '' || /^[a-z]:$/.test(folder)) return true
  return folder.startsWith('//') && folder.slice(2).split('/').filter((s) => s !== '').length <= 2
}

// The folders that hold every user's home: /home, /Users, <drive>:/Users.
const HOME_CONTAINER = /^(\/home|\/users|[a-z]:\/users)$/i

/** True for a root, a home container, or a home folder given or one of its ancestors. Pure. */
export function isRootOrHome(folder: string, homes: readonly string[]): boolean {
  const f = normal(folder)
  const holdsHome = (h: string) => h.trim() !== '' && (normal(h) === f || normal(h).startsWith(`${f}/`))
  return isRoot(f) || HOME_CONTAINER.test(f) || homes.some(holdsHome)
}

const SECRET_DIRS = new Set(SECRET_FOLDERS.map((f) => f.toLowerCase()))

/** True for a folder with any path segment named like a secret folder (.git, .ssh, .claude, vault...). Pure. */
export function isInSecretFolder(folder: string): boolean {
  return normalSegments(folder).some((s) => SECRET_DIRS.has(s))
}

const isRefused = (folder: string, homes: readonly string[]): boolean => isRootOrHome(folder, homes) || isInSecretFolder(folder)

/** Where a path lands, links followed; the path itself when it cannot be resolved. */
async function realOf($: FolderHost, path: string): Promise<string> {
  return (await $.fs.stat(path, { resolve: true }).catch(() => undefined))?.realPath ?? path
}

async function homesOf($: FolderHost): Promise<string[]> {
  const get = (v: Promise<string | undefined>) => v.catch(() => undefined)
  const named = [await get($.env.get('USERPROFILE')), await get($.env.get('HOME'))]
  const homes = named.filter((h): h is string => typeof h === 'string' && h.trim() !== '')
  return [...homes, ...(await Promise.all(homes.map((h) => realOf($, h))))]
}

/** False when the folder, or where it lands, is a root, a home folder or above one, or inside a secret folder. */
export async function isScannableFolder($: FolderHost, cwd: string): Promise<boolean> {
  const homes = await homesOf($)
  return !isRefused(cwd, homes) && !isRefused(await realOf($, cwd), homes)
}
