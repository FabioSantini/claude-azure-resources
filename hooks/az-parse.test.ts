import { expect, test } from 'claude-code/testing'
import { extractTargets, hasShellMeta, splitPieces } from './az-parse'

test('named target from -n and -g', () => {
  expect(extractTargets('az containerapp show -n my-app -g rg-demo')).toEqual([
    { kind: 'named', name: 'my-app', group: 'rg-demo', command: 'containerapp show' },
  ])
})

test('ids target', () => {
  expect(
    extractTargets('az resource show --ids /subscriptions/s/resourceGroups/g/providers/P/t/x -o json'),
  ).toEqual([{ kind: 'ids', ids: ['/subscriptions/s/resourceGroups/g/providers/P/t/x'] }])
})

test('ids takes all following non-flag tokens', () => {
  expect(extractTargets('az resource show --ids /a /b --query x')).toEqual([
    { kind: 'ids', ids: ['/a', '/b'] },
  ])
})

test('commands without a target give nothing', () => {
  expect(extractTargets('az group list')).toEqual([])
  expect(extractTargets('az account show')).toEqual([])
})

test('az inside a pipeline', () => {
  const t = extractTargets(
    'cd x && az webapp show --name my-site --resource-group rg-demo --query state -o tsv | head',
  )
  expect(t).toEqual([{ kind: 'named', name: 'my-site', group: 'rg-demo', command: 'webapp show' }])
})

test('variables are skipped', () => {
  expect(extractTargets('az acr show -n $ACR -g rg')).toEqual([])
})

test('az.cmd and quotes and backtick continuation', () => {
  expect(extractTargets('az.cmd webapp show -n "my app" `\n -g rg')).toEqual([
    { kind: 'named', name: 'my app', group: 'rg', command: 'webapp show' },
  ])
})

test('non-az and empty input', () => {
  expect(extractTargets('echo hello')).toEqual([])
  expect(extractTargets('')).toEqual([])
})

test('unclosed quote does not throw', () => {
  expect(() => extractTargets('az x show -n "a')).not.toThrow()
  expect(splitPieces('az x show -n "a')).toEqual([['az', 'x', 'show', '-n', 'a']])
})

test('splitPieces returns every piece, unquoted', () => {
  expect(splitPieces("echo 'a b' && ls; az group list | head $(date)")).toEqual([
    ['echo', 'a b'],
    ['ls'],
    ['az', 'group', 'list'],
    ['head'],
    ['date'],
  ])
})

test('hasShellMeta flags single &', () => {
  expect(hasShellMeta('az group list & rm -rf x')).toBe(true)
})

test('hasShellMeta flags $( inside double quotes', () => {
  expect(hasShellMeta('az resource list --name "$(rm -rf x)"')).toBe(true)
  expect(hasShellMeta('az resource list --name "${X}"')).toBe(true)
})

test('hasShellMeta flags backticks', () => {
  expect(hasShellMeta('az group list `rm x`')).toBe(true)
})

test('hasShellMeta flags > and <', () => {
  expect(hasShellMeta('az group list > out.txt')).toBe(true)
  expect(hasShellMeta('az group list < in.txt')).toBe(true)
})

test('hasShellMeta flags newline', () => {
  expect(hasShellMeta('az group list\nrm x')).toBe(true)
  expect(hasShellMeta('az group list\r')).toBe(true)
})

test('hasShellMeta is false for az resource list -g rg -o json | jq .', () => {
  expect(hasShellMeta('az resource list -g rg -o json | jq .')).toBe(false)
})

test('hasShellMeta is false for a && b', () => {
  expect(hasShellMeta('a && b')).toBe(false)
})

test('splitPieces splits on single &', () => {
  expect(splitPieces('az group list & rm -rf x')).toEqual([['az', 'group', 'list'], ['rm', '-rf', 'x']])
  expect(extractTargets('az webapp show -n a -g r & az webapp show -n b -g r').length).toBe(2)
})

const BS = String.fromCharCode(92)

test('hasShellMeta flags backslash-escaped double quote', () => {
  expect(hasShellMeta(`az group list ${BS}"; rm -rf x; ${BS}"`)).toBe(true)
})

test('hasShellMeta flags backslash-escaped single quote', () => {
  expect(hasShellMeta(`az group list ${BS}'; rm -rf x; ${BS}'`)).toBe(true)
})

test('hasShellMeta flags any backslash', () => {
  expect(hasShellMeta(`az group list -g a${BS}b`)).toBe(true)
})
