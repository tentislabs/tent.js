import type { Finding } from '../../core/index.ts'
import type { Asked } from '../asked.ts'
import { askedOf } from '../asked.ts'
import { columnsOf, listsOf, reached, writtenByName } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'

// What `near` does not join with, by the name of each in a plan.
const apart = ['sort', 'group', 'count', 'skip', 'after', 'get']

const asColumn =
  'A vector is searched with `near`, and held to nothing else: read it with `pick`, and ask `{ empty: true }` for the rows that have none.'

/** The misuses of one plan: a vector column that is used as an ordinary one, and a `near` where it does not belong. */
function misuses(description: Parameters<typeof reached>[0], asked: Asked): [message: string, fix: string][] {
  const found: [string, string][] = []
  const isVector = (name: string): boolean => reached(description, asked.table, name)?.type.kind === 'vector'
  const named = (name: string): string => `\`${asked.table}.${name.replace(/^-/, '')}\``
  for (const column of new Set(asked.filters.filter((one) => one.op !== 'empty').map((one) => one.column)))
    if (isVector(column))
      found.push([`the vector column ${named(column)} stands in a filter other than \`empty\`.`, asColumn])
  for (const column of new Set(asked.sorts))
    if (isVector(column)) found.push([`the vector column ${named(column)} stands in a sort.`, asColumn])
  for (const column of new Set([...asked.groups, ...asked.worked]))
    if (isVector(column)) found.push([`the vector column ${named(column)} stands in a group.`, asColumn])
  if (!asked.near) return found
  if (!isVector(asked.near.column))
    found.push([
      `\`near\` names ${named(asked.near.column)}, which is no vector column.`,
      'Name a column whose type is `vector` itself.',
    ])
  const joined = apart.filter((name) => asked.joins.includes(name))
  if (joined.length)
    found.push([
      `\`near\` is joined with \`${joined.join('`, `')}\`, which it does not join with: it joins with \`where\`, \`search\`, \`with\`, \`pick\`, \`limit\` and \`first()\`.`,
      'Take it out of the plan. To order rows by words and by meaning together, write `search` and `near` in one plan.',
    ])
  if (asked.inRule)
    found.push([
      '`near` stands in the filter of a `where` rule.',
      'A rule holds a row to a filter of its columns: read by meaning in a query, under the rule.',
    ])
  else if (asked.inIn)
    found.push([
      '`near` stands inside `in`.',
      'Read the nearest rows in a query of their own, and hand their ids on as an input.',
    ])
  return found
}

/** A vector column in a filter other than `empty`, a sort, an index, `unique` or a group, and a `near` on a column that is no vector, joined with what it does not join with, inside `in`, or in the filter of a `where` rule. */
export const rule: Rule = {
  code: 'T2010',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const table of writtenIn(source)) {
      if (table.word !== 'table' || !Object.hasOwn(description.tables, table.name)) continue
      const columns = columnsOf(description, table.name)
      for (const option of ['indexes', 'unique'])
        for (const list of listsOf(description.tables[table.name], option))
          for (const name of list)
            if (Object.hasOwn(columns, name) && columns[name].kind === 'vector')
              found.push(
                at(
                  'T2010',
                  table,
                  undefined,
                  `the vector column \`${name}\` stands in \`${option}\`.`,
                  `Take \`${name}\` out of \`${option}\`: the store keeps the vectors of a column by itself.`,
                ),
              )
    }
    const written = writtenByName(source)
    for (const asked of askedOf(description)) {
      const place = written.get(asked.definition)
      if (place)
        for (const [message, fix] of misuses(description, asked))
          found.push(at('T2010', place, undefined, message, fix))
    }
    return found
  },
}
