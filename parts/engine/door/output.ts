import type { Type } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { answerOf, checkValue } from '../../core/internal.ts'
import { handedAnswer } from '../../data/index.ts'
import { isType } from './input.ts'

/** A value with nothing in it that its type does not name: a field of a record that was not declared is left out. */
function filtered(type: Type, value: unknown): unknown {
  if (value === undefined || value === null) return undefined
  if (type.kind === 'list' && Array.isArray(value)) return value.map((one) => filtered(type.of, one))
  if (type.kind === 'object' && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    const made: Record<string, unknown> = {}
    for (const [name, field] of Object.entries(type.shape)) {
      const one = filtered(field, Reflect.get(value, name))
      if (one !== undefined) made[name] = one
    }
    return made
  }
  return value
}

/** The error of an answer that the app may not give: it is the fault of the app, and no caller is shown its words. */
const misfit = (name: string, words: string): TentError =>
  new TentError('T0009', `The answer of ${name} does not fit its output: ${words}`, {
    fix: 'State an `output` that the answer fits, or answer what the stated one names.',
  })

/**
 * Takes the description, the name of a function, its stored record and what its work answered. Answers what
 * leaves the engine: the answer filtered through the declared output, which it must fit; where no output is
 * declared, the answer of a plan and of a list of writes filtered column by column, so that no `private` column
 * leaves; for a query written with `run`, what `db` handed out and nothing else; and nothing for a change written
 * with `run` and for an action. Throws T0009 for an answer that does not fit.
 */
export function leaving(
  description: Description,
  name: string,
  record: Record<string, unknown>,
  value: unknown,
): unknown {
  if (isType(record.output)) {
    const answer = filtered(record.output, value)
    const [found] = checkValue(record.output, answer)
    if (found) throw misfit(name, found.message)
    return answer
  }
  const writes: unknown[] | undefined = Array.isArray(record.writes) ? record.writes : undefined
  if (writes && writes.length > 1 && Array.isArray(value)) {
    // A list of writes answers a list in the same order, each row filtered by the type of a row of its table.
    return value.map((row, i) => {
      const write: unknown = writes[i]
      const table: unknown = Reflect.get(Object(write), 'add') ?? Reflect.get(Object(write), 'change')
      const type = typeof table === 'string' ? answerOf(description, { from: table, one: 'get' }) : undefined
      return type ? filtered(type, row) : undefined
    })
  }
  if (record.plan !== undefined || Array.isArray(record.writes)) {
    const type = answerOf(description, name)
    return type ? filtered(type, value) : value
  }
  if (record.kind !== 'query') return undefined
  try {
    return handedAnswer(value)
  } catch (error) {
    throw error instanceof TentError && error.code === 'T0009'
      ? misfit(
          name,
          `${error.message} A query written with \`run\` that states no \`output\` answers rows as \`db\` handed them, or a number.`,
        )
      : error
  }
}
