import type { Finding } from '../../core/index.ts'
import { askedOf } from '../asked.ts'
import { reached, writtenByName } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/** A `near` value whose size is not the size of the column: an input that is declared as a vector, and a list that is written. */
export const rule: Rule = {
  code: 'T2008',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenByName(source)
    for (const asked of askedOf(description)) {
      const place = written.get(asked.definition)
      const column = asked.near ? reached(description, asked.table, asked.near.column) : undefined
      if (!asked.near || !place || column?.type.kind !== 'vector') continue
      const { input, length } = asked.near.value
      const inputs = Object.hasOwn(description.functions, asked.definition)
        ? description.functions[asked.definition].input
        : undefined
      const declared = input !== undefined && isStored(inputs) && isStored(inputs[input]) ? inputs[input] : undefined
      const size = declared?.kind === 'vector' ? declared.size : length
      if (typeof size !== 'number' || size === column.type.size) continue
      found.push(
        at(
          'T2008',
          place,
          undefined,
          `\`near\` is handed ${input === undefined ? 'a list' : `the input \`${input}\`,`} of ${size} numbers, and the column \`${column.table}.${column.column}\` holds vectors of ${String(column.type.size)}.`,
          `Hand it a vector of ${String(column.type.size)} numbers: declare the input as \`vector({ size: ${String(column.type.size)} })\`.`,
        ),
      )
    }
    return found
  },
}
