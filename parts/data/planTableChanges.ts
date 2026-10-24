import { isDeepStrictEqual } from 'node:util'
import type { Finding } from '../core/index.ts'
import { finding } from '../core/internal.ts'
import { tenantTable } from './fileLayout.ts'
import { mustBeHeld, keptLayout, keptType, sameButNeed } from './keptType.ts'
import type { ColumnType, TableLayout, TableStep } from './store.ts'
import { wasOf } from './wasOf.ts'

const wayForward = 'Add a new column, fill it with a change, then remove the old one.'
const wayOfRows = 'Take the version with `--move`, which moves the rows: `tent publish --move`, or `tent start --move`.'

// The kinds between which every row may convert: a number to text and back, a choice to text and back.
const converts = ['number text', 'text number', 'choice text', 'text choice']

const sameList = (a: string[], b: string[]): boolean => a.join() === b.join()
const holds = (lists: string[][], columns: string[]): boolean => lists.some((one) => sameList(one, columns))

/** What is gathered for one table, in the order in which its steps are carried out. */
interface Gathered {
  table: string
  names: TableStep[]
  columns: TableStep[]
  rebuild: boolean
  after: TableStep[]
  findings: Finding[]
}

/** What becomes of a column whose type changed: one step, or the words of why the change is never applied by itself. */
type Becomes = 'retype' | 'relax' | 'require' | 'empty' | { never: string }

/** Takes the type a column has, the type it is to have, each as a file keeps it, and what the column says of its old values. Answers what becomes of the column. */
function becomes(old: ColumnType, next: ColumnType, oldValues: unknown): Becomes {
  if (old.kind !== next.kind && !converts.includes(`${old.kind} ${next.kind}`))
    return { never: `changed from \`${old.kind}\` to \`${next.kind}\`` }
  if (old.kind === 'vector' && next.kind === 'vector') {
    const [made, makes] = [Reflect.get(old, 'made'), Reflect.get(next, 'made')]
    // The vectors of another model cannot be compared with the new ones: the column says what becomes of them.
    if (made !== makes && made !== undefined && makes !== undefined && oldValues === 'drop') return 'empty'
    if (old.size !== next.size) return { never: `changed its size from ${old.size} to ${next.size}` }
    // A model that is stated for the first time, and one that is no longer stated, is recorded, as with `old: 'keep'`.
    return made === makes || made === undefined || makes === undefined || oldValues === 'keep' ? 'relax' : 'retype'
  }
  if (old.kind === 'link' && next.kind === 'link' && old.table !== next.table)
    return { never: `links to \`${next.table}\` in place of \`${old.table}\`` }
  const [sealed, seals] = [Reflect.get(old, 'sealed') === true, Reflect.get(next, 'sealed') === true]
  if (sealed !== seals && old.kind !== next.kind) return { never: 'changed its kind and whether it is sealed at once' }
  if (sameButNeed(old, next) && mustBeHeld(old) !== mustBeHeld(next)) return mustBeHeld(next) ? 'require' : 'relax'
  return 'retype'
}

/**
 * The steps that lead from the type a column has to the type it is to have. A change that every row converts to,
 * and one that the rows must be held against, is the step `retype`, which `findMisfits` checks. A change that is
 * never applied by itself is found (T2001).
 */
function typeSteps(
  table: string,
  column: string,
  held: ColumnType,
  asked: ColumnType,
  to: Gathered,
  renames: Map<string, string>,
): void {
  const [kept, next] = [keptType(held), keptType(asked)]
  // The store writes the new name of a table into every link when it renames the table: the link follows.
  const old = kept.kind === 'link' ? { ...kept, table: renames.get(kept.table) ?? kept.table } : kept
  if (isDeepStrictEqual(old, next)) return
  const act = becomes(old, next, Reflect.get(asked, 'old'))
  if (typeof act === 'object') {
    to.findings.push(
      finding(
        'T2001',
        `The type of \`${table}.${column}\` ${act.never}, and such a change is never applied by itself.`,
        {
          fix: wayForward,
        },
      ),
    )
    return
  }
  to.columns.push({ do: act, table, column, to: next })
  // A `from` that is new, or another one, is worked out for every row by a rebuild.
  const from = Reflect.get(next, 'from')
  if (act === 'retype' && from !== undefined && !isDeepStrictEqual(from, Reflect.get(old, 'from'))) to.rebuild = true
}

/** The steps that add a column to a table that is there. */
function addSteps(table: string, column: string, asked: ColumnType, to: Gathered): void {
  const type = keptType(asked)
  const worked = 'from' in type && type.from !== undefined
  // A column that every row must hold a value in is added as one that may hold nothing, and then held against the rows.
  const required = mustBeHeld(type) && !worked
  to.columns.push({ do: 'addColumn', table, column, to: required ? { ...type, optional: true } : type })
  if (required) to.columns.push({ do: 'require', table, column, to: type })
  if (worked) to.rebuild = true
}

/**
 * The steps that lead from a table as the file holds it to the table as it is asked for, under the name it now has.
 * `renames` holds each table that goes on under a new name in the same plan: the old name by the new one.
 */
function tableSteps(held: TableLayout, asked: TableLayout, renames: Map<string, string>): Gathered {
  const table = asked.name
  const to: Gathered = { table, names: [], columns: [], rebuild: false, after: [], findings: [] }
  const unused = held.unused ?? []
  // Each column that goes on under a new name: the old name by the new one.
  const renamed = new Map<string, string>()
  const added: string[] = []
  for (const [column, type] of Object.entries(asked.columns)) {
    const before = Object.hasOwn(held.columns, column)
      ? column
      : wasOf(type).find(
          (name) => Object.hasOwn(held.columns, name) && !Object.hasOwn(asked.columns, name) && !renamed.has(name),
        )
    if (before === undefined) {
      added.push(column)
      addSteps(table, column, type, to)
      continue
    }
    if (before !== column) {
      renamed.set(before, column)
      to.names.push({ do: 'renameColumn', table, column, from: before })
    }
    if (unused.includes(before)) to.names.push({ do: 'reviveColumn', table, column })
    typeSteps(table, column, held.columns[before], type, to, renames)
  }
  for (const column of Object.keys(held.columns)) {
    if (Object.hasOwn(asked.columns, column) || renamed.has(column) || unused.includes(column)) continue
    if (asked.removed?.includes(column)) to.after.push({ do: 'retireColumn', table, column })
    else if (added.length)
      to.findings.push(
        finding(
          'T2004',
          `The column \`${table}.${column}\` is gone and \`${added.join('`, `')}\` is new, with no \`was\`.`,
          {
            fix: `State \`was: ['${column}']\` on the column that is the same one under a new name, or name \`${column}\` in \`removed\` of the table.`,
          },
        ),
      )
    else
      to.findings.push(
        finding('T2002', `The column \`${table}.${column}\` is gone, and \`removed\` does not name it.`, {
          fix: `Name \`${column}\` in \`removed\` of the table, or state \`was: ['${column}']\` on the column it became.`,
        }),
      )
  }

  const now = (lists: string[][]) => lists.map((columns) => columns.map((name) => renamed.get(name) ?? name))
  const [indexes, unique] = [now(held.indexes), now(held.unique)]
  const index = (act: 'addIndex' | 'dropIndex' | 'addUnique', columns: string[]) =>
    to.columns.push({ do: act, table, columns })
  for (const columns of indexes) if (!holds(asked.indexes, columns)) index('dropIndex', columns)
  for (const columns of unique) {
    if (holds(asked.unique, columns)) continue
    // `dropIndex` takes the plain index first where the table has one over the same columns: it is made again.
    const plain = holds(indexes, columns) && holds(asked.indexes, columns)
    if (plain) index('dropIndex', columns)
    index('dropIndex', columns)
    if (plain) index('addIndex', columns)
  }
  for (const columns of asked.indexes) if (!holds(indexes, columns)) index('addIndex', columns)
  for (const columns of asked.unique) if (!holds(unique, columns)) index('addUnique', columns)
  if (!sameList(now([held.search])[0], asked.search) || held.by !== asked.by)
    to.columns.push({ do: 'addSearch', table, columns: asked.search, layout: keptLayout(asked) })
  return to
}

/** The finding of a table whose rows live elsewhere from now on: in the file of each tenant, in the shared file, or by another table. */
function moveFinding(table: string, was: string | undefined, now: string | undefined): Finding {
  const what =
    was === undefined
      ? `gains \`tenant\`: its rows live in the shared file, and in the files of the tenants of \`${now}\` from now on`
      : now === undefined
        ? `loses \`tenant\`: its rows live in the files of the tenants of \`${was}\`, and in the shared file from now on`
        : `states another \`tenant\`: its rows live in the files of the tenants of \`${was}\`, and of \`${now}\` from now on`
  // The layout of the files never names one table under two tables at once, so such rows move by the shared file.
  const fix =
    was !== undefined && now !== undefined
      ? `Move its rows in two versions, each taken with \`--move\`: one in which \`${table}\` states no \`tenant\`, which brings its rows into the shared file, then one in which its tenants are of \`${now}\`.`
      : wayOfRows
  return finding('T2001', `The table \`${table}\` ${what}. Such a change is never applied by itself.`, { fix })
}

/**
 * Takes the layout a data file holds, the layout a description asks for, and in `removed` the tables that the
 * project says were removed. Answers the steps that lead from the first to the second, in the order in which they
 * are carried out, and what was found: a column or a table that is gone with no statement (T2002, T2003), a name
 * that is gone while another is new (T2004), and a change of type that is never applied by itself (T2001). A stated
 * rename goes on with its rows, and a link to the renamed table follows it. A stated removal is retired and not
 * dropped, and what was retired and is asked for again is revived. A table that gains or loses `tenant`, or whose
 * tenants are of another table, is found (T2001, naming `--move`) and given no step: it reads no row, so it finds the
 * table whether it holds rows or not. Whether the rows fit a step is `findMisfits` to say.
 */
export function planTableChanges(
  old: TableLayout[],
  next: TableLayout[],
  o: { removed?: string[] } = {},
): { steps: TableStep[]; findings: Finding[] } {
  const held = new Map(old.map((table) => [table.name, table]))
  const asked = new Set(next.map((table) => table.name))
  const goesOn = new Set<string>()
  const names: TableStep[] = []
  const made: TableStep[] = []
  const tables: Gathered[] = []
  const fresh: string[] = []
  const goOn: { before: TableLayout; table: TableLayout }[] = []
  const renames = new Map<string, string>()
  const moved: Finding[] = []
  for (const table of next) {
    const before =
      held.get(table.name) ??
      wasOf(table)
        .map((name) => held.get(name))
        .find((one) => one !== undefined && !asked.has(one.name) && !goesOn.has(one.name))
    if (!before) {
      fresh.push(table.name)
      made.push({ do: 'addTable', table: table.name, layout: keptLayout(table) })
      continue
    }
    goesOn.add(before.name)
    if (before.name !== table.name) renames.set(before.name, table.name)
    goOn.push({ before, table })
  }
  for (const { before, table } of goOn) {
    const [was, now] = [tenantTable(before), tenantTable(table)]
    const by = was === undefined ? undefined : (renames.get(was) ?? was)
    if (by !== now) {
      moved.push(moveFinding(table.name, by, now))
      continue
    }
    if (before.name !== table.name) names.push({ do: 'renameTable', table: table.name, from: before.name })
    if (before.retired) names.push({ do: 'reviveTable', table: table.name })
    tables.push(tableSteps(before, table, renames))
  }
  const retired: TableStep[] = []
  const findings: Finding[] = []
  for (const table of old) {
    if (goesOn.has(table.name) || table.retired) continue
    if (o.removed?.includes(table.name)) retired.push({ do: 'retireTable', table: table.name })
    else if (fresh.length)
      findings.push(
        finding('T2004', `The table \`${table.name}\` is gone and \`${fresh.join('`, `')}\` is new, with no \`was\`.`, {
          fix: `State \`was: ['${table.name}']\` on the table that is the same one under a new name, or name \`${table.name}\` in \`removed\` of the project.`,
        }),
      )
    else
      findings.push(
        finding('T2003', `The table \`${table.name}\` is gone, and \`removed\` of the project does not name it.`, {
          fix: `Name \`${table.name}\` in \`removed\` of the project, or state \`was: ['${table.name}']\` on the table it became.`,
        }),
      )
  }
  const steps = [
    ...names,
    ...made,
    ...tables.flatMap((one): TableStep[] => [
      ...one.names,
      ...one.columns,
      ...(one.rebuild ? [{ do: 'rebuild', table: one.table } satisfies TableStep] : []),
      ...one.after,
    ]),
    ...retired,
  ]
  return { steps, findings: [...moved, ...tables.flatMap((one) => one.findings), ...findings] }
}
