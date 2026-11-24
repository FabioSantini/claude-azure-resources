import { expect, test } from 'claude-code/testing'
import { DEFAULT_AZ_PYTHON, readOptions } from './options'

test('azPython falls back to the manifest default unless a non-empty string', () => {
  expect(readOptions({}).azPython).toBe(DEFAULT_AZ_PYTHON)
  expect(readOptions({ azPython: '' }).azPython).toBe(DEFAULT_AZ_PYTHON)
  expect(readOptions({ azPython: 5 }).azPython).toBe(DEFAULT_AZ_PYTHON)
  expect(readOptions({ azPython: 'C:/py.exe' }).azPython).toBe('C:/py.exe')
})

test('refreshParallel is clamped to 1..8; non-numbers give 4', () => {
  const p = (v: unknown) => readOptions({ refreshParallel: v as number }).parallel
  expect(p(undefined)).toBe(4)
  expect(p('6')).toBe(4)
  expect(p(Number.NaN)).toBe(4)
  expect(p(0)).toBe(1)
  expect(p(-3)).toBe(1)
  expect(p(100)).toBe(8)
  expect(p(Number.POSITIVE_INFINITY)).toBe(8)
  expect(p(2.7)).toBe(2)
  expect(p(5)).toBe(5)
})

test('memoryTools: empty or non-string gives none', () => {
  expect(readOptions({}).memoryTools).toEqual([])
  expect(readOptions({ memoryTools: '' }).memoryTools).toEqual([])
  expect(readOptions({ memoryTools: '  , ,' }).memoryTools).toEqual([])
  expect(readOptions({ memoryTools: 5 }).memoryTools).toEqual([])
  expect(readOptions({ memoryTools: ['mcp__a__b'] }).memoryTools).toEqual([])
})

test('memoryTools: a comma-separated list of MCP tool names, trimmed and deduped', () => {
  const m = (v: string) => readOptions({ memoryTools: v }).memoryTools
  expect(m('mcp__my-memory__memory_search')).toEqual(['mcp__my-memory__memory_search'])
  expect(m(' mcp__a__search , mcp__b_x__list,mcp__a__search ')).toEqual(['mcp__a__search', 'mcp__b_x__list'])
})

test('memoryTools: invalid names are dropped', () => {
  const m = (v: string) => readOptions({ memoryTools: v }).memoryTools
  expect(m('Bash, Read, mcp__a, mcp____x, mcp__a__b c, mcp__a__b;rm, mcp__a.b__c, mcp__ok__memory_get')).toEqual(['mcp__ok__memory_get'])
  expect(m('mcp__a__*')).toEqual([])
})

test('memoryTools: tools whose name says they write or run are dropped', () => {
  const verbs = ['store', 'write', 'update', 'delete', 'create', 'set', 'add', 'remove', 'put', 'post', 'send', 'exec', 'run', 'upsert', 'ingest', 'harvest', 'cleanup', 'consolidate']
  for (const v of verbs) {
    expect(readOptions({ memoryTools: `mcp__mem__memory_${v}` }).memoryTools).toEqual([])
    expect(readOptions({ memoryTools: `mcp__mem__${v.toUpperCase()}_x` }).memoryTools).toEqual([])
  }
  expect(readOptions({ memoryTools: 'mcp__mem__x__memory_store' }).memoryTools).toEqual([])
  // The server part is not judged: a read tool of a server named after a verb stays.
  expect(readOptions({ memoryTools: 'mcp__postgres-mem__memory_search, mcp__mem__memory_list' }).memoryTools).toEqual([
    'mcp__postgres-mem__memory_search',
    'mcp__mem__memory_list',
  ])
})

test('memoryTools: only read tools by name are kept (allow-list on the tool part)', () => {
  const m = (v: string) => readOptions({ memoryTools: v }).memoryTools
  const ok = ['memory_search', 'memory_list', 'search', 'LIST', 'get_entry', 'read', 'find_x', 'query', 'recall', 'view', 'memory_detail', 'memory_explore']
  for (const t of ok) expect(m(`mcp__mem__${t}`)).toEqual([`mcp__mem__${t}`])
  const bad = ['memory_store', 'memory_cleanup', 'run_query', 'foo', 'tool', 'searcher', 'get_and_delete', 'list_then_update', 'memory_search_store', 'x_search']
  for (const t of bad) expect(m(`mcp__mem__${t}`)).toEqual([])
})

test('memoryTools: tools whose name mentions secrets are dropped', () => {
  const m = (v: string) => readOptions({ memoryTools: v }).memoryTools
  for (const t of ['mcp__keyvault__get_secret', 'mcp__x__list_keys', 'mcp__x__get_token', 'mcp__x__read_password', 'mcp__x__list_credentials', 'mcp__x__get_CERT', 'mcp__x__search_key']) {
    expect(m(t)).toEqual([])
  }
  for (const t of ['mcp__keyvault__memory_search', 'mcp__my-auth__memory_list', 'mcp__x__get_passwd', 'mcp__x__list_pwd', 'mcp__vault__search',
    'mcp__x__get_bearer', 'mcp__jwt__read', 'mcp__x__list_sas', 'mcp__private-mem__search', 'mcp__x__get_pem', 'mcp__identity__list', 'mcp__principal__get']) {
    expect(m(t)).toEqual([])
  }
  expect(m('mcp__my-memory__memory_search')).toEqual(['mcp__my-memory__memory_search'])
})

test('memoryTools: at most 5 are kept', () => {
  const list = Array.from({ length: 8 }, (_, i) => `mcp__m__search_${i}`)
  expect(readOptions({ memoryTools: list.join(',') }).memoryTools).toEqual(list.slice(0, 5))
})
