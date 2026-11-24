import { CATALOG, FALLBACK_COLOR, FALLBACK_FIELDS, REGION_FIELD, type FieldSpec, type TypeSpec } from './type-catalog-data'

export type KeyField = { label: string; value: string; isLink?: boolean }
export type Tone = 'ok' | 'busy' | 'bad' | 'unknown'

export const HIDDEN_KEYS: readonly string[] = ['systemData', 'id']

const DASH = '—'

function lookup(type: unknown): { key: string; spec: TypeSpec | undefined } {
  const key = String(type ?? '').toLowerCase()
  return { key, spec: Object.hasOwn(CATALOG, key) ? CATALOG[key] : undefined }
}

export function typeLabel(type: string): string {
  const raw = String(type ?? '')
  const { spec } = lookup(raw)
  if (spec) return spec.label
  const parts = raw.split('/')
  const last = parts[parts.length - 1] || raw
  if (parts.length < 2) return last
  const provider = (parts[0] ?? '').replace(/^microsoft\./i, '')
  return provider === '' ? last : `${provider} ${last}`
}

/** The type's color (tab, type line); gray for a type not in the catalog. */
export function typeColor(type: string): string {
  return lookup(type).spec?.color ?? FALLBACK_COLOR
}

const DARK_TEXT = '#1A1A1A'
const LIGHT_TEXT = '#FFFFFF'

function luminance(hex: string): number | undefined {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return undefined
  const lin = (h: string) => {
    const c = parseInt(h, 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(m[1]!) + 0.7152 * lin(m[2]!) + 0.0722 * lin(m[3]!)
}

/** Text on a fill of `color`: dark or white, whichever contrasts more (WCAG luminance). */
export function textOn(color: string): string {
  const l = luminance(color)
  const dark = luminance(DARK_TEXT) ?? 0
  if (l === undefined) return LIGHT_TEXT
  return (l + 0.05) / (dark + 0.05) > 1.05 / (l + 0.05) ? DARK_TEXT : LIGHT_TEXT
}

function pick(data: unknown, path: string): unknown {
  let cur: unknown = data
  for (const part of path.split('.')) {
    const m = /^([^[]+)(?:\[(\d+)\])?$/.exec(part)
    if (!m || cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[m[1] as string]
    if (m[2] !== undefined) cur = Array.isArray(cur) ? cur[Number(m[2])] : undefined
  }
  return cur
}

function scalar(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() === '' ? undefined : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return undefined
}

function lastSegment(s: string): string {
  const parts = s.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? s
}

function cpuMem(v: unknown): string | undefined {
  const cpu = scalar(pick(v, 'cpu'))
  const mem = scalar(pick(v, 'memory'))
  if (cpu === undefined && mem === undefined) return undefined
  return `${cpu ?? DASH} vCPU · ${mem ?? DASH}`
}

function render(spec: FieldSpec, data: unknown): KeyField {
  const { label, path, path2, format } = spec
  if (format === 'cpuMem') return { label, value: cpuMem(pick(data, path)) ?? DASH }
  if (format === 'range') {
    const lo = scalar(pick(data, path))
    const hi = scalar(pick(data, path2 ?? ''))
    return { label, value: lo === undefined && hi === undefined ? DASH : `${lo ?? DASH} – ${hi ?? DASH}` }
  }
  const raw = scalar(pick(data, path)) ?? (path2 ? scalar(pick(data, path2)) : undefined)
  if (raw === undefined) return { label, value: DASH }
  if (format === 'url') {
    return { label, value: /^https?:\/\//i.test(raw) ? raw : `https://${raw}`, isLink: true }
  }
  if (format === 'revision') {
    const i = raw.indexOf('--')
    return { label, value: i >= 0 ? raw.slice(i) : raw }
  }
  if (format === 'segment') return { label, value: lastSegment(raw) }
  return { label, value: raw }
}

export function keyFields(type: string, data: unknown, row: { resourceGroup: string }): KeyField[] {
  const { spec } = lookup(type)
  const specs = spec ? spec.fields : FALLBACK_FIELDS
  const own = specs.map((s) => render(s, data))
  const region = render(REGION_FIELD, data)
  const group: KeyField = { label: 'Resource group', value: row?.resourceGroup || DASH }
  return spec ? [...own, region, group] : [region, group, ...own]
}

const OK = ['running', 'succeeded', 'ready']
const BUSY = ['creating', 'updating', 'provisioning', 'inprogress', 'deleting']
const BAD = ['failed', 'stopped', 'canceled', 'degraded']

export function statusOf(data: unknown): { text: string; tone: Tone } {
  for (const p of ['properties.runningStatus', 'properties.state', 'properties.provisioningState']) {
    const text = scalar(pick(data, p))
    if (text === undefined) continue
    const k = text.toLowerCase()
    const tone: Tone = OK.includes(k) ? 'ok' : BUSY.includes(k) ? 'busy' : BAD.includes(k) ? 'bad' : 'unknown'
    return { text, tone }
  }
  return { text: 'Unknown', tone: 'unknown' }
}
