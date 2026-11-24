// Where a scanner's path really lands: symbolic links and junctions followed through $.fs.stat,
// then the same inside-and-not-secret check on the real path, against the real project folder.
import { isOpenable, OUTSIDE } from './file-guard'

/** $.fs.stat with { resolve: true }, narrowed to what the guard reads. */
export type StatFn = (path: string) => Promise<{ realPath?: string }>

const realOf = async (stat: StatFn, path: string): Promise<string | undefined> =>
  (await stat(path).catch(() => undefined))?.realPath

/** The deny reason when the path, once resolved, is outside the resolved project folder or a secret; denied when unresolvable. */
export async function judgeRealPath(path: string, cwd: string, stat: StatFn, check = isOpenable): Promise<string | undefined> {
  const [realPath, realCwd] = await Promise.all([realOf(stat, path), realOf(stat, cwd)])
  if (realPath === undefined || realCwd === undefined) return OUTSIDE
  return check(realPath, realCwd) ? undefined : OUTSIDE
}
