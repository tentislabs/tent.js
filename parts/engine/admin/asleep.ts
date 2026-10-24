import type { Admin } from '../admin.ts'

/**
 * `asleep`, a command of the channel's own for the host of an engine in a box: whether its app sleeps, with the
 * moment at which something of it is due, as `asleep.json` would hold it. Of an app that is awake: `{ asleep: false }`.
 * An app that sleeps is answered by the engine without waking it.
 */
export const admin: Admin = {
  name: 'asleep',
  run: async () => ({ asleep: false }),
}
