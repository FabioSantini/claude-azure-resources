// The one sanitiser for text that reaches azure.md or the screen.
const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu

/** Control, format (bidi, zero-width, soft hyphen) and line/paragraph separator characters become spaces. */
export function stripControls(s: string): string {
  return s.replace(UNSAFE, ' ')
}
