import { TentError } from '../../core/index.ts'

/** The error of a body that passes the size its address takes. */
export const tooLarge = (limit: number): TentError =>
  new TentError('T0003', `The body of the request is larger than ${limit} bytes, the most that its address takes.`, {
    fix: 'Send less in one call, or raise `callSize` in `project.limits`.',
  })

/**
 * Takes a request and the most bytes that its body may hold. Reads the body as it arrives and answers its bytes.
 * Throws T0003 as soon as it has read one byte more, so that a body is never held whole before it is refused, and
 * for a body that states a `Content-Encoding`, which is not opened.
 */
export async function bodyOf(request: Request, limit: number): Promise<Uint8Array> {
  if (request.headers.has('content-encoding'))
    throw new TentError(
      'T0003',
      'The body of the request states a `Content-Encoding`, and the engine opens no packed body.',
      {
        fix: 'Send the body as it is, with no `Content-Encoding`.',
      },
    )
  if (!request.body) return new Uint8Array()
  const parts: Uint8Array[] = []
  let size = 0
  const reader = request.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw tooLarge(limit)
    }
    parts.push(value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.byteLength
  }
  return bytes
}
