import type { Admin } from '../admin.ts'
import { valuesAsked } from '../values/asked.ts'

/**
 * `tent secrets set <NAME>`, `remove <NAME>` and `list`, on an engine that runs: the engine, which holds the key,
 * writes the file, and uses the new value from the next use on. A list answers the names that are set and those
 * that a definition names and that are not, and never a value.
 */
export const admin: Admin = {
  name: 'secrets',
  run: async (o, args) => valuesAsked(o, 'secrets', args),
}
