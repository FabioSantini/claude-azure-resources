// Reads and writes <cwd>/azure.md; every write goes through one queue.
import { mergeRows, parseIndex, renderIndex } from './index-file'
import type { IndexRow, NewRow } from '../types'

export type StoreHost = {
  fs: {
    exists: (path: string) => Promise<boolean>
    read: (path: string) => Promise<string>
    write: (path: string, text: string) => Promise<void>
  }
}

let queue: Promise<unknown> = Promise.resolve()

export function indexPath(cwd: string): string {
  const sep = cwd.includes(String.fromCharCode(92)) ? String.fromCharCode(92) : '/'
  return `${cwd.replace(/[/\\]+$/, '')}${sep}azure.md`
}

// A missing file is empty; any other read failure throws so we never overwrite it.
async function readText($: StoreHost, path: string): Promise<string> {
  return (await $.fs.exists(path)) ? await $.fs.read(path) : ''
}

export async function readRows($: StoreHost, cwd: string): Promise<IndexRow[]> {
  return parseIndex(await readText($, indexPath(cwd))).rows
}

export function addRows($: StoreHost, cwd: string, incoming: NewRow[]): Promise<IndexRow[]> {
  const job = async (): Promise<IndexRow[]> => {
    const path = indexPath(cwd)
    const doc = parseIndex(await readText($, path))
    doc.rows = mergeRows(doc.rows, incoming, new Date().toISOString())
    await $.fs.write(path, renderIndex(doc))
    return doc.rows
  }
  const result = queue.then(job, job)
  queue = result.catch(() => undefined)
  return result
}
