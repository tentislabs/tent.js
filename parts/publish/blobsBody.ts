import { TentError } from '../core/index.ts'

/** The type of a body that holds blobs as they are. */
export const blobsType = 'application/x-tent-blobs'

/** Blobs as one body: for each one line, `<fingerprint> <length>` and a line feed, then that many bytes. */
export function blobsBody(blobs: [string, Uint8Array][]): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = []
  for (const [print, bytes] of blobs) parts.push(new TextEncoder().encode(`${print} ${bytes.length}\n`), bytes)
  const all = new Uint8Array(parts.reduce((sum, one) => sum + one.length, 0))
  let at = 0
  for (const part of parts) {
    all.set(part, at)
    at += part.length
  }
  return all
}

/** The failure of a body of blobs that has not its form: T0002. */
const formless = (words: string): TentError =>
  new TentError('T0002', `The body of blobs has not its form: ${words}.`, { fields: { body: 'type' } })

/** Reads a body of blobs back into its blobs, each by its fingerprint. Throws T0002 for a body that has not its form. */
export function blobsOf(body: Uint8Array): [string, Uint8Array][] {
  const blobs: [string, Uint8Array][] = []
  let at = 0
  while (at < body.length) {
    const end = body.indexOf(10, at)
    if (end < 0 || end - at > 200) throw formless('a line of a blob has no end')
    const line = new TextDecoder().decode(body.subarray(at, end))
    const found = /^([0-9a-f]{16,128}) (\d{1,12})$/.exec(line)
    if (!found) throw formless(`\`${line.slice(0, 80)}\` is no line of a blob`)
    const length = Number(found[2])
    if (end + 1 + length > body.length) throw formless('a blob is shorter than its line says')
    blobs.push([found[1], body.slice(end + 1, end + 1 + length)])
    at = end + 1 + length
  }
  return blobs
}
