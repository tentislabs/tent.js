import type { Admin } from '../admin.ts'
import { wordOf } from '../admin.ts'
import { called } from '../door/call.ts'
import { callerWritten } from '../program.ts'

/** What a line of the log holds as data: what its JSON text reads as, or the text where it does not read. */
function dataOf(kept: unknown): unknown {
  if (typeof kept !== 'string') return undefined
  try {
    return JSON.parse(kept)
  } catch {
    return kept
  }
}

/**
 * `tent run <function> --with <json> --as <who>`: calls a function through steps 5 to 10 of the door, as a user by
 * its id, as `nobody`, or as the system where nobody is named. Answers what the function answered, and the lines
 * that its code wrote into the log meanwhile.
 */
export const admin: Admin = {
  name: 'run',
  async run(o, args) {
    const name = wordOf(args, 'name', 'the name of a function')
    const as: unknown = Reflect.get(args, 'as')
    const caller = callerWritten(o, typeof as === 'string' ? as : 'system')
    const before = o.log.last('lines')
    const input: unknown = Reflect.get(args, 'with') ?? {}
    const record = Object.hasOwn(o.description.functions, name) ? o.description.functions[name] : undefined
    // On a reader's computer a command that reads is answered there, and one that writes is the writer's.
    const value = await o.machine.sent('call', [name, input], caller, record?.kind === 'query', () =>
      called(o, name, input, { caller, own: true }),
    )
    const lines = o.log.rows('lines', { after: before }).map((line) => {
      const data = dataOf(line.data)
      return {
        at: line.at,
        level: line.level,
        message: line.message,
        ...(data === undefined ? {} : { data }),
        ...(line.name === null ? {} : { name: line.name }),
        ...(line.run === null ? {} : { run: line.run }),
      }
    })
    return { ...(value === undefined ? {} : { value }), lines }
  },
}
