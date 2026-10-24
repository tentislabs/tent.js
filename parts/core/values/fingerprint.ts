import { cannot, recorded } from '../word.ts'
import { fingerprintOf } from '../write.ts'

/**
 * Takes a text. Answers SHA-256 of its bytes as UTF-8, written as lowercase hex. Handed a reference it answers its
 * record. Throws T0027 for anything but text.
 */
export function fingerprint(text: string): string
export function fingerprint(...values: unknown[]): unknown {
  const [text] = values
  return (
    recorded('fingerprint', values) ??
    (typeof text === 'string' ? fingerprintOf(text) : cannot('fingerprint', text, 'a text'))
  )
}
