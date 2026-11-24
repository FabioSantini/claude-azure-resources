import { expect, test } from 'claude-code/testing'
import { stripControls } from './sanitize'
import { safeText } from './card'
import { mergeRows, parseIndex, renderIndex } from './index-file'

// U+00AD soft hyphen, U+061C Arabic letter mark, U+2060 word joiner, U+2064 invisible plus, ESC, U+2028.
const CODES = [0xad, 0x61c, 0x2060, 0x2064, 0x1b, 0x2028]
const dirty = 'a' + CODES.map((c) => String.fromCharCode(c)).join('') + 'b'
const clean = 'a' + ' '.repeat(CODES.length) + 'b'

test('stripControls turns control, format and line/paragraph separators into spaces', () => {
  expect(stripControls(dirty)).toBe(clean)
  expect(stripControls('plain text é')).toBe('plain text é')
})

test('safeText uses the shared sanitiser', () => {
  expect(safeText(dirty)).toBe(clean)
})

test('index cells use the shared sanitiser', () => {
  const id = '/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Web/sites/app'
  const rows = mergeRows([], [{ id, name: dirty, type: 't', resourceGroup: 'rg', subscription: 's1', source: 'hook' }], '2026-11-23T08:00:00Z')
  expect(parseIndex(renderIndex({ before: '', rows, badRows: [], after: '' })).rows[0]!.name).toBe(clean)
})
