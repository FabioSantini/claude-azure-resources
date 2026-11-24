// Pure secret redaction for Azure resource JSON. Never mutates its input.
import { ARM_ID_RE } from './arm-id'

export const REDACTED = '[hidden]'

const DROP_EXACT = new Set(['env', 'secrets', 'appsettings', 'connectionstrings'])
const DROP_CONTAINS = [
  'password',
  'secret',
  'token',
  'connectionstring',
  'credential',
  'sastoken',
  'sasurl',
  'authorization',
  'bearer',
  'signature',
  'pfx',
  'keydata',
  'certdata',
  'secretvalue',
]
const KEEP = new Set(['id', 'name', 'type', 'kind', 'location', 'tags', 'sku', 'properties'])
const MARKERS = new RegExp(
  [
    String.raw`AccountKey=`,
    String.raw`SharedAccessSignature`,
    String.raw`[?&][^=&#\s]*(?:sig|signature|code|token|key|sas|password|pwd|secret)[^=&#\s]*=`,
    String.raw`-----BEGIN`,
    String.raw`Password=`,
    String.raw`Pwd=`,
    String.raw`SharedAccessKey=`,
    String.raw`AccessKey=`,
    String.raw`\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*`,
    String.raw`[A-Za-z][A-Za-z0-9+.-]*://[^/\s:@]+:[^/\s@]+@`,
  ].join('|'),
  'i',
)
const LONG_BLOB = /[A-Za-z0-9+\/=_]{40,}|[0-9a-f]{32,}/i
const NON_ASCII = /[^\u0000-\u007f]/
// A container image reference: lowercase registry host (with a dot or a port), repository path,
// optional tag, optional sha256 digest. Only the digest is exempt from LONG_BLOB; MARKERS are checked first.
const IMAGE_REF = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::[0-9]+)?|[a-z0-9.-]+:[0-9]+)(?:\/[a-z0-9._-]+)+(?::[A-Za-z0-9._-]{1,128})?(?:@sha256:[0-9a-f]{64})?$/
const IMAGE_DIGEST = /@sha256:[0-9a-f]{64}$/

function matchesDropRule(k: string): boolean {
  if (DROP_EXACT.has(k)) return true
  if (DROP_CONTAINS.some((part) => k.includes(part))) return true
  return /keys?[0-9]*$/.test(k)
}

function isDroppedKey(key: string): boolean {
  if (NON_ASCII.test(key)) return true
  const raw = key.toLowerCase()
  if (KEEP.has(raw)) return false
  return matchesDropRule(raw) || matchesDropRule(raw.replace(/[^a-z0-9]/g, ''))
}

function isPlainArmId(s: string): boolean {
  return ARM_ID_RE.test(s) && !s.split('/').some((seg) => LONG_BLOB.test(seg))
}

function isImageRef(s: string): boolean {
  // Registry, repository and tag still go through LONG_BLOB: a key-shaped tag stays hidden.
  return IMAGE_REF.test(s) && !LONG_BLOB.test(s.replace(IMAGE_DIGEST, ''))
}

/** The string-value rule alone: masks secret-looking strings, keeps ARM ids. */
export function redactString(s: string): string {
  if (MARKERS.test(s)) return REDACTED
  if (isPlainArmId(s) || isImageRef(s)) return s
  return LONG_BLOB.test(s) ? REDACTED : s
}

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map(redact)
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isDroppedKey(key)) continue
    Object.defineProperty(out, key, {
      value: redact(child),
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return out
}
