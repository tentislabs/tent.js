import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** The form of a number that a command draws to ask an engine with: 64 characters of base sixteen, in small letters. */
export const isProofNumber = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

/**
 * Takes the admin token of an engine and a number that a command drew. Answers the fingerprint of the token with
 * that number, as 64 characters of base sixteen: the fingerprint of the number, keyed with the token, so that it
 * tells nothing of the token and nothing of the fingerprint with another number.
 */
export const tokenProof = (token: string, number: string): string =>
  createHmac('sha256', token).update(number).digest('hex')

/**
 * Takes the admin token that a command read, the number it drew, and what was answered. Answers whether the
 * answer is the fingerprint of that token with that number, compared in a time that does not tell where the two differ.
 */
function provesToken(token: string, number: string, answered: unknown): boolean {
  if (typeof answered !== 'string') return false
  const [theirs, ours] = [Buffer.from(answered, 'utf8'), Buffer.from(tokenProof(token, number), 'utf8')]
  return theirs.length === ours.length && timingSafeEqual(theirs, ours)
}

// How long what listens is given to prove itself to an opening, in milliseconds.
const proofTime = 5000

/**
 * Takes a port of this computer and the token that an `engine.json` names. Asks what listens there to prove that
 * it holds the token, with a number drawn at random and nothing else. Answers `proved` for the fingerprint;
 * `refused` where what listens answered as an engine answers a request that came through a proxy it was told of,
 * as one named by an address of this computer is: an engine that runs there, and takes no command from here; and
 * `none` for anything else, or nothing in time, which is no engine of that file.
 */
export async function provedAt(port: number, token: string): Promise<'proved' | 'refused' | 'none'> {
  const number = randomBytes(32).toString('hex')
  try {
    const answer = await fetch(`http://127.0.0.1:${port}/_t/admin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ number }),
      signal: AbortSignal.timeout(proofTime),
    })
    const body: unknown = await answer.json()
    if (provesToken(token, number, Reflect.get(Object(Reflect.get(Object(body), 'value')), 'proof'))) return 'proved'
    const code = Reflect.get(Object(Reflect.get(Object(body), 'error')), 'code')
    return !answer.ok && code === 'T0006' ? 'refused' : 'none'
  } catch {
    return 'none'
  }
}
