import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'
import type { Change } from '../../history/index.ts'
import type { ImpactLine, ImpactFacts } from './face.ts'
import type { Stored } from './read.ts'
import { fileOf, leftOut, listOf, recordsOf } from './read.ts'

/** How a table change lands: by itself, because the project states it, against the rows, or not at all. */
type Weight = 'safe' | 'stated' | 'hard' | 'refused'

/**
 * Takes a change of a column as compare tells it, with the column on both sides. Answers it in words, with how it
 * lands: a type that changes, a column that becomes required or loses `choice` values or narrows a limit is held
 * against the rows, and a seal that is added or taken rebuilds the table; what only adds or widens is safe.
 */
function columnChange(change: Change, was: unknown, is: unknown): { words: string; weight: Weight } {
  const field = (change.path ?? []).join('.')
  if (field === 'kind') return { words: `${String(change.from)} -> ${String(change.to)}`, weight: 'hard' }
  if (field === 'optional' || field === 'default')
    return leftOut(is) ? { words: 'now optional', weight: 'safe' } : { words: 'now required', weight: 'hard' }
  if (field.startsWith('values')) {
    const [before, after] = [listOf(Reflect.get(Object(was), 'values')), listOf(Reflect.get(Object(is), 'values'))]
    return before.every((one) => after.includes(one))
      ? { words: 'choices added', weight: 'safe' }
      : { words: 'choices removed', weight: 'hard' }
  }
  if (field === 'sealed')
    return { words: is && Reflect.get(Object(is), 'sealed') ? 'sealed' : 'opened', weight: 'hard' }
  if (field === 'max' || field === 'min' || field === 'length') {
    const [from, to] = [Number(change.from ?? Number.NaN), Number(change.to ?? Number.NaN)]
    const wider = field === 'min' ? !(to > from) : !(to < from)
    return { words: `${field} ${String(change.from)} -> ${String(change.to)}`, weight: wider ? 'safe' : 'hard' }
  }
  return { words: `${field} changed`, weight: 'safe' }
}

/** What a table change touches: the rows of its table, and the files of tenants where it is a tenant table. */
function touched(facts: ImpactFacts, table: string): string {
  const rows = facts.rows?.[table]
  const files = facts.files?.[table]
  return [
    ...(rows ? [`${rows} ${rows === 1 ? 'row' : 'rows'}`] : []),
    ...(files ? [`${files} ${files === 1 ? 'tenant file' : 'tenant files'}`] : []),
  ]
    .map((one) => `, ${one}`)
    .join('')
}

/** A length of time in milliseconds, in days where it is whole days. */
const lengthOf = (ms: unknown): string =>
  typeof ms === 'number' && ms % 86_400_000 === 0 ? `${ms / 86_400_000} days` : `${String(ms)} ms`

/**
 * Takes the description that runs, the one that would follow it, the changes between them, and what the running
 * app tells. Answers each table change with how it lands and what it touches, each backfill that would run with
 * the rows and files it touches, and each `lasts` that is new or changed with the rows its first pass removes.
 */
export function dataOf(live: Description, next: Description, changes: Change[], facts: ImpactFacts): ImpactLine[] {
  const found: ImpactLine[] = []
  const [tablesWas, tablesIs] = [recordsOf(live, 'tables'), recordsOf(next, 'tables')]
  const removedTables = listOf(Reflect.get(next.project, 'removed'))
  const columns = new Map<string, ImpactLine>()
  const say = (name: string, kind: string, table: string, words: string, weight: Weight): void => {
    const held = columns.get(name)
    if (held) {
      held.change = `${words}; ${held.change}`
      return
    }
    const one = {
      name,
      kind,
      file: fileOf(next, table) || fileOf(live, table),
      change: `${words}, ${weight}${touched(facts, table)}`,
    }
    columns.set(name, one)
    found.push(one)
  }
  for (const change of changes) {
    if (change.what === 'column') {
      const [table, column] = [change.name.split('.')[0], change.name.split('.').slice(1).join('.')]
      const column_ = (side: Record<string, Stored>, name: string): unknown =>
        Reflect.get(Object(side[table]?.columns), name)
      if (change.change === 'added') {
        const type = column_(tablesIs, column)
        if (leftOut(type)) say(change.name, 'column', table, 'added', 'safe')
        else say(change.name, 'column', table, 'added, required', 'hard')
      } else if (change.change === 'removed')
        say(
          change.name,
          'column',
          table,
          'removed',
          listOf(tablesIs[table]?.removed).includes(column) ? 'stated' : 'refused',
        )
      else if (change.change === 'renamed')
        say(change.name, 'column', table, `renamed from ${String(change.was)}`, 'stated')
      else {
        const { words, weight } = columnChange(change, column_(tablesWas, column), column_(tablesIs, column))
        say(change.name, 'column', table, words, weight)
      }
      continue
    }
    if (change.what !== 'table') continue
    if (change.change === 'added') say(change.name, 'table', change.name, 'table added', 'safe')
    else if (change.change === 'removed')
      say(
        change.name,
        'table',
        change.name,
        'table removed',
        removedTables.includes(change.name) ? 'stated' : 'refused',
      )
    else if (change.change === 'renamed')
      say(change.name, 'table', change.name, `renamed from ${String(change.was)}`, 'stated')
    else if ((change.path ?? [])[0] === 'unique') say(change.name, 'table', change.name, 'unique changed', 'hard')
  }
  // A backfill that the version holds and the running one does not runs once over every row of its table.
  const backfillsWas = recordsOf(live, 'backfills')
  for (const [name, record] of Object.entries(recordsOf(next, 'backfills')))
    if (!backfillsWas[name]) {
      const table = String(record.table)
      found.push({
        name,
        kind: 'backfill',
        file: fileOf(next, name),
        change: `backfill of ${table}${touched(facts, table)}`,
      })
    }
  // Rows kept for a time: what the first pass of a `lasts` that is new or changed removes.
  for (const [name, record] of Object.entries(tablesIs)) {
    if (!isStored(record.lasts) || JSON.stringify(record.lasts) === JSON.stringify(tablesWas[name]?.lasts)) continue
    const kept = facts.kept?.[name]
    found.push({
      name,
      kind: 'lasts',
      file: fileOf(next, name),
      change: `kept for ${lengthOf(record.lasts.for)} by ${String(record.lasts.by)}${kept === undefined ? '' : `, its first pass removes ${kept} ${kept === 1 ? 'row' : 'rows'}`}`,
    })
  }
  return found
}
