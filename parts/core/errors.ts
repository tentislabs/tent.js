/** Where in a project a failure belongs. */
interface Where {
  file: string
  line: number
  definition?: string
}

/** What a failure may carry beside its code and its message. */
export interface More {
  fix?: string
  where?: Where
  fields?: Record<string, string>
  place?: { name: string; nth: number }
  service?: { status?: number; body?: unknown }
}

// The short words of the codes, which the registry hands in when it loads. A page in a browser loads no registry:
// what it throws itself is told by its code, and what the engine sends it carries its word already.
const names: Record<string, string> = {}

/** Takes the short word of each code of the registry, which every failure made from then on carries. */
export const namedCodes = (given: Record<string, string>): void => void Object.assign(names, given)

/** Answers the short word of a code: that of the registry, or the code itself where it is a code of an app's own. */
export const nameOf = (code: string): string => (Object.hasOwn(names, code) ? names[code] : code)

/** Every failure: a code, the short word of the code, and a message, with the place and the fix where they apply. */
export class TentError extends Error {
  code: string
  // Declared and not made, so that an error holds only the members it was given.
  declare fix?: string
  declare where?: Where
  declare fields?: Record<string, string>
  declare place?: { name: string; nth: number }
  declare service?: { status?: number; body?: unknown }

  /**
   * Takes a code, a message, and what else the failure carries. For a code of the framework the name is the short
   * word of the registry. For a code of an app's own it is the code itself, which is the builder's word.
   */
  constructor(code: string, message: string, more: More = {}) {
    super(message)
    this.code = code
    this.name = nameOf(code)
    if (more.fix !== undefined) this.fix = more.fix
    if (more.where !== undefined) this.where = more.where
    if (more.fields !== undefined) this.fields = more.fields
    if (more.place !== undefined) this.place = more.place
    if (more.service !== undefined) this.service = more.service
  }
}

/** What the build and the check report: a failure with its level and the command that explains its code. */
export interface Finding extends TentError {
  level: 'error' | 'warning' | 'note'
  docs: string
}

/** What a caller is sent of a failure. */
export interface WireError {
  code: string
  name: string
  message: string
  fields?: Record<string, string>
  ref?: string
  // The trace that the failed call stood in, which `tent logs --trace` reads on the machine.
  trace?: string
  running?: string
  fix?: string
  where?: Where
}
