import type { IndexDoc, IndexRow, NewRow } from '../types'
import { isArmId } from './arm-id'
import { stripControls } from './sanitize'

const COLUMNS = ['id', 'name', 'type', 'resourceGroup', 'subscription', 'source', 'firstSeen', 'lastSeen'] as const
const HEADER = `| ${COLUMNS.join(' | ')} |`
const SEPARATOR = `|${COLUMNS.map(() => '---').join('|')}|`
const TITLE = '# Azure resources\n\n'

// Control characters can never reach the file: a newline would forge a row.
const escapeCell = (v: string): string => stripControls(v).replace(/[\\|]/g, (c) => `\\${c}`)

// Splits one table line into trimmed cells; `\\` and `\|` are unescaped.
function splitCells(line: string): string[] {
  const body = line.trim().replace(/^\|/, '')
  const cells: string[] = []
  let cur = ''
  let atSeparator = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    atSeparator = false
    if (ch === '\\' && (body[i + 1] === '|' || body[i + 1] === '\\')) {
      cur += body[++i]
    } else if (ch === '|') {
      cells.push(cur.trim())
      cur = ''
      atSeparator = true
    } else cur += ch
  }
  if (!atSeparator) cells.push(cur.trim())
  return cells
}

function toRow(line: string): IndexRow | undefined {
  const c = splitCells(line)
  if (c.length !== COLUMNS.length) return undefined
  const [id = '', name = '', type = '', resourceGroup = '', subscription = '', source, firstSeen = '', lastSeen = ''] = c
  if (!id || (source !== 'hook' && source !== 'agent')) return undefined
  return { id, name, type, resourceGroup, subscription, source, firstSeen, lastSeen }
}

const isHeader = (line: string): boolean => /^\|\s*id\s*\|/i.test(line)
const SEPARATOR_LINE = /^\|\s*:?-{3,}/

export function parseIndex(md: string): IndexDoc {
  const lines = md.split('\n')
  const start = lines.findIndex(isHeader)
  if (start < 0) {
    const before = md === '' ? TITLE : md.endsWith('\n\n') ? md : md.endsWith('\n') ? `${md}\n` : `${md}\n\n`
    return { before, rows: [], badRows: [], after: '' }
  }
  // Rows start after the separator line, or right after the header when it has none.
  const first = SEPARATOR_LINE.test(lines[start + 1] ?? '') ? start + 2 : start + 1
  let end = first
  while (lines[end]?.startsWith('|')) end++
  const rows: IndexRow[] = []
  const badRows: string[] = []
  for (const line of lines.slice(first, end)) {
    const row = toRow(line.replace(/\r$/, ''))
    if (row) rows.push(row)
    else badRows.push(line)
  }
  return {
    before: lines.slice(0, start).map((l) => `${l}\n`).join(''),
    rows,
    badRows,
    after: lines.slice(end).join('\n'),
  }
}

// Returns the incoming row with its trimmed id, or undefined when it is not valid.
function normalize(n: NewRow): NewRow | undefined {
  const id = typeof n.id === 'string' ? n.id.trim() : ''
  if (n.source !== 'hook' && n.source !== 'agent') return undefined
  return isArmId(id) ? { ...n, id } : undefined
}

export function mergeRows(rows: IndexRow[], incoming: NewRow[], now: string): IndexRow[] {
  const out = rows.map((r) => ({ ...r }))
  const byId = new Map(out.map((r) => [r.id.toLowerCase(), r]))
  for (const raw of incoming) {
    const n = normalize(raw)
    if (!n) continue
    const key = n.id.toLowerCase()
    const found = byId.get(key)
    if (!found) {
      const row: IndexRow = { ...n, firstSeen: now, lastSeen: now }
      out.push(row)
      byId.set(key, row)
      continue
    }
    for (const k of ['name', 'type', 'resourceGroup', 'subscription'] as const) {
      if (!found[k]) found[k] = n[k]
    }
    found.lastSeen = now
  }
  return out
}

const renderRow = (r: IndexRow): string =>
  `| ${[r.id, r.name, r.type, r.resourceGroup, r.subscription, r.source, r.firstSeen, r.lastSeen].map(escapeCell).join(' | ')} |\n`

export function renderIndex(doc: IndexDoc): string {
  return (
    doc.before +
    `${HEADER}\n${SEPARATOR}\n` +
    doc.rows.map(renderRow).join('') +
    doc.badRows.map((l) => `${l}\n`).join('') +
    doc.after
  )
}
