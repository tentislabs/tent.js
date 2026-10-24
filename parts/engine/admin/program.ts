import type { Admin } from '../admin.ts'
import { programUsed } from '../counts/program.ts'

/**
 * `program`, a command of the channel's own for the host of an engine in a box: what the program of the engine
 * used, as `engine.program()` answers it, with the data folder of its app. It wakes nothing.
 */
export const admin: Admin = {
  name: 'program',
  run: async (o) => programUsed(() => [o.dataFolder]),
}
