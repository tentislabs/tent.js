import { readFileSync } from 'node:fs'
import type { Finding } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import { keptAlone } from '../../engine/index.ts'

/**
 * Takes the file that `--secret-key-from` names. Answers the key of the secrets it holds, or the finding that
 * refuses it: a file that others can read, one that the current user does not own, a link, and one with no key.
 * Not a byte is read before the file passes.
 */
export function secretKeyFrom(file: string): { key: string } | { finding: Finding } {
  let kept: ReturnType<typeof keptAlone>
  try {
    kept = keptAlone(file)
  } catch {
    return { finding: finding('T0013', `No file of the key of the secrets is at ${file}.`) }
  }
  if (kept.why !== undefined)
    return {
      finding: finding('T0013', `The key of the secrets is not taken from ${file}: ${kept.why}.`, {
        fix: `Keep the key in a file of your own that only you can read: ${kept.close}`,
      }),
    }
  const key = readFileSync(file, 'utf8').trim()
  if (key.length < 32)
    return {
      finding: finding('T0013', `The file ${file} holds no key of the secrets: a key is 32 characters or more.`),
    }
  return { key }
}
