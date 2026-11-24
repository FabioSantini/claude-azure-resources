// Container image references stay visible; secret markers inside them are still masked.
import { expect, test } from 'claude-code/testing'
import { REDACTED, redact, redactString } from './redact'

const DIGEST = 'a'.repeat(8) + '0123456789abcdef'.repeat(3) + 'b'.repeat(8)

test('an image with a sha256 digest stays visible', () => {
  const img = `myregistry.azurecr.io/my-api@sha256:${DIGEST}`
  expect(DIGEST.length).toBe(64)
  expect(redactString(img)).toBe(img)
  expect(redactString(`myregistry.azurecr.io/my-api:v2@sha256:${DIGEST}`)).toBe(`myregistry.azurecr.io/my-api:v2@sha256:${DIGEST}`)
})

test('an image with an ordinary tag stays visible', () => {
  expect(redactString('myregistry.azurecr.io/my-api:persist-62437d3')).toBe('myregistry.azurecr.io/my-api:persist-62437d3')
  expect(redactString('myregistry.azurecr.io:5000/team/my-web:1.2.3')).toBe('myregistry.azurecr.io:5000/team/my-web:1.2.3')
})

test('a tag that looks like a key is hidden: only the digest is exempt', () => {
  const alnum = (n: number) => 'aZ3x9Qk7'.repeat(Math.ceil(n / 8)).slice(0, n)
  expect(redactString(`myregistry.azurecr.io/my-api:${'0123456789abcdef'.repeat(2)}-Build_20261124`)).toBe(REDACTED)
  expect(redactString(`host.io/repo:${'0123456789abcdef'.repeat(2)}`)).toBe(REDACTED)
  expect(redactString(`host.io/repo:${alnum(88)}`)).toBe(REDACTED)
  expect(redactString(`host.io/repo:${alnum(126)}-_`)).toBe(REDACTED)
  expect(redactString(`ghcr.io/x:ghp_${alnum(36)}`)).toBe(REDACTED)
  expect(redactString(`host.io/repo:${'0123456789abcdef'.repeat(2)}@sha256:${DIGEST}`)).toBe(REDACTED)
})

test('an image inside container JSON stays visible', () => {
  const img = `myregistry.azurecr.io/my-api@sha256:${DIGEST}`
  const out = redact({ properties: { template: { containers: [{ image: img }] } } }) as any
  expect(out.properties.template.containers[0].image).toBe(img)
})

test('image-looking strings with secret markers are still masked', () => {
  expect(redactString(`acr.azurecr.io/my-api:v1?sig=${'x'.repeat(10)}`)).toBe(REDACTED)
  expect(redactString('https://user:pass@acr.azurecr.io/my-api:v1')).toBe(REDACTED)
  expect(redactString('acr.azurecr.io/my-api:Password=abc')).toBe(REDACTED)
})

test('a long blob that is not an image is still masked', () => {
  expect(redactString('0123456789abcdef'.repeat(4))).toBe(REDACTED)
  expect(redactString(`acr.azurecr.io/${'A'.repeat(50)}`)).toBe(REDACTED)
  expect(redactString(`Host/${'Zz9+'.repeat(12)}`)).toBe(REDACTED)
  // no registry host (no dot or port), or a repository path that is itself a blob
  expect(redactString(`keys/${'0123456789abcdef'.repeat(4)}`)).toBe(REDACTED)
  expect(redactString(`acr.azurecr.io/${'0123456789abcdef'.repeat(4)}:v1`)).toBe(REDACTED)
})
