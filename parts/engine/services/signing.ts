import type { Signer, Verifier } from '../../connect/index.ts'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'
import { isStored } from '../../core/internal.ts'

/** The auths and the checks of a signature that the makers of an app made, by their names. */
export interface Signing {
  signers: Record<string, Signer>
  verifiers: Record<string, Verifier>
}

// What the makers of each app made, under its handles: every record that the engine holds of one app shares those.
const held = new WeakMap<object, Signing>()

/** The name of a form of the builder's own that a record of an auth or of a scheme names with `by`. */
const byOf = (value: unknown): string | undefined =>
  isStored(value) && typeof value.by === 'string' ? value.by : undefined

/** The names of the signers and of the checks that a description needs, each with the definition that names it. */
function needed(description: Description): { signers: [string, string][]; verifiers: [string, string][] } {
  const signers: [string, string][] = []
  const verifiers: [string, string][] = []
  for (const [name, service] of Object.entries(description.services)) {
    const signer = byOf(service.auth)
    if (signer !== undefined) signers.push([signer, name])
    const scheme = isStored(service.webhook) ? byOf(service.webhook.scheme) : undefined
    if (scheme !== undefined) verifiers.push([scheme, name])
  }
  for (const [name, incoming] of Object.entries(description.incoming)) {
    const scheme = isStored(incoming.verify) ? byOf(incoming.verify.scheme) : undefined
    if (scheme !== undefined) verifiers.push([scheme, name])
  }
  return { signers, verifiers }
}

/**
 * Takes an app, its description, and what its makers made of auths and checks. Keeps them for the app. Throws
 * T7113 where a service or an incoming call names one that nobody made: the app does not open.
 */
export function keepSigning(o: Opened, description: Description, made: Signing): void {
  const { signers, verifiers } = needed(description)
  for (const [kind, names, given] of [
    ['signer', signers, made.signers],
    ['check of a signature', verifiers, made.verifiers],
  ] as const)
    for (const [name, by] of names)
      if (typeof Reflect.get(given, name) !== 'function')
        throw new TentError('T7113', `${by} names the ${kind} ${name}, which nobody made in \`engine.ts\`.`, {
          fix: `Make it in \`${kind === 'signer' ? 'signers' : 'verifiers'}\` of the makers of \`engine.ts\`, by that name.`,
        })
  held.set(o.handles, made)
}

/** Answers the auths and the checks of a signature that the makers of an app made. */
export const signingOf = (o: Opened): Signing => held.get(o.handles) ?? { signers: {}, verifiers: {} }
