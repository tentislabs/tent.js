import { fingerprint } from '../core/index.ts'
import type { At } from './face.ts'

const letters = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * Takes where a call was made, which call it is, and how many runs of that very call ended failed or stopped
 * before. Answers the id of the run that the call starts: the letter `z`, and the first 125 bits of the
 * fingerprint of the caller's run, the step's name, its repeat number and the call, in 25 characters of a row's
 * id. So a step that runs again finds the same run, and a made id, which never starts with `z`, never meets one.
 */
export function calledId(from: At, call: string, endedBefore: number): string {
  const parts = [from.run, from.step?.name ?? '', String(from.step?.repeat ?? 0), call]
  if (endedBefore > 0) parts.push(String(endedBefore))
  const hex = fingerprint(parts.join('\n'))
  let bits = ''
  for (const digit of hex.slice(0, 32)) bits += Number.parseInt(digit, 16).toString(2).padStart(4, '0')
  let id = 'z'
  for (let at = 0; at < 125; at += 5) id += letters[Number.parseInt(bits.slice(at, at + 5), 2)]
  return id
}
