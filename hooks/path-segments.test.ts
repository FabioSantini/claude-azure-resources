import { expect, test } from 'claude-code/testing'
import { normalSegments } from './path-segments'

test('segments drop empty and . parts, strip trailing dots and spaces, fold case', () => {
  expect(normalSegments('C:/p/./.Claude./x ')).toEqual(['c:', 'p', '.claude', 'x'])
  expect(normalSegments('/a//B/', false)).toEqual(['a', 'B'])
  expect(normalSegments('a/../b')).toEqual(['a', '', 'b'])
})
