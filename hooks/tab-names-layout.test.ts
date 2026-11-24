// Where the names sit and which one a cell hits: one row per line, " | " between names, never at a line start.
import { expect, test } from 'claude-code/testing'
import { placeTabs, tabAt, type TabName } from './tab-names-client'

const tab = (key: string, label: string, count = 1): TabName => ({ key, label, count, color: '#000000' })
// "aaaa 1" is 6 cells; with " | " the second name starts at 9.
const A = tab('a', 'aaaa')
const B = tab('b', 'bbbb')
const C = tab('c', 'cccc')

test('names that do not fit wrap onto the next line, which starts with a name', () => {
  const lines = placeTabs([A, B, C], 20)
  expect(lines.map((l) => l.map((p) => [p.tab.key, p.x, p.y, p.width]))).toEqual([
    [['a', 0, 0, 6], ['b', 9, 0, 6]],
    [['c', 0, 1, 6]],
  ])
})

test('a name that exactly fills the line stays on it', () => {
  expect(placeTabs([A, B], 15)).toHaveLength(1)
  expect(placeTabs([A, B], 14)).toHaveLength(2)
})

test('with no width yet everything stays on one line', () => {
  expect(placeTabs([A, B, C], 0)).toHaveLength(1)
})

test('a name on the wrapped second line is clickable', () => {
  const lines = placeTabs([A, B, C], 20)
  expect(tabAt(lines, 0, 1)?.key).toBe('c')
  expect(tabAt(lines, 5, 1)?.key).toBe('c')
  expect(tabAt(lines, 6, 1)).toBeUndefined()
  expect(tabAt(lines, 0, 2)).toBeUndefined()
})

test('separator cells and the cells past a name are not clickable', () => {
  const lines = placeTabs([A, B], 80)
  expect(tabAt(lines, 5, 0)?.key).toBe('a')
  for (const x of [6, 7, 8]) expect(tabAt(lines, x, 0)).toBeUndefined()
  expect(tabAt(lines, 9, 0)?.key).toBe('b')
  expect(tabAt(lines, 14, 0)?.key).toBe('b')
  expect(tabAt(lines, 15, 0)).toBeUndefined()
})

test('a negative coordinate hits nothing', () => {
  const lines = placeTabs([A, B], 80)
  expect(tabAt(lines, -1, 0)).toBeUndefined()
  expect(tabAt(lines, 0, -1)).toBeUndefined()
})
