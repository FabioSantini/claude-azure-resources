import { expect, test } from 'claude-code/testing'
import { mergeRows, parseIndex, renderIndex } from './index-file'
import type { NewRow } from '../types'

const HEADER =
  '| id | name | type | resourceGroup | subscription | source | firstSeen | lastSeen |\n' +
  '|---|---|---|---|---|---|---|---|\n'
const ROW_A =
  '| /subscriptions/s1/resourceGroups/rg/providers/Microsoft.Web/sites/app | app | Microsoft.Web/sites | rg | s1 | hook | 2026-11-01T10:00:00Z | 2026-11-02T10:00:00Z |\n'

const incoming = (over: Partial<NewRow> = {}): NewRow => ({
  id: '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Web/sites/app',
  name: 'app',
  type: 'Microsoft.Web/sites',
  resourceGroup: 'rg',
  subscription: 's1',
  source: 'hook',
  ...over,
})

test('parses the table and keeps prose', () => {
  const md = `# Azure resources\n\nSome notes of mine.\n\n${HEADER}${ROW_A}\nTrailing notes.\n`
  const doc = parseIndex(md)
  expect(doc.before).toBe('# Azure resources\n\nSome notes of mine.\n\n')
  expect(doc.after).toBe('\nTrailing notes.\n')
  expect(doc.rows.length).toBe(1)
  expect(doc.rows[0]).toEqual({
    id: '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Web/sites/app',
    name: 'app',
    type: 'Microsoft.Web/sites',
    resourceGroup: 'rg',
    subscription: 's1',
    source: 'hook',
    firstSeen: '2026-11-01T10:00:00Z',
    lastSeen: '2026-11-02T10:00:00Z',
  })
  expect(doc.badRows).toEqual([])
})

test('merge adds new and touches existing', () => {
  const rows = parseIndex(`${HEADER}${ROW_A}`).rows
  const now = '2026-11-23T08:00:00Z'
  const other = incoming({ id: '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Sql/servers/db', name: 'db', source: 'agent' })
  const merged = mergeRows(rows, [incoming({ name: '' }), other], now)
  expect(merged.length).toBe(2)
  expect(merged[0]!.lastSeen).toBe(now)
  expect(merged[0]!.firstSeen).toBe('2026-11-01T10:00:00Z')
  expect(merged[0]!.name).toBe('app')
  expect(merged[0]!.source).toBe('hook')
  expect(merged[1]!.name).toBe('db')
  expect(merged[1]!.firstSeen).toBe(now)
  expect(merged[1]!.lastSeen).toBe(now)
  expect(rows[0]!.lastSeen).toBe('2026-11-02T10:00:00Z')
})

test('merge fills empty fields of an existing row', () => {
  const rows = mergeRows([], [incoming({ type: '' })], '2026-11-23T08:00:00Z')
  const merged = mergeRows(rows, [incoming()], '2026-11-23T09:00:00Z')
  expect(merged.length).toBe(1)
  expect(merged[0]!.type).toBe('Microsoft.Web/sites')
})

test('merge is case-insensitive on id', () => {
  const rows = parseIndex(`${HEADER}${ROW_A}`).rows
  const upper = incoming({ id: incoming().id.toUpperCase() })
  const merged = mergeRows(rows, [upper], '2026-11-23T08:00:00Z')
  expect(merged.length).toBe(1)
  expect(merged[0]!.id).toBe(rows[0]!.id)
  expect(merged[0]!.lastSeen).toBe('2026-11-23T08:00:00Z')
})

test('malformed row is kept and skipped', () => {
  const bad = '| only | three | cells |\n'
  const badSource = '| /x | n | t | rg | s | manual | 2026-11-01T10:00:00Z | 2026-11-01T10:00:00Z |\n'
  const doc = parseIndex(`${HEADER}${ROW_A}${bad}${badSource}`)
  expect(doc.rows.length).toBe(1)
  expect(doc.badRows).toEqual([bad.trimEnd(), badSource.trimEnd()])
  const out = renderIndex(doc)
  expect(out).toContain(bad.trimEnd())
  expect(out).toContain(badSource.trimEnd())
})

test('round trip is byte-identical when nothing changes', () => {
  const md = `# Azure resources\n\nNotes.\n\n${HEADER}${ROW_A}| bad |\n\nAfter text\n`
  expect(renderIndex(parseIndex(md))).toBe(md)
})

test('empty input renders header and empty table', () => {
  expect(renderIndex(parseIndex(''))).toBe(`# Azure resources\n\n${HEADER}`)
})

test('prose without a table gets the table appended', () => {
  const out = renderIndex(parseIndex('# My notes\n'))
  expect(out).toBe(`# My notes\n\n${HEADER}`)
})

test('pipes inside a value survive a round trip', () => {
  const rows = mergeRows([], [incoming({ name: 'a|b' })], '2026-11-23T08:00:00Z')
  const md = renderIndex({ before: '', rows, badRows: [], after: '' })
  expect(parseIndex(md).rows[0]!.name).toBe('a|b')
})

test('round trip keeps a table that starts on line 1 without adding a title', () => {
  const md = `${HEADER}${ROW_A}`
  expect(renderIndex(parseIndex(md))).toBe(md)
})

const roundTrip = (over: Partial<NewRow>) => {
  const rows = mergeRows([], [incoming(over)], '2026-11-23T08:00:00Z')
  return parseIndex(renderIndex({ before: '', rows, badRows: [], after: '' }))
}

test('newline in a name cannot forge a row', () => {
  const forged = 'x |\n| /subscriptions/s9/forged | f | t | rg | s9 | hook | 2026-11-01T10:00:00Z | 2026-11-01T10:00:00Z'
  const doc = roundTrip({ name: forged, source: 'agent' })
  expect(doc.rows.length).toBe(1)
  expect(doc.rows[0]!.source).toBe('agent')
  expect(doc.badRows).toEqual([])
})

test('control characters are replaced', () => {
  const doc = roundTrip({ name: 'a\r\nb\tc\u0000d\u007fe' })
  expect(doc.rows[0]!.name).toBe('a  b c d e')
})

test('backslash and pipe round trip', () => {
  const bs = String.fromCharCode(92)
  for (const name of [`a${bs}b`, `a${bs}|b`, `a${bs}`, `a|b${bs}${bs}c`, `${bs}${bs}|`]) {
    expect(roundTrip({ name }).rows[0]!.name).toBe(name)
  }
})

test('mergeRows drops invalid source and non-ARM id', () => {
  const bad = [
    incoming({ source: 'manual' as 'hook' }),
    incoming({ id: '' }),
    incoming({ id: 'not-arm' }),
  ]
  expect(mergeRows([], bad, '2026-11-23T08:00:00Z')).toEqual([])
  const ok = mergeRows([], [incoming({ id: '/SUBSCRIPTIONS/s1/x' })], '2026-11-23T08:00:00Z')
  expect(ok.length).toBe(1)
})

test('ids differing only by surrounding whitespace dedupe to one row', () => {
  const id = incoming().id
  const rows = mergeRows([], [incoming({ id: `  ${id}` }), incoming({ id: `${id} ` })], '2026-11-23T08:00:00Z')
  expect(rows.length).toBe(1)
  expect(rows[0]!.id).toBe(id)
})

test('id with inner space or pipe is rejected', () => {
  const bs = String.fromCharCode(92)
  const ids = ['/subscriptions/s1/a b', '/subscriptions/s1/a|b', `/subscriptions/s1/a${bs}b`, `/subscriptions/s1/a${String.fromCharCode(10)}b`, '/subscriptions//x']
  expect(mergeRows([], ids.map((id) => incoming({ id })), '2026-11-23T08:00:00Z')).toEqual([])
})

test('unicode line separator and bidi controls are replaced', () => {
  const codes = [0x85, 0x9f, 0x2028, 0x2029, 0x200b, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069, 0xfeff]
  const name = 'a' + codes.map((c) => String.fromCharCode(c)).join('') + 'b'
  expect(roundTrip({ name }).rows[0]!.name).toBe('a' + ' '.repeat(codes.length) + 'b')
})

test('mergeRows uses the strict ARM id rule: trailing slash, query, percent, non-ASCII rejected', () => {
  const base = incoming().id
  const ids = [`${base}/`, `${base}?sig=abc`, `${base}%2F`, `${base}é`, `${base}/..`]
  expect(mergeRows([], ids.map((id) => incoming({ id })), '2026-11-23T08:00:00Z')).toEqual([])
})

const HEAD_LINE = HEADER.split('\n')[0]!

test('a header followed directly by a row keeps the row', () => {
  const doc = parseIndex(`${HEAD_LINE}\n${ROW_A}`)
  expect(doc.rows.length).toBe(1)
  expect(doc.rows[0]!.name).toBe('app')
  expect(renderIndex(doc)).toBe(`${HEADER}${ROW_A}`)
})

test('an aligned separator line is still recognised', () => {
  const doc = parseIndex(`${HEAD_LINE}\n| :--- | --- | --- | --- | --- | --- | --- | --- |\n${ROW_A}`)
  expect(doc.rows.length).toBe(1)
  expect(doc.badRows).toEqual([])
})

