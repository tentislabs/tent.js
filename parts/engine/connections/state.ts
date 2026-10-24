import type { Opened } from '../opened.ts'
import { secretKeyAt, noKeyAtHand } from '../values/key.ts'
import { openText, sealText } from '../values/sealing.ts'

/** What travels with the user to the provider and back, and is kept nowhere. */
export interface State {
  user: string
  account: string
  back: string
  // The proof of the standard: the text whose fingerprint the provider was handed.
  verifier: string
  // The scheme and the name the app was reached by, which the return must come by.
  name: string
  at: number
}

/** What a state is bound to: the form and the service, so that a state of one service opens for no other. */
const boundOf = (service: string): string => `tent.connect/1\n${service}`

/** Takes an app, a service and a state. Answers the state encrypted under the key of the secrets. Throws T0019 with none. */
export function sealState(o: Opened, service: string, state: State): string {
  const key = secretKeyAt(o.dataFolder)
  if (!key) throw noKeyAtHand('Connecting an account')
  return sealText(key, JSON.stringify(state), boundOf(service))
}

/** Takes an app, a service and the text of a state. Answers the state, or nothing where it does not open. */
export function openState(o: Opened, service: string, text: string): State | undefined {
  const key = secretKeyAt(o.dataFolder)
  const opened = key ? openText(key, text, boundOf(service)) : undefined
  if (opened === undefined) return undefined
  try {
    const read: unknown = JSON.parse(opened)
    const one = Object(read)
    const texts = ['user', 'account', 'back', 'verifier', 'name'].every((field) => typeof one[field] === 'string')
    return texts && typeof one.at === 'number'
      ? { user: one.user, account: one.account, back: one.back, verifier: one.verifier, name: one.name, at: one.at }
      : undefined
  } catch {
    return undefined
  }
}
