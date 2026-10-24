import type { Finding } from '../../core/index.ts'
import type { Handed } from '../asked.ts'
import { askedOf } from '../asked.ts'
import { madeBy, reached, writtenByName } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/** A value that is searched with or written to a vector column, where the column states one model and the type of the value, or the `embed` that made it in a body, states another. */
export const rule: Rule = {
  code: 'T2012',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenByName(source)
    for (const asked of askedOf(description)) {
      const place = written.get(asked.definition)
      if (!place) continue
      const inputs = Object.hasOwn(description.functions, asked.definition)
        ? description.functions[asked.definition].input
        : undefined
      /** The model that a handed value states, and how the finding names the value. A side that states none is held to none. */
      const stated = (value: Handed): [model: string, what: string] | undefined => {
        if (value.embed !== undefined)
          return [
            madeBy(description, { kind: 'vector', model: value.embed }) ?? value.embed,
            `what \`${value.embed}.embed\` answered`,
          ]
        const type = value.input !== undefined && isStored(inputs) ? inputs[value.input] : undefined
        const model = isStored(type) ? madeBy(description, type) : undefined
        return model === undefined ? undefined : [model, `the input \`${String(value.input)}\``]
      }
      const handed = Object.entries(asked.write?.values ?? {}).map(
        ([name, value]): [column: string, value: Handed, how: string] => [name, value, 'written to'],
      )
      if (asked.near) handed.push([asked.near.column, asked.near.value, 'searched with'])
      for (const [name, value, how] of handed) {
        const column = reached(description, asked.table, name)
        const model = column ? madeBy(description, column.type) : undefined
        const other = stated(value)
        if (!column || model === undefined || other === undefined || other[0] === model) continue
        found.push(
          at(
            'T2012',
            place,
            undefined,
            `\`${column.table}.${column.column}\` holds vectors of the model ${model}, and is ${how} ${other[1]}, a vector of the model ${other[0]}. Vectors of two models cannot be compared.`,
            'Make the value with the model that the column states, or state that model on the type of the value.',
          ),
        )
      }
    }
    return found
  },
}
