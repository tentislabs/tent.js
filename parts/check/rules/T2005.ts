import type { Finding } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { at, inside, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/** The stored record of a definition of a kind, or nothing where the description holds none of that name. */
const recordOf = (group: Record<string, unknown>, name: string): Record<string, unknown> | undefined => {
  const record = Object.hasOwn(group, name) ? group[name] : undefined
  return isStored(record) ? record : undefined
}

/** The types that a definition writes: the columns of a table, the input and the output of a function, a flow, a model and a call of a service, and the arguments of a command. */
function typesOf(description: Description, word: string, name: string): unknown[] {
  if (word === 'table') return [recordOf(description.tables, name)?.columns]
  if (word === 'command') return [recordOf(description.commands, name)?.args]
  if (word === 'service') {
    const calls = recordOf(description.services, name)?.calls
    return isStored(calls)
      ? Object.values(calls).flatMap((call) => (isStored(call) ? [call.input, call.output] : []))
      : []
  }
  const record =
    recordOf(description.functions, name) ?? recordOf(description.flows, name) ?? recordOf(description.models, name)
  return [record?.input, record?.output]
}

/**
 * A `link` that names a table which the project does not hold: in a column, in an input or an output of a
 * function, a flow, a model and a call of a service, and in an argument of a command.
 */
export const rule: Rule = {
  code: 'T2005',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      const types = typesOf(description, one.word, one.name)
      const missing = new Set<string>()
      inside(types, (type) => {
        if (type.kind === 'link' && typeof type.table === 'string' && !Object.hasOwn(description.tables, type.table))
          missing.add(type.table)
      })
      for (const name of missing)
        found.push(
          at(
            'T2005',
            one,
            undefined,
            `a \`link\` names the table \`${name}\`, and the project has no table of that name.`,
            `Name a table of the project, or add the table \`${name}\`.`,
          ),
        )
    }
    return found
  },
}
