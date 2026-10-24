import { runtime } from '../runtime.ts'

/** A secret as code holds it: wrapped, so that it is never written out by accident, and opened with `reveal`. */
interface SecretValue {
  reveal(): string
}

/** The handle of the secrets: each under its name. A definition names a secret with `secret('NAME')` and reads none. */
export type Secrets = { readonly [name: string]: SecretValue }

/**
 * The handle as backend code holds it: each secret under its name, and `set` and `remove`, which write a secret of
 * the mode of the app and answer a promise. Both are full access.
 */
type SecretsHandle = Secrets & {
  set(name: string, value: string): Promise<void>
  remove(name: string): Promise<void>
}

function secretsHandle<Handle>(): Handle
function secretsHandle(): unknown {
  return new Proxy(
    {},
    {
      get(_, name) {
        if (typeof name !== 'string' || name === 'then') return undefined
        return Reflect.get(runtime(`secrets.${name}`).handle('secrets'), name)
      },
    },
  )
}

export const secrets: SecretsHandle = secretsHandle()
