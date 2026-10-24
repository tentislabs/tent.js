import type { Finding } from '../../core/index.ts'
import { columnsOf } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'

/** The table a column links to: of a link, or of each link of a list of links. */
function linkedBy(type: unknown): unknown {
  const kind: unknown = Reflect.get(Object(type), 'kind')
  if (kind === 'link') return Reflect.get(Object(type), 'table')
  return kind === 'list' ? linkedBy(Reflect.get(Object(type), 'of')) : undefined
}

/**
 * A link from a table to a table kept in memory, whose rows go by themselves, one link or a list of them: the
 * link would point at nothing.
 */
export const rule: Rule = {
  code: 'T2027',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const table of writtenIn(source)) {
      if (table.word !== 'table' || !Object.hasOwn(description.tables, table.name)) continue
      for (const [name, type] of Object.entries(columnsOf(description, table.name))) {
        const linked = linkedBy(type)
        const target = typeof linked === 'string' ? description.tables[linked] : undefined
        if (target?.kept !== 'memory') continue
        found.push(
          at(
            'T2027',
            table,
            undefined,
            `the link \`${name}\` points at \`${String(linked)}\`, a table kept in memory, whose rows go by themselves.`,
            `Link the other way, from \`${String(linked)}\` to \`${table.name}\`, or keep the rows in a table that stays.`,
          ),
        )
      }
    }
    return found
  },
}
