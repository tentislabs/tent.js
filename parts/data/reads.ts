import { TentError } from '../core/index.ts'
import type { Plan } from '../core/internal.ts'
import type { DbContext } from './context.ts'
import { begin } from './context.ts'
import { fileKey } from './fileName.ts'
import { isTenant } from './isTenant.ts'
import { answeredFirst, fileOf, fitsNone, throughShared, within } from './fileReads.ts'
import { insideOf } from './filesInside.ts'
import { hand } from './handed.ts'
import { readHistory } from './history.ts'
import { linkedOf, seenThrough } from './linked.ts'
import { unnamed } from './columnRules.ts'
import { foundFilter, misused } from './found.ts'
import { fused } from './fused.ts'
import { heldNear } from './near.ts'
import { rankedRead } from './ranked.ts'
import { foundIn } from './searchPast.ts'
import type { TableModel } from './model.ts'
import { tableOf, typeIn } from './model.ts'
import { cursorOf, cursorValues } from './page.ts'
import { handedList, handedRow, handedRows, shown } from './present.ts'
import type { Ruling } from './rules.ts'
import { ruled, ruleResolve } from './rules.ts'
import type { Row, StorePlan } from './store.ts'
import type { Filter, Resolve } from './worked.ts'
import { columnsIn, workedFilter, workedValue } from './worked.ts'
import { shownRead } from './shown.ts'

// How deep plans may stand inside the rules of each other: two rules that name each other never end.
const deepest = 16

// What a group works out of a column.
const measures = ['sum', 'avg', 'min', 'max']

/** What the rules of this `db` are worked out with. A plan inside a rule is read under the caller's own `read` rule of its table. */
export const rulingOf = (cx: DbContext): Ruling => ({
  description: cx.description,
  caller: cx.caller,
  rules: cx.rules,
  inner: (plan) => innerPlan(cx, plan, ruleResolve(cx.caller), false, true),
})

/** Whether a plan searches for words: a search for nothing but white space is no part of a plan. */
const searchesWords = (plan: Plan): boolean => typeof plan.search === 'string' && plan.search.trim() !== ''

/** Follows a name through its links. Answers the table and the column it ends at, or nothing for a name that leads nowhere. */
function ending(cx: DbContext, model: TableModel, name: string): { model: TableModel; column: string } | undefined {
  const [first, ...through] = name.split('.')
  let at = model
  let column = first
  for (const next of through) {
    const type = typeIn(at, column)
    if (type?.kind !== 'link') return undefined
    at = tableOf(cx.description, type.table)
    column = next
  }
  return { model: at, column }
}

/**
 * Holds the columns that a plan filters and sorts by: a sealed one is T2011, and one that its read rule keeps from
 * the caller T0013, a private one among them. What a plan inside a filter picks is what that filter is told, so it
 * is held as a filter is.
 */
function guard(cx: DbContext, model: TableModel, plan: Plan, inside: boolean): void {
  const asked = [
    ...(plan.where ? columnsIn(plan.where) : []),
    ...(plan.sort ?? []).map((one) => one.by),
    ...(inside ? (plan.pick ?? []) : []),
  ]
  // A group that names a private column is answered without that field, and is not refused.
  const inGroup = [
    ...(plan.group?.by ?? []),
    ...Object.values(plan.group?.values ?? {}).flatMap((value) => Object.values(value).map(String)),
  ]
  const sorted = (plan.sort ?? []).map((one) => one.by)
  const filtered = plan.where ? columnsIn(plan.where) : []
  for (const name of [...asked, ...inGroup]) {
    const at = ending(cx, model, name)
    if (!at) continue
    const findable = at.model.findable.includes(at.column)
    // A sealed value that is found answers an equal value in a filter, which is held to its fingerprint after this.
    if (findable && sorted.includes(name)) throw misused(at.model, at.column, 'a sort')
    if (findable && !inGroup.includes(name) && filtered.includes(name) && !name.includes('.')) continue
    if (at.model.sealed.includes(at.column))
      throw new TentError(
        'T2011',
        `\`${name}\` of \`${model.name}\` is sealed: it cannot be filtered, sorted or grouped by.`,
        {
          fix: 'To find a row by a sealed value, keep its fingerprint in a second column and filter by that.',
        },
      )
    // A column that its read rule keeps from the caller, a private one among them, is not filtered, sorted or grouped by.
    const byGroup = (plan.group?.by ?? []).includes(name)
    if ((asked.includes(name) || byGroup) && cx.hidden && unnamed(cx.hidden(at.model)).includes(at.column))
      throw new TentError(
        'T0013',
        `\`${name}\` of \`${model.name}\` is read by those its read rule names alone: this caller may not filter, sort or group by it.`,
        { fix: 'Read the column as a caller that its rule lets in, or state `system` and read through `db.system`.' },
      )
  }
  // A plan inside a filter is answered by the store whole: a search there by a column the caller may not read would
  // tell of it. A plan of its own is answered over the other columns: see `pastHidden`.
  const kept = inside && cx.hidden ? unnamed(cx.hidden(model)) : []
  const hiddenSearched = searchesWords(plan) ? model.search.find((column) => kept.includes(column)) : undefined
  if (hiddenSearched !== undefined || (plan.near && kept.includes(plan.near.col)))
    throw new TentError(
      'T0013',
      `\`${hiddenSearched ?? plan.near?.col}\` of \`${model.name}\` is read by those its read rule names alone, and a search by it would tell of it.`,
      { fix: 'Search as a caller that the rule of the column lets in, or search a table that does not name it.' },
    )
}

/**
 * Takes a plan that searches a table, and the searched columns that the caller may read where a rule keeps another
 * from them. Answers the ids of the rows in which each typed word is found in those columns: what the store or the
 * searcher finds over every column is held to them, so a word found in the other column alone finds nothing.
 */
function pastHidden(cx: DbContext, model: TableModel, plan: StorePlan, visible: string[]): string[] {
  if (!visible.length) return []
  const typed = String(plan.search).trim()
  const pick = ['id', ...visible]
  const asked: StorePlan = {
    from: plan.from,
    ...(plan.where ? { where: plan.where } : {}),
    ...(plan.linked ? { linked: plan.linked } : {}),
  }
  const rows = cx.o.searcher
    ? rowsIn(
        cx,
        { ...asked, pick },
        idsFound(cx, { ...asked, search: typed }, typed, 64, () => false),
      )
    : cx.read({ ...asked, search: typed, pick })
  const pieces = Reflect.get(Object(cx.description.tables[model.name]?.search), 'by') === 'pieces'
  return (Array.isArray(rows) ? rows : [])
    .filter((row: Row) => foundIn(row, visible, typed, pieces))
    .map((row: Row) => String(row.id))
}

/** What the caller's `read` rule lets them read of a table that a plan reaches through a link, worked out once for a plan. */
function reachOf(cx: DbContext): (linked: TableModel) => Filter | 'all' | 'none' {
  const known = new Map<string, Filter | 'all' | 'none'>()
  return (linked) => {
    const held = known.get(linked.name)
    if (held !== undefined) return held
    const { reach } = ruled(rulingOf(cx), linked, 'read')
    const filter =
      reach === 'all' || reach === 'none' || !cx.at || !linked.tenant ? reach : throughShared(cx, linked, reach)
    known.set(linked.name, filter)
    return filter
  }
}

/**
 * Holds what a plan itself asks through a link to the caller's `read` rule of each linked table: of a linked row
 * that the caller may not read nothing is told. Such a row fits no entry of the filter, and is handed to the store
 * as a row with no value for a sort and a group. A rule's own filter is the builder's word, and is not held.
 */
function underLinks(cx: DbContext, model: TableModel, plan: Plan): StorePlan {
  if (cx.full) return plan
  const reach = reachOf(cx)
  const held: StorePlan = { ...plan }
  if (plan.where) {
    const under = (linked: TableModel, asked: Plan) => underRule(cx, linked, underLinks(cx, linked, asked))
    const here = cx.at && model.tenant ? throughShared(cx, model, plan.where, under) : plan.where
    held.where = seenThrough(cx, model, here, reach)
  }
  const linked = linkedOf(cx, model, plan, reach)
  if (linked) held.linked = linked
  return held
}

/**
 * Works the values of a stored plan out. A plan inside its filter is made ready to be read with it. Throws T1014
 * for a `limit` or a `skip` that is no whole number of zero or more, and for a `pick` that names what is no column
 * of the table itself, a path through a link among it, and for a value of a group that is worked out of a link.
 */
function workedPlan(cx: DbContext, stored: Plan, resolve: Resolve, guarded: boolean, inside: boolean): Plan {
  const { where: filter, ...rest } = stored
  const plan: Plan = { ...rest }
  const value = (one: unknown) => workedValue(one, resolve)
  const where = filter
    ? workedFilter(filter, resolve, (inner) => innerPlan(cx, inner, resolve, guarded, false))
    : undefined
  if (where) plan.where = where
  for (const name of ['limit', 'skip', 'search', 'id', 'after'] as const)
    if (name in stored) plan[name] = value(stored[name])
  if (stored.near) plan.near = { ...stored.near, value: value(stored.near.value), within: value(stored.near.within) }
  for (const name of ['limit', 'skip'] as const) {
    const held = plan[name]
    if (held !== undefined && !(typeof held === 'number' && Number.isInteger(held) && held >= 0))
      throw new TentError('T1014', `The \`${name}\` of a plan of \`${stored.from}\` is no whole number of 0 or more.`, {
        fix: `Hand \`${name}\` a whole number that is not under zero.`,
      })
  }
  const model = tableOf(cx.description, stored.from)
  if (guarded) guard(cx, model, plan, inside)
  // A row kept in memory is gone `lasts` after its last write, whether it was taken away yet or not.
  const lasts = model.memory?.lasts
  if (lasts !== undefined) {
    const fresh: Filter = { col: 'updatedAt', after: new Date(cx.now() - lasts) }
    plan.where = plan.where ? { all: [fresh, plan.where] } : fresh
  }
  // An equal value of a sealed column that is found is asked by its fingerprint.
  if (model.findable.length && plan.where) plan.where = foundFilter(cx, model, plan.where)
  // What a linked row holds is read with `with`. The distance of a `near` is a field of each row it answers.
  const strange = plan.pick?.find(
    (name) =>
      !typeIn(model, name) && !(plan.near && (name === 'distance' || (plan.search !== undefined && name === 'rank'))),
  )
  if (strange !== undefined)
    throw new TentError(
      'T1014',
      `The \`pick\` of a plan of \`${stored.from}\` names \`${strange}\`, which is no column of the table.`,
      { fix: 'Pick columns of the table itself, and read what a linked row holds with `with`.' },
    )
  // A link is no measure: the store keeps it as a number of its own, which no answer carries.
  for (const value of Object.values(plan.group?.values ?? {}))
    for (const name of measures.map((word) => Reflect.get(value, word))) {
      const at = typeof name === 'string' ? ending(cx, model, name) : undefined
      if (at && typeIn(at.model, at.column)?.kind === 'link')
        throw new TentError(
          'T1014',
          `A group of \`${stored.from}\` works a value out of \`${name}\`, which is a link and no measure.`,
          { fix: 'Count the rows, group by the link, or work the value out of a column of the linked row.' },
        )
    }
  return plan
}

/** Joins the caller's `read` rule of a table to a plan. Answers nothing where the rule lets the caller reach no row. */
function underRule(cx: DbContext, model: TableModel, plan: StorePlan): StorePlan | undefined {
  if (cx.full) return plan
  const { reach } = ruled(rulingOf(cx), model, 'read')
  if (reach === 'none') return undefined
  return reach === 'all' ? plan : { ...plan, where: plan.where ? { all: [reach, plan.where] } : reach }
}

/**
 * Makes a plan inside a filter ready to be read: its values worked out, under the caller's `read` rule of its
 * table. A plan that reads the file its filter is read in stays a plan, and is read in the same question. One that
 * reads another file - the shared file from a tenant's, a tenant's from anywhere else - is answered first, and
 * its answer stands in its place as a list. Inside the rule of a tenant table, a plan on a tenant table
 * whose tenants are of the same table names no tenant, and is read in the file the rule is applied in.
 */
function innerPlan(
  cx: DbContext,
  stored: Plan,
  resolve: Resolve,
  guarded: boolean,
  inRule: boolean,
): StorePlan | unknown[] {
  if (cx.depth >= deepest)
    throw new TentError('T0009', `The rules of \`${stored.from}\` name each other and never end.`)
  if (stored.near)
    throw new TentError('T2106', `A plan of \`${stored.from}\` with \`near\` stands inside \`in\`.`, {
      fix: 'Read the nearest rows first, and hand their ids to `in` as a list.',
    })
  const model = tableOf(cx.description, stored.from)
  const file = fileOf(cx, model, stored.of === undefined ? undefined : workedValue(stored.of, resolve), inRule)
  if (file === 'none') return []
  // The tenant is asked before anything of its file is: a file with no tenant stays closed.
  if (file && cx.files && !isTenant(cx.files.shared, file)) return []
  const same = fileKey(file) === fileKey(cx.at)
  cx.depth++
  try {
    return within(cx, file, () => {
      const worked = underLinks(cx, model, workedPlan(cx, stored, resolve, guarded, true))
      // A rule that lets the caller reach no row leaves a plan that reads none.
      const { of: _, ...plan } = underRule(cx, model, worked) ?? { ...worked, where: { col: 'id', in: [] } }
      if (file && model.tenant) {
        if (fitsNone(plan.where, model.tenant, file.id)) return []
        if (plan.where) plan.where = throughShared(cx, model, plan.where)
      }
      if (!same) return answeredFirst(cx, plan)
      // A table that the file does not hold yet answers no rows.
      return file && cx.files && !insideOf(cx.files).holds(file, model.name) ? [] : plan
    })
  } finally {
    cx.depth--
  }
}

/** The rows of a plan as the store answers them. */
function rowsOf(cx: DbContext, plan: Plan): Row[] {
  const value = cx.read(plan)
  if (Array.isArray(value)) return value
  // A plan of one row answers the row itself, or nothing.
  return typeof value === 'object' && value !== null ? [{ ...value }] : []
}

/** The names of a plan's `pick` with what must be read beside them, or nothing where every column is read. */
const picked = (plan: Plan, more: string[]): string[] | undefined =>
  plan.pick ? [...new Set([...plan.pick, ...more])] : undefined

// What a plan with `near` gives each row beside its columns: its distance, whether it is sure to be among the
// nearest, and its place in the list where the plan holds `search` too.
const nearOwn = ['distance', 'exact', 'rank']

/** Takes away what was read beside the picked columns. The distance of a `near` is there whether `pick` names it or not. */
function cut(plan: Plan, row: Row): Row {
  if (plan.pick)
    for (const name of Object.keys(row))
      if (!plan.pick.includes(name) && !(plan.near && nearOwn.includes(name))) Reflect.deleteProperty(row, name)
  return row
}

/**
 * Puts the linked row in the place of each link that `with` names, read in one read under the caller's `read` rule
 * of its table. Where that rule does not fit the row, the link holds `{ id }` alone.
 */
function withLinks(cx: DbContext, model: TableModel, rows: Row[], names: string[]): void {
  const byColumn = new Map<string, string[]>()
  for (const name of names) {
    const [column, ...rest] = name.split('.')
    byColumn.set(column, [...(byColumn.get(column) ?? []), ...(rest.length ? [rest.join('.')] : [])])
  }
  for (const [column, deeper] of byColumn) {
    const type = typeIn(model, column)
    if (type?.kind !== 'link')
      throw new TentError('T0013', `\`with\` names \`${column}\` of \`${model.name}\`, which is no link.`)
    const ids = [...new Set(rows.map((row) => row[column]).filter((id) => typeof id === 'string'))]
    if (!ids.length) continue
    const linked = tableOf(cx.description, type.table)
    const plan = underRule(cx, linked, { from: linked.name, where: { col: 'id', in: ids } })
    const found = plan ? rowsOf(cx, plan) : []
    if (deeper.length) withLinks(cx, linked, found, deeper)
    const byId = new Map(found.map((row) => [row.id, handedRow(cx, linked, shown(cx, linked, row))]))
    for (const row of rows)
      if (typeof row[column] === 'string') row[column] = byId.get(row[column]) ?? { id: row[column] }
  }
}

// A statement of SQLite holds a bounded number of values: a list of ids that a searcher names is read in pieces.
const piece = 10_000

/**
 * The rows of a plan among the ids that a searcher named, read a piece of the ids at a time. With `enough` it
 * stops once that many rows passed the rule: a searcher may name far more ids than there are rows.
 */
function rowsIn(cx: DbContext, plan: Plan, ids: string[], enough?: number): Row[] {
  const rows: Row[] = []
  for (let at = 0; at < ids.length; at += piece) {
    const inIds: Filter = { col: 'id', in: ids.slice(at, at + piece) }
    rows.push(...rowsOf(cx, { ...plan, where: plan.where ? { all: [inIds, plan.where] } : inIds }))
    if (enough !== undefined && rows.length >= enough) break
  }
  return rows
}

/**
 * Asks a searcher for ids, twice as many again while it answers exactly as many as it was asked for. One that
 * answers more than it was asked for has said all it will say.
 */
function idsFound(
  cx: DbContext,
  plan: Plan,
  words: string,
  first: number,
  enough: (ids: string[]) => boolean,
): string[] {
  let ask = first
  for (;;) {
    const ids = cx.o.searcher?.find(plan.from, words, ask, cx.at) ?? []
    if (ids.length !== ask || enough(ids)) return ids
    ask *= 2
  }
}

/**
 * A plan whose search a `Searcher` answers, with every id that it finds in the place of the search: a count and a
 * group are worked out over all that it finds, so it is asked for twice as many again while it has more. The ids
 * are held to the rows that are there and that the caller may read first, a piece at a time.
 */
function foundBy(cx: DbContext, plan: Plan, words: string): Plan {
  const { search: _, ...rest } = plan
  const ids = idsFound(cx, plan, words, 64, () => false)
  const there =
    ids.length > piece ? rowsIn(cx, { from: plan.from, pick: ['id'] }, ids).map((row) => String(row.id)) : ids
  const inIds: Filter = { col: 'id', in: there }
  return { ...rest, where: rest.where ? { all: [inIds, rest.where] } : inIds }
}

/**
 * A search that a `Searcher` answers: it is asked for ids, and the rows are read under the rule, in the order it
 * names. The rows of a page come in the order of the page, which its cursor names.
 */
function searched(cx: DbContext, plan: Plan, words: string): Row[] {
  // An order that is not the searcher's own is worked out over all that it finds, and so is a page.
  if (plan.sort?.length || 'after' in plan) return rowsOf(cx, foundBy(cx, plan, words))
  const limit = typeof plan.limit === 'number' ? plan.limit : undefined
  const from = typeof plan.skip === 'number' ? plan.skip : 0
  const { search: _, limit: __, skip: ___, ...rest } = plan
  const enough = limit === undefined ? undefined : from + limit
  let rows: Row[] = []
  let readOf: string[] | undefined
  // It is asked for twice as many again while too few pass the rule and it has more.
  const ids = idsFound(cx, plan, words, limit === undefined ? 64 : Math.max(from + limit, 1), (found) => {
    rows = rowsIn(cx, rest, found, enough)
    readOf = found
    return enough !== undefined && rows.length >= enough
  })
  if (readOf !== ids) rows = rowsIn(cx, rest, ids, enough)
  const place = new Map(ids.map((id, at) => [id, at]))
  const ordered = rows.sort((a, b) => (place.get(String(a.id)) ?? 0) - (place.get(String(b.id)) ?? 0))
  return ordered.slice(from, enough)
}

const tooMany = (table: string, bound: number): TentError =>
  new TentError('T2108', `A read of \`${table}\` answered more than ${bound} rows.`, {
    fix: 'State a `limit` on the plan, or `live: false` on the query.',
  })

/** Reads the rows of a plan that is ready, and answers them as the code of this `db` sees them. */
function fetched(cx: DbContext, model: TableModel, plan: Plan): Row[] {
  const bound = cx.o.limits?.rows
  const typed = typeof plan.search === 'string' ? plan.search.trim() : ''
  // One row more than the bound is asked for, to know that there is one.
  const most = bound !== undefined && !(typeof plan.limit === 'number' && plan.limit <= bound) ? bound + 1 : undefined
  const sealed = model.sealed.some((column) => plan.pick?.includes(column))
  // The linked rows of `with` are read after the rows, and a search for no text is no part of the plan.
  const { with: _, search, ...rest } = plan
  const asked: Plan = { ...rest, ...(typed ? { search } : {}), ...(most === undefined ? {} : { limit: most }) }
  const pick = picked(plan, sealed ? ['id'] : [])
  if (pick) asked.pick = pick
  const rows = cx.o.searcher && typed ? searched(cx, asked, typed) : rowsOf(cx, asked)
  if (bound !== undefined && rows.length > bound) throw tooMany(model.name, bound)
  for (const row of rows) cut(plan, shown(cx, model, row))
  if (plan.with?.length) withLinks(cx, model, rows, plan.with)
  return rows
}

/** A page: the rows after a cursor, and the cursor for the page after it where there is one. */
function page(cx: DbContext, model: TableModel, plan: Plan): object {
  const sort = (plan.sort ?? []).map((one) => one.by)
  if (sort.some((name) => name.includes('.')))
    throw new TentError('T0013', `A page of \`${model.name}\` is sorted through a link, which a cursor cannot name.`, {
      fix: 'Sort the page by a column of the table itself.',
    })
  const limit = typeof plan.limit === 'number' ? plan.limit : undefined
  const after = plan.after === undefined || plan.after === null ? undefined : cursorValues(plan.after, sort.length)
  const pick = picked(plan, [...sort, 'id'])
  // One row more than the page is read, to know whether a page follows.
  const rows = fetched(cx, model, {
    ...plan,
    after,
    ...(pick ? { pick } : {}),
    ...(limit === undefined ? {} : { limit: limit + 1 }),
  })
  const more = limit !== undefined && rows.length > limit
  const kept = more ? rows.slice(0, limit) : rows
  const next = more ? cursorOf(kept[kept.length - 1], sort) : undefined
  const made = {
    rows: handedList(
      cx,
      kept.map((row) => handedRow(cx, model, cut(plan, row))),
    ),
    ...(next ? { next } : {}),
  }
  return cx.freeze ? hand(made, { kind: 'page' }) : made
}

/** The records of a group, without the fields that name a private column or were worked out from one where the `db` is limited. */
function grouped(cx: DbContext, model: TableModel, plan: Plan): Row[] {
  const group = plan.group ?? { by: [], values: {} }
  // A name is held by the column it ends at, through its links.
  const isPrivate = (name: unknown) => {
    const at = typeof name === 'string' ? ending(cx, model, name) : undefined
    if (!at) return false
    return at.model.private.includes(at.column) || (cx.leaving ? cx.leaving(at.model) : []).includes(at.column)
  }
  const secret = [
    ...group.by.filter(isPrivate),
    ...Object.entries(group.values)
      .filter(([, value]) => Object.values(value).some(isPrivate))
      .map(([name]) => name),
  ]
  const records = rowsOf(cx, plan)
  for (const record of records) {
    // A limited `db` reads none of them; full access reads them, and they are held again where the answer leaves.
    if (!cx.full) for (const name of secret) Reflect.deleteProperty(record, name)
    if (cx.freeze) hand(record, { kind: 'group', private: secret })
  }
  return handedList(cx, records)
}

/** What a plan answers where its rule lets the caller reach no row. */
function nothingOf(cx: DbContext, plan: Plan): unknown {
  if (plan.count) return 0
  if (plan.one) return undefined
  if ('after' in plan) return cx.freeze ? hand({ rows: handedList(cx, []) }, { kind: 'page' }) : { rows: [] }
  return handedList(cx, [])
}

/**
 * Takes the context of a `db`, a stored plan, and what answers the values in it that are no literal. Carries the
 * plan out under the table rules of the caller, and answers rows, one row or nothing, a number, the records of a
 * group, the entries of a history, or a page. A row the caller may not read is never fetched. Throws T0008 past
 * the time of the `db`, T2108 for one row more than its bound, T2011 for a sealed column in a filter or a sort, and
 * T0013 for a private one where the `db` is limited.
 */
export function carried(cx: DbContext, stored: Plan, resolve: Resolve = ruleResolve(cx.caller)): unknown {
  const model = tableOf(cx.description, stored.from)
  // A plan that ranks reads its rows as one that does not, and then has a model put them in order.
  if (stored.rank) return rankedRead(cx, model, stored, resolve, (plan) => carried(cx, plan, resolve))
  const started = begin(cx)
  shownRead(model, stored)
  const file = fileOf(cx, model, stored.of === undefined ? undefined : workedValue(stored.of, resolve), false)
  if (file === 'none') return nothingOf(cx, stored)
  let rows = 0
  const answer = (): unknown => {
    if (stored.history) {
      // The rule comes first: for a caller whom it lets reach nothing of that tenant, no file is opened.
      const reach = cx.full ? 'all' : ruled(rulingOf(cx), model, 'read').reach
      if (file && model.tenant && (reach === 'none' || (reach !== 'all' && fitsNone(reach, model.tenant, file.id))))
        return handedList(cx, [])
      const entries = readHistory(cx, model, String(workedValue(stored.id, resolve)), reach)
      rows = entries.length
      return entries
    }
    const worked = workedPlan(cx, stored, resolve, true, false)
    heldNear(model, worked)
    const under = underRule(cx, model, underLinks(cx, model, worked))
    if (!under) return nothingOf(cx, stored)
    const { of: _, ...held } = under
    let plan: StorePlan = held
    // A table that shows the counts is read from the engine's own table, under the rule of the builder's.
    if (model.stored) plan.from = model.stored
    // A caller that a column's rule keeps out is answered over the other columns: that column matches nothing.
    const hidden = cx.hidden ? unnamed(cx.hidden(model)) : []
    if (plan.near && hidden.includes(plan.near.col)) return nothingOf(cx, stored)
    if (searchesWords(plan) && model.search.some((column) => hidden.includes(column))) {
      const ids = pastHidden(
        cx,
        model,
        plan,
        model.search.filter((column) => !hidden.includes(column)),
      )
      if (!ids.length) return nothingOf(cx, stored)
      const { search: __, ...rest } = plan
      const inIds: Filter = { col: 'id', in: ids }
      plan = { ...rest, where: rest.where ? { all: [inIds, rest.where] } : inIds }
    }
    if (file && model.tenant) {
      // What the filter asks of the tenant alone is worked out first: where it fits no row, no file is opened.
      if (fitsNone(plan.where, model.tenant, file.id)) return nothingOf(cx, stored)
      if (plan.where) plan.where = throughShared(cx, model, plan.where)
    }
    // With a searcher connected the store keeps no index of its own: every search goes to the searcher.
    const typed = cx.o.searcher && typeof plan.search === 'string' ? plan.search.trim() : ''
    if (plan.count) return cx.read(typed ? foundBy(cx, plan, typed) : plan)
    if (plan.group) return grouped(cx, model, typed ? foundBy(cx, plan, typed) : plan)
    if ('after' in plan) return page(cx, model, plan)
    // Words and meaning together: the two searches are read apart, under the same filter, and joined by rank.
    const found =
      typeof plan.search === 'string' && plan.search.trim() !== '' && plan.near
        ? fused(plan, (one) => fetched(cx, model, one))
        : fetched(cx, model, plan)
    rows = found.length
    handedRows(cx, model, found)
    return plan.one ? found[0] : handedList(cx, found)
  }
  const value = within(cx, file, answer)
  cx.o.read?.(stored, value, file)
  const ended = cx.now()
  if (cx.deadline !== undefined && ended > cx.deadline)
    cx.o.noted?.({ kind: 'slow', table: model.name, ms: ended - started, rows })
  return value
}
