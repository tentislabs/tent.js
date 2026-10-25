// The ticket by which the apps of the workspaces know a person of the product. The engine takes the product's own
// cookies out of every request for a workspace, so the program hands the browser one of its own, signed by a key
// that only this program holds.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const TICKET = 'builder_person'
const LIFE = 8 * 60 * 60 * 1000

export function tickets() {
  const key = randomBytes(32)
  const signed = (payload: string) => createHmac('sha256', key).update(payload).digest('base64url')

  return {
    /** A ticket for the person of that email, which holds for eight hours. */
    make(email: string): string {
      const payload = Buffer.from(JSON.stringify({ email, until: Date.now() + LIFE })).toString('base64url')
      return `${payload}.${signed(payload)}`
    },
    /** The email that the ticket of a request names, where its signature holds and its time has not passed. */
    read(request: Request): string | undefined {
      const cookie = request.headers.get('cookie') ?? ''
      const kept = cookie
        .split(/;\s*/)
        .find((one) => one.startsWith(`${TICKET}=`))
        ?.slice(TICKET.length + 1)
      const [payload, signature] = (kept ?? '').split('.')
      if (!payload || !signature) return undefined
      const expected = Buffer.from(signed(payload))
      const given = Buffer.from(signature)
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined
      const read: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (typeof read !== 'object' || read === null || !('email' in read) || !('until' in read)) return undefined
      if (typeof read.email !== 'string' || typeof read.until !== 'number' || read.until < Date.now()) return undefined
      return read.email
    },
  }
}
