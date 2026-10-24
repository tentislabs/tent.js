import { TentError } from '../../core/index.ts'
import type { CallContext } from '../context.ts'
import { dbFor } from '../program.ts'
import { isStored } from '../../core/internal.ts'

/** The table of facts that `knows` of an agent names, with the column that names whose a row is. Throws T7007 for one with no owner. */
function factsOf(cx: CallContext, agent: string): { table: string; owner: string } {
  const flow = Object.hasOwn(cx.app.description.flows, agent) ? cx.app.description.flows[agent] : undefined
  const knows: unknown = Reflect.get(Object(flow?.agent), 'knows')
  const named = (Array.isArray(knows) ? knows : []).find((one) => isStored(one) && typeof one.facts === 'string')
  const table: unknown = Reflect.get(Object(named), 'facts')
  const stored =
    typeof table === 'string' && Object.hasOwn(cx.app.description.tables, table)
      ? cx.app.description.tables[table]
      : undefined
  if (typeof table !== 'string' || !stored || typeof stored.owner !== 'string')
    throw new TentError('T7007', `The table of facts that \`knows\` of ${agent} names states no \`owner\`.`, {
      fix: 'Give the table of the facts an `owner`: the facts of each person are their own rows.',
    })
  return { table, owner: stored.owner }
}

/** Calls a member of a value by its name, as a `db` of the engine gives one. */
const member = (value: unknown, name: string, args: unknown[]): unknown =>
  Reflect.apply(Object(Reflect.get(Object(value), name)), value, args)

/** A fact as the model is told it: the text of its text columns but the owner, or its record where it holds none. */
function factText(row: Record<string, unknown>, owner: string): string {
  const own = Object.entries(row).filter(
    ([name, value]) => !['id', owner, 'createdAt', 'updatedAt'].includes(name) && value !== undefined && value !== null,
  )
  const texts = own.filter(([, value]) => typeof value === 'string').map(([, value]) => String(value))
  return texts.length ? texts.join(' - ') : JSON.stringify(Object.fromEntries(own))
}

/**
 * `_t_facts({ agent })`: the starter's rows of the table of facts that `knows` names, read as the starter under
 * the table's rule and held to the rows the starter owns, in the order they were kept. Answers `{ facts: [{ id, fact }] }`,
 * and none for a starter who is no user.
 */
export function factsRead(cx: CallContext, given: unknown): { facts: { id: string; fact: string }[] } {
  const { table, owner } = factsOf(cx, String(Reflect.get(Object(given), 'agent')))
  const user = cx.caller.user?.id
  if (!user) return { facts: [] }
  const of = Reflect.get(Object(dbFor(cx.app, cx.caller)), table)
  const rows: unknown = member(member(of, 'where', [{ [owner]: user }]), 'all', [])
  return {
    facts: (Array.isArray(rows) ? rows : [])
      .filter(isStored)
      .map((row) => ({ id: String(row.id), fact: factText(row, owner) })),
  }
}
