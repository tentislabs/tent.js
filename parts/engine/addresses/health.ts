import type { Address } from '../door/address.ts'
import { okAnswer } from '../wire.ts'

/** `/_t/health`: answers when the app is ready, with its name and its running version. It passes step 1 of the door and no other. */
export const address: Address = {
  order: 1,
  match: (request) => new URL(request.url).pathname === '/_t/health' && {},
  steps: [1],
  handle: async ({ app }) => okAnswer({ app: app.name, version: app.version }),
}
