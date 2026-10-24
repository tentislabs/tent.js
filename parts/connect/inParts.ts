import { randomBytes } from 'node:crypto'
import type { Piece } from './fileBody.ts'

/** One part of a body: a text, or a file with its name, its kind and its bytes. */
export type Part = { name: string; text: string } | { name: string; file: { name: string; kind: string; bytes: Piece } }

/** A name inside the quotes of a line of a part: a quote and a line break are written with percent signs, so they end nothing. */
const quoted = (name: string): string =>
  `"${name.replace(/[%"\r\n]/g, (one) => `%${one.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}"`

/**
 * Takes the parts of a body. Answers the body in parts as its pieces, each file a piece of its own, and the kind of
 * content that names its boundary.
 */
export function inParts(parts: Part[]): { pieces: Piece[]; type: string } {
  const boundary = `tent-${randomBytes(16).toString('hex')}`
  const pieces: Piece[] = []
  const text = (line: string): void => void pieces.push(new TextEncoder().encode(line))
  for (const part of parts) {
    text(`--${boundary}\r\nContent-Disposition: form-data; name=${quoted(part.name)}`)
    if ('file' in part) {
      text(`; filename=${quoted(part.file.name)}\r\nContent-Type: ${part.file.kind}\r\n\r\n`)
      pieces.push(part.file.bytes)
    } else text(`\r\n\r\n${part.text}`)
    text('\r\n')
  }
  text(`--${boundary}--\r\n`)
  return { pieces, type: `multipart/form-data; boundary=${boundary}` }
}
