import type { Finding } from '../../core/index.ts'
import { askedOf } from '../asked.ts'
import { columnsOf, listsOf, reached, searchOf, writtenByName } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at, inside, writtenIn } from '../rule.ts'

const fix =
  'To find a row by a sealed value, keep `fingerprint(value)` in a second column that is not sealed, and filter by that.'

/** A `sealed` column where the store would have to read it: in a filter, a sort, a group, an index, `search` or `unique`, or named by a `from`. */
export const rule: Rule = {
  code: 'T2011',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const table of writtenIn(source)) {
      if (table.word !== 'table' || !Object.hasOwn(description.tables, table.name)) continue
      const stored = description.tables[table.name]
      const columns = columnsOf(description, table.name)
      const sealed = (name: string): boolean => Object.hasOwn(columns, name) && columns[name].sealed === true
      const say = (name: string, where: string): void =>
        void found.push(at('T2011', table, undefined, `the sealed column \`${name}\` ${where}.`, fix))
      for (const option of ['indexes', 'unique'])
        for (const name of new Set(listsOf(stored, option).flat()))
          if (sealed(name)) say(name, `stands in \`${option}\``)
      for (const name of searchOf(stored)) if (sealed(name)) say(name, 'stands in `search`')
      for (const [name, type] of Object.entries(columns)) {
        for (const option of ['unique', 'index'])
          if (type.sealed === true && type[option] === true) say(name, `states \`${option}\``)
        const read = new Set<string>()
        inside(type.from, (value) => {
          if (typeof value.col === 'string' && sealed(value.col)) read.add(value.col)
        })
        for (const from of read) say(from, `is named by the \`from\` of \`${name}\``)
      }
    }
    const written = writtenByName(source)
    for (const asked of askedOf(description)) {
      const place = written.get(asked.definition)
      if (!place) continue
      // A sealed column that is found answers an equal value by its fingerprint, and T2026 says the rest of it.
      const findable = (name: string): boolean => reached(description, asked.table, name)?.type.findable === true
      const uses: [string, string[]][] = [
        ['a filter', asked.filters.map((one) => one.column).filter((name) => !findable(name))],
        ['a sort', asked.sorts.filter((name) => !findable(name))],
        ['a group', [...asked.groups, ...asked.worked]],
      ]
      for (const [where, names] of uses)
        for (const name of new Set(names)) {
          const column = reached(description, asked.table, name)
          if (column?.type.sealed === true)
            found.push(
              at(
                'T2011',
                place,
                undefined,
                `the sealed column \`${column.table}.${column.column}\` stands in ${where}. A sealed value is stored encrypted, so the store cannot compare it or order by it.`,
                fix,
              ),
            )
        }
    }
    return found
  },
}
