import type { Finding } from '../../core/index.ts'
import { askedOf } from '../asked.ts'
import { reached, writtenByName } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'

// What a fingerprint answers of a value: that it is equal, one of a list, or another, and whether one is there.
const equal = ['is', 'in', 'not', 'empty']

/** A sort or a range on a column that is sealed and findable: a fingerprint answers an equal value alone. */
export const rule: Rule = {
  code: 'T2026',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenByName(source)
    for (const asked of askedOf(description)) {
      const place = written.get(asked.definition)
      if (!place) continue
      const uses = [
        ...asked.sorts.map((name) => ({ name, what: 'a sort' })),
        ...asked.filters
          .filter((one) => !equal.includes(one.op))
          .map((one) => ({ name: one.column, what: `\`${one.op}\`` })),
      ]
      for (const { name, what } of uses) {
        const column = reached(description, asked.table, name)
        if (column?.type.findable !== true) continue
        found.push(
          at(
            'T2026',
            place,
            undefined,
            `\`${column.table}.${column.column}\` is sealed and found by its fingerprint, which answers an equal value alone: ${what} cannot be asked of it.`,
            'Find the row by an equal value, and sort or compare by a column that is not sealed.',
          ),
        )
      }
    }
    return found
  },
}
