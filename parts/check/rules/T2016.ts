import type { Finding } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { shownLayouts, isStored } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { statedAt } from '../stated.ts'

// What a table that shows a table of the engine's own states beside `shows` and `access.read`, which is not for it.
const notStated = ['columns', 'owner', 'search', 'indexes', 'unique', 'tenant', 'keepHistory']

// The members of a plan that are not for it.
const notRead = ['search', 'near', 'history']

/** What one stored record does to a table: the members of its plans that are not for it, at any depth. */
function membersOn(node: unknown, table: string, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const one of node) membersOn(one, table, found)
    return found
  }
  if (!isStored(node)) return found
  // A plan names its table in `from`; a chain of a body in `db`, with its members after it in `then`.
  if (node.from === table)
    for (const member of notRead) if (node[member] !== undefined && node[member] !== false) found.add(member)
  const plan = isStored(node.plan) ? node.plan : undefined
  if (plan?.db === table && Array.isArray(node.then))
    for (const step of node.then)
      for (const member of notRead) if (isStored(step) && step[member] !== undefined) found.add(member)
  for (const value of Object.values(node)) membersOn(value, table, found)
  return found
}

/** Whether a flow is set off by a write of a table. */
const setOffBy = (flow: Record<string, unknown>, table: string): boolean =>
  (Array.isArray(flow.on) ? flow.on : [flow.on]).some((one) => isStored(one) && one.table === table)

/** The tables of a description that show a table of the engine's own, each with what it shows: the counts or the scores. */
const shownIn = (description: Description): Map<string, string> =>
  new Map(
    Object.entries(description.tables)
      .filter(([, table]) => table.shows === 'counts' || table.shows === 'scores')
      .map(([name, table]) => [name, String(table.shows)]),
  )

/**
 * What is not for a table that shows the counts or the scores: columns and options stated on it, a rule other than
 * `read`, no `read`, a second table that shows the same; a write of it, `search`, `near` and `history` on it, and a
 * trigger on it, since a flow that the counting set off would be counted itself.
 */
export const rule: Rule = {
  code: 'T2016',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const shown = shownIn(description)
    const fix = 'Read it with a filter, a sort, `count` or `group`, and state `access: { read }` and nothing more.'
    for (const written of writtenIn(source)) {
      const stated = written.word === 'table' ? description.tables[written.name]?.shows : undefined
      if (typeof stated === 'string' && !Object.hasOwn(shownLayouts, stated))
        found.push(
          at(
            'T2016',
            written,
            statedAt(written, ['shows']),
            `it states \`shows: '${stated}'\`, and a table shows only 'counts' or 'scores'.`,
            "Write `shows: 'counts'` or `shows: 'scores'`, or give the table its `columns`.",
          ),
        )
      const shows = written.word === 'table' ? shown.get(written.name) : undefined
      if (shows !== undefined) {
        const table = description.tables[written.name]
        const said = [
          ...notStated.filter((one) => table[one] !== undefined && table[one] !== false).map((one) => `\`${one}\``),
          ...['add', 'change', 'remove']
            .filter((one) => Reflect.get(Object(table.access), one) !== undefined)
            .map((one) => `a rule to ${one}`),
        ]
        if (Reflect.get(Object(table.access), 'read') === undefined) said.push('no `read` rule')
        const same = [...shown].filter(([, what]) => what === shows).map(([name]) => name)
        if (same.indexOf(written.name) > 0) said.push(`it is the second, beside ${same[0]}`)
        if (said.length)
          found.push(at('T2016', written, undefined, `it shows the ${shows}, and states ${said.join(', ')}.`, fix))
        continue
      }
      const record = Object.hasOwn(description.functions, written.name)
        ? description.functions[written.name]
        : Object.hasOwn(description.flows, written.name)
          ? description.flows[written.name]
          : undefined
      if (!record) continue
      for (const [table, shows] of shown) {
        const touches = Array.isArray(record.touches) ? record.touches.map(String) : []
        const said = [
          ...(touches.includes(table) ? [`writes ${table}`] : []),
          ...[...membersOn([record.plan, record.body], table)].map((member) => `uses \`${member}\` on ${table}`),
          ...(written.word === 'flow' && setOffBy(record, table) ? [`is set off by a write of ${table}`] : []),
        ]
        if (said.length)
          found.push(
            at('T2016', written, undefined, `it ${said.join(', ')}, which shows the ${shows} and is read alone.`, fix),
          )
      }
    }
    return found
  },
}
