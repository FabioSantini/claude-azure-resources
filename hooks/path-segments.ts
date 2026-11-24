// The one path segment normaliser of the scanner's guards (file guard and scan folder), as Windows reads a name:
// '/' and '\' both separate, empty and '.' segments drop, trailing dots and spaces go, case folds (unless told not to).
// A '..' segment becomes '' (all dots stripped): callers refuse an empty segment.

export function normalSegments(path: string, folded = true): string[] {
  const segs = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s !== '' && s !== '.')
    .map((s) => s.replace(/[. ]+$/, ''))
  return folded ? segs.map((s) => s.toLowerCase()) : segs
}
