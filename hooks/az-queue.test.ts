import { expect, test } from 'claude-code/testing'
import { MAX_WAITING, runQueued } from './az-queue'

test('jobs run one at a time and a full queue drops the rest', async () => {
  let release = () => {}
  const gate = new Promise<void>((r) => { release = r })
  let ran = 0
  const first = runQueued(async () => { await gate; ran++; return 'first' })
  const rest = Array.from({ length: MAX_WAITING + 5 }, (_, i) => runQueued(async () => (ran++, i)))
  release()
  const results = await Promise.all([first, ...rest])
  expect(results[0]).toBe('first')
  expect(results.filter((r) => r === undefined).length).toBe(5)
  expect(ran).toBe(MAX_WAITING + 1)
})

test('a failing job resolves undefined and frees the queue', async () => {
  expect(await runQueued(async () => { throw new Error('boom') })).toBeUndefined()
  expect(await runQueued(async () => 7)).toBe(7)
})
