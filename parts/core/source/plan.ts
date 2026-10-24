import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Doc } from './doc.ts'
import { called, listDoc, recordDoc } from './doc.ts'
import { exprDoc } from './expr.ts'
import { keyText, quoted } from './texts.ts'
import type { Writing } from './writing.ts'
import { naming, ours } from './writing.ts'

const joins = ['any', 'all', 'not']
const flags = ['col', 'given']

/** One stored filter of a column as the entries it is written with: the column, and its value or its operators. */
function ofColumn(w: Writing, filter: Stored): { col: string; is?: Doc; operators: [string, Doc][] } {
  const value = (stored: unknown): Doc =>
    filter.given === true ? called(ours(w, 'given'), [exprDoc(w, stored)]) : exprDoc(w, stored)
  const operators: [string, Doc][] = []
  let is: Doc | undefined
  for (const [operator, stored] of Object.entries(filter)) {
    if (flags.includes(operator)) continue
    if (operator === 'is') is = value(stored)
    else operators.push([operator, operator === 'empty' || operator === 'filled' ? exprDoc(w, stored) : value(stored)])
  }
  return { col: String(filter.col), ...(is !== undefined ? { is } : {}), operators }
}

/**
 * The entries of a record that a list of stored filters is written as, or nothing where no one record says them in
 * their order: a column stands once in a record, with one value or with its operators, and so does each of `any`,
 * `all` and `not`.
 */
function asEntries(w: Writing, filters: Stored[]): Doc[] | undefined {
  const made: { key: string; is?: Doc; operators: [string, Doc][]; joined?: Doc }[] = []
  for (const filter of filters) {
    const join = 'col' in filter ? undefined : joins.find((key) => key in filter)
    const last = made.at(-1)
    if (join !== undefined) {
      if (made.some((one) => one.key === join)) return undefined
      const inner = filter[join]
      const joined = Array.isArray(inner) ? listDoc(inner.map((one) => filterDoc(w, one))) : filterDoc(w, inner)
      made.push({ key: join, operators: [], joined })
      continue
    }
    const { col, is, operators } = ofColumn(w, filter)
    // A column named as a word that joins filters cannot be told from that word in a record.
    if (joins.includes(col)) return undefined
    if (last?.key === col && last.is === undefined && is === undefined && !last.joined) {
      if (operators.some(([name]) => last.operators.some(([held]) => held === name))) return undefined
      last.operators.push(...operators)
    } else if (made.some((one) => one.key === col)) return undefined
    else made.push({ key: col, ...(is !== undefined ? { is } : {}), operators })
  }
  return made.map((one) => [
    `${keyText(one.key)}: `,
    one.joined ?? one.is ?? recordDoc(one.operators.map(([name, value]) => [`${name}: `, value])),
  ])
}

/** Takes a stored filter. Answers it as it is written: a record from a column to a value or to its operators, joined with `any`, `all` and `not`. */
export function filterDoc(w: Writing, filter: unknown): Doc {
  if (!isStored(filter)) return '{}'
  if (Array.isArray(filter.all)) {
    const all = filter.all.filter(isStored)
    // One record says several filters. A list of one, and a list that no record says in its order, is written as `all`.
    const entries = all.length === 1 ? undefined : asEntries(w, all)
    return recordDoc(entries ?? [['all: ', listDoc(all.map((one) => filterDoc(w, one)))]])
  }
  return recordDoc(asEntries(w, [filter]) ?? [])
}

/** What a group works out for one of its names: a count, or a column summed up, averaged, or its least or most. */
function groupedDoc(w: Writing, value: unknown): Doc {
  const [[word, column]] = Object.entries(isStored(value) ? value : { count: true })
  return called(ours(w, word), word === 'count' ? [] : [quoted(String(column))])
}

/** The table that a plan, a write or a trigger starts at, with the tenant whose file it is for where it is a tenant table. */
const tableDoc = (w: Writing, table: unknown, of: unknown): Doc =>
  of === undefined ? naming(w, String(table)) : [naming(w, String(table)), called('.of', [exprDoc(w, of)])]

/** Takes a stored plan. Answers it as a chain from its table, its members in one fixed order. */
export function planDoc(w: Writing, plan: Stored): Doc {
  const chain: Doc[] = [tableDoc(w, plan.from, plan.of)]
  const member = (name: string, values: Doc[]): void => {
    chain.push(called(`.${name}`, values))
  }
  if (plan.one === 'get') member('get', [exprDoc(w, plan.id)])
  if (plan.history === true) member('history', [exprDoc(w, plan.id)])
  if (plan.where !== undefined) member('where', [filterDoc(w, plan.where)])
  if (plan.search !== undefined) member('search', [exprDoc(w, plan.search)])
  for (const column of Array.isArray(plan.with) ? plan.with : []) member('with', [quoted(String(column))])
  if (isStored(plan.near)) {
    const { col, value, ...more } = plan.near
    const options = Object.entries(more).map(([name, one]): Doc => [`${name}: `, exprDoc(w, one)])
    member('near', [quoted(String(col)), exprDoc(w, value), ...(options.length ? [recordDoc(options)] : [])])
  }
  if (isStored(plan.group)) {
    const by = Array.isArray(plan.group.by) ? plan.group.by.map(String) : []
    const values = Object.entries(isStored(plan.group.values) ? plan.group.values : {})
    member('group', [
      by.length === 1 ? quoted(by[0]) : listDoc(by.map(quoted)),
      recordDoc(values.map(([name, one]) => [`${keyText(name)}: `, groupedDoc(w, one)])),
    ])
  }
  const sort = (Array.isArray(plan.sort) ? plan.sort : []).filter(isStored)
  if (sort.length === 1) member(sort[0].down === true ? 'newest' : 'oldest', [quoted(String(sort[0].by))])
  else if (sort.length)
    member(
      'sort',
      sort.map((one) => quoted(`${one.down === true ? '-' : ''}${one.by}`)),
    )
  for (const name of ['limit', 'skip', 'after']) if (plan[name] !== undefined) member(name, [exprDoc(w, plan[name])])
  if (Array.isArray(plan.pick)) member('pick', [listDoc(plan.pick.map((one) => quoted(String(one))))])
  if (isStored(plan.rank)) {
    const top = plan.rank.top === undefined ? [] : [recordDoc([['top: ', exprDoc(w, plan.rank.top)]])]
    member('rank', [naming(w, String(plan.rank.model)), exprDoc(w, plan.rank.words), ...top])
  }
  if (plan.one === 'first') member('first', [])
  if (plan.count === true) member('count', [])
  return chain
}

/** A record of values by name: the values of a write, each column with its value, and the `where` of an event. */
const valuesDoc = (w: Writing, values: unknown): Doc =>
  recordDoc(
    Object.entries(isStored(values) ? values : {}).map(([name, one]) => [`${keyText(name)}: `, exprDoc(w, one)]),
  )

/** Takes a stored write. Answers it as it is written: the table, and `add`, `change` or `remove`. */
export function writeDoc(w: Writing, write: Stored): Doc {
  if (typeof write.add === 'string')
    return [tableDoc(w, write.add, write.of), called('.add', [valuesDoc(w, write.values)])]
  if (typeof write.change === 'string')
    return [tableDoc(w, write.change, write.of), called('.change', [exprDoc(w, write.id), valuesDoc(w, write.values)])]
  return [tableDoc(w, write.remove, write.of), called('.remove', [exprDoc(w, write.id)])]
}

/** Takes a stored trigger. Answers it as it is written, or nothing for the entry that an incoming call added. */
export function triggerDoc(w: Writing, trigger: Stored): Doc | undefined {
  if ('incoming' in trigger) return undefined
  if (typeof trigger.every === 'string') return called(ours(w, 'every'), [quoted(trigger.every)])
  if (typeof trigger.event === 'string')
    return called(ours(w, 'event'), [
      quoted(trigger.event),
      ...(trigger.where === undefined ? [] : [recordDoc([['where: ', valuesDoc(w, trigger.where)]])]),
    ])
  if (typeof trigger.cron === 'string')
    return called(ours(w, 'cron'), [
      quoted(trigger.cron),
      ...(typeof trigger.zone === 'string' ? [recordDoc([`zone: ${quoted(trigger.zone)}`])] : []),
    ])
  const options: Doc[] = []
  if (trigger.where !== undefined) options.push(['where: ', filterDoc(w, trigger.where)])
  if (Array.isArray(trigger.columns))
    options.push(['columns: ', listDoc(trigger.columns.map((one) => quoted(String(one))))])
  return [naming(w, String(trigger.table)), called(`.${trigger.when}`, options.length ? [recordDoc(options)] : [])]
}
