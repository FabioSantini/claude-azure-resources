import { expect, test } from 'claude-code/testing'
import { judgeRealPath, type StatFn } from './real-read'

const CWD = 'C:/proj'
const statOf = (links: Record<string, string | undefined>): StatFn => async (path) => {
  if (!(path in links)) throw new Error('ENOENT')
  return { realPath: links[path] }
}

test('a plain file inside the project passes', async () => {
  const stat = statOf({ 'C:/proj': 'C:/proj', 'C:/proj/a.md': 'C:/proj/a.md' })
  expect(await judgeRealPath('C:/proj/a.md', CWD, stat)).toBeUndefined()
})

test('Windows real paths with backslashes are compared the same way', async () => {
  const stat = statOf({ 'C:/proj': 'C:\\proj', 'C:/proj/a.md': 'C:\\proj\\a.md' })
  expect(await judgeRealPath('C:/proj/a.md', CWD, stat)).toBeUndefined()
})

test('a link landing outside the project or on a secret is denied', async () => {
  const stat = statOf({ 'C:/proj': 'C:/proj', 'C:/proj/a.md': 'C:/Users/u/.ssh/id_rsa', 'C:/proj/b.md': 'C:/proj/.env' })
  expect(await judgeRealPath('C:/proj/a.md', CWD, stat)).toBeDefined()
  expect(await judgeRealPath('C:/proj/b.md', CWD, stat)).toBeDefined()
})

test('a project folder that is itself a link is compared where it lands', async () => {
  const stat = statOf({ 'C:/proj': 'D:/real/proj', 'C:/proj/a.md': 'D:/real/proj/a.md' })
  expect(await judgeRealPath('C:/proj/a.md', CWD, stat)).toBeUndefined()
})

test('a path that cannot be resolved is denied', async () => {
  expect(await judgeRealPath('C:/proj/a.md', CWD, statOf({ 'C:/proj': 'C:/proj' }))).toBeDefined()
  expect(await judgeRealPath('C:/proj/a.md', CWD, statOf({ 'C:/proj': 'C:/proj', 'C:/proj/a.md': undefined }))).toBeDefined()
  expect(await judgeRealPath('C:/proj/a.md', CWD, statOf({ 'C:/proj/a.md': 'C:/proj/a.md' }))).toBeDefined()
})
