import type { Finding } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { columnsOf, writtenByName } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at, inside, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/** One column that states `by` of work, with what it names. */
interface Filled {
  table: string
  column: string
  type: Record<string, unknown>
  work: string
  input: Record<string, string>
  take?: string
}

/** The columns of a description that work fills: a vector column whose model turns columns into it is no such column. */
function filledIn(description: Description): Filled[] {
  const found: Filled[] = []
  for (const [table, stored] of Object.entries(description.tables)) {
    const columns: Record<string, unknown> = isStored(stored.columns) ? stored.columns : {}
    for (const [column, type] of Object.entries(columns)) {
      if (!isStored(type) || !isStored(type.by) || typeof type.by.work !== 'string') continue
      const work = type.by.work
      const fn = Object.hasOwn(description.functions, work) ? description.functions[work] : undefined
      const fields = isStored(fn?.input) ? Object.keys(fn.input) : []
      const named = isStored(type.by.input) ? type.by.input : {}
      const input = Object.fromEntries(
        fields.map((field) => [field, typeof named[field] === 'string' ? String(named[field]) : field]),
      )
      found.push({
        table,
        column,
        type,
        work,
        input,
        ...(typeof type.by.take === 'string' ? { take: type.by.take } : {}),
      })
    }
  }
  return found
}

/** What is wrong with the columns that one filled column reads: a name that is no column, or a link into another file. */
function readsWrong(description: Description, one: Filled): string | undefined {
  const columns = columnsOf(description, one.table)
  const tenant = description.tables[one.table]?.tenant
  for (const path of Object.values(one.input)) {
    const [first = '', rest] = path.split('.', 2)
    const type = columns[first]
    if (first !== 'id' && !isStored(type))
      return `names in its \`input\` \`${path}\`, which is no column of \`${one.table}\``
    if (rest === undefined) continue
    const target = isStored(type) && typeof type.table === 'string' ? type.table : undefined
    if (!target) return `reads in its \`input\` \`${path}\` through \`${first}\`, which is no link`
    if (!Object.hasOwn(columnsOf(description, target), rest) && rest !== 'id')
      return `names in its \`input\` \`${path}\`, which is no column of \`${target}\``
    if (description.tables[target]?.tenant !== tenant)
      return `reads in its \`input\` \`${path}\` through a link into another file, which one write cannot reach`
  }
  return undefined
}

/** The filled columns that stand in a ring, each read by the next, as `<table>.<column>`. */
function inRing(all: Filled[]): Set<string> {
  const reads = new Map(
    all.map((one) => [
      `${one.table}.${one.column}`,
      Object.values(one.input)
        .filter((path) => !path.includes('.'))
        .map((path) => `${one.table}.${path}`)
        .filter((key) => all.some((other) => `${other.table}.${other.column}` === key)),
    ]),
  )
  const ring = new Set<string>()
  for (const start of reads.keys()) {
    const seen = new Set<string>()
    const walk = (key: string): boolean => {
      if (key === start && seen.size) return true
      if (seen.has(key)) return false
      seen.add(key)
      return (reads.get(key) ?? []).some(walk)
    }
    if (walk(start)) ring.add(start)
  }
  return ring
}

/** Whether a stored answer type plainly fits a column type: both of one kind, where the check can see both. */
function fits(answer: unknown, column: Record<string, unknown>): boolean {
  if (!isStored(answer) || typeof answer.kind !== 'string') return true
  return answer.kind === column.kind
}

/**
 * The cases of a column that work fills which the check can see: a `by` that names no action, `python` or model;
 * an `input` that names no column of the row, or reads through a link into another file; an answer, or the field
 * that `take` names, that does not fit the column; a definition that fills a column and states no `system`, or
 * states `rows`; a filled column that is required; a ring of filled columns; and a filter with `filled` on a column
 * that states no `by`.
 */
export const rule: Rule = {
  code: 'T2015',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenByName(source)
    const all = filledIn(description)
    const ring = inRing(all)
    for (const one of all) {
      const place = written.get(one.table)
      if (!place) continue
      const name = `${one.table}.${one.column}`
      const said = (message: string, fix: string): void =>
        void found.push(at('T2015', place, undefined, `\`${name}\` ${message}.`, fix))
      const fn = Object.hasOwn(description.functions, one.work) ? description.functions[one.work] : undefined
      const model = Object.hasOwn(description.models, one.work)
      if (one.type.optional !== true)
        said(
          'states `by` and is required: until its work made it, it stands empty',
          'State `optional: true` on the column.',
        )
      if (!model && fn?.kind !== 'action') {
        said(
          `names \`${one.work}\` in \`by\`, which is no action, python or model`,
          'Name an action, a python or a model.',
        )
        continue
      }
      const wrong = readsWrong(description, one)
      if (wrong) said(wrong, 'Name in `input` the columns of the row, or of a row it links to in the same file.')
      if (ring.has(name))
        said('is in a ring of filled columns, each made from the next', 'Let one of them be written by the app.')
      if (fn && typeof fn.system !== 'string')
        said(
          `is filled by \`${one.work}\`, which states no \`system\`: it runs as the app`,
          "State `system: 'why'` on the work.",
        )
      if (fn && fn.rows !== undefined)
        said(
          `is filled by \`${one.work}\`, which states \`rows\`: what it is handed is all it may read`,
          'Leave `rows` out; read through `input`.',
        )
      const output: unknown = fn?.output
      const answer =
        one.take === undefined
          ? output
          : isStored(output) && isStored(output.shape)
            ? output.shape[one.take]
            : undefined
      if (!fits(answer, one.type))
        said(
          `is filled with an answer of \`${one.work}\` that does not fit it`,
          'Answer a value of the type of the column, or `take` a field that has it.',
        )
    }
    // `columns` in `by` names what a model turns into a vector: on any other column it fills nothing.
    for (const [table, stored] of Object.entries(description.tables)) {
      const place = written.get(table)
      for (const [column, type] of Object.entries(isStored(stored.columns) ? stored.columns : {}))
        if (
          place &&
          isStored(type) &&
          isStored(type.by) &&
          type.by.columns !== undefined &&
          (type.kind !== 'vector' || type.model === undefined)
        )
          found.push(
            at(
              'T2015',
              place,
              undefined,
              `\`${table}.${column}\` states \`columns\` in \`by\`, which only a vector with a model takes.`,
              'Name the work that fills the column in `by`, or make it a `vector` with a `model`.',
            ),
          )
    }
    // A filter that asks whether a value was filled, on a column that states no `by`.
    for (const one of writtenIn(source)) {
      const stored = description.functions[one.name] ?? description.flows[one.name]
      if (!stored) continue
      inside(stored, (record) => {
        if (typeof record.from !== 'string' || record.where === undefined) return
        const table = record.from
        inside(record.where, (filter) => {
          if (typeof filter.col !== 'string' || filter.filled === undefined) return
          const type = columnsOf(description, table)[filter.col]
          if (isStored(type) && isStored(type.by)) return
          found.push(
            at(
              'T2015',
              one,
              undefined,
              `a filter asks \`filled\` of ${table}.${filter.col}, a column that states no \`by\`.`,
              'Ask `filled` of a column that work fills, or `empty` of any other.',
            ),
          )
        })
      })
    }
    return found
  },
}
