import type { Description } from '../description.ts'
import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import { keptAt } from './kept.ts'
import { insideOf } from './shared.ts'

/** What reports one chain or write that does not keep to the file of one tenant: the definition it stands in, and the words. */
type Report = (definition: string, message: string, fix: string) => void

/** The table of the tenants of a table: the one its `tenant` column links to. Nothing for a table of the shared file. */
function tenantTable(description: Description, table: string): string | undefined {
  const record = keptAt(description.tables, table)
  const columns = isStored(record?.columns) ? record.columns : {}
  const column = typeof record?.tenant === 'string' ? keptAt(columns, record.tenant) : undefined
  return isStored(column) && typeof column.table === 'string' ? column.table : undefined
}

/** Holds one plan or one write to its table: `of` where it is a tenant table, and none where it is not. */
function held(
  description: Description,
  table: string,
  has: boolean,
  inRuleOf: string | undefined,
  name: string,
  report: Report,
): void {
  const by = tenantTable(description, table)
  // A plan inside the rule of a tenant table whose tenants are of the same table is read in the file the rule is applied in.
  const ownFile = inRuleOf !== undefined && by !== undefined && tenantTable(description, inRuleOf) === by
  if (by !== undefined && !has && !ownFile)
    report(
      name,
      `a chain on \`${table}\`, which is a tenant table, does not begin with \`of\`.`,
      `Begin the chain with ${table}.of(tenant).`,
    )
  if (by === undefined && has && keptAt(description.tables, table))
    report(
      name,
      `a chain on \`${table}\` begins with \`of\`, and the table is no tenant table.`,
      `Take \`of\` out, or state \`tenant\` on ${table}.`,
    )
}

/** Walks a stored record, and holds every plan, every write and every chain of a body in it. */
function heldIn(
  description: Description,
  node: unknown,
  inRuleOf: string | undefined,
  name: string,
  report: Report,
): void {
  if (Array.isArray(node)) {
    for (const one of node) heldIn(description, one, inRuleOf, name, report)
    return
  }
  if (!isStored(node)) return
  const written = node.add ?? node.change ?? node.remove
  if (typeof node.from === 'string') held(description, node.from, node.of !== undefined, inRuleOf, name, report)
  else if (typeof written === 'string' && ('values' in node || 'id' in node))
    held(description, written, node.of !== undefined, inRuleOf, name, report)
  const start = isStored(node.plan) ? (node.plan.db ?? node.plan.table) : undefined
  const members = Array.isArray(node.then) ? node.then : []
  // A chain of a body that stands alone may go on from its name, so only one with a member is held.
  if (typeof start === 'string' && members.length)
    held(description, start, isStored(members[0]) && 'of' in members[0], inRuleOf, name, report)
  for (const one of insideOf(node)) heldIn(description, one, inRuleOf, name, report)
}

/** The parts of the description whose records are held. */
type Part = 'tables' | 'functions' | 'flows' | 'models' | 'seed'

/**
 * Takes a description; `report`; and `within`, which carries out the work on what was stored of one definition,
 * by its part and its name. Reports each chain and each write on a tenant table which does not begin
 * with `of`, but for a plan inside a rule of a tenant table whose tenants are of the same table, and each `of` on a
 * table that is no tenant table.
 */
export function heldToTenants(
  description: Description,
  report: Report,
  within: (part: Part, name: string, work: () => void) => void,
): void {
  for (const [name, table] of Object.entries(description.tables))
    within('tables', name, () => {
      const { access, ...rest }: Stored = table
      heldIn(description, access, name, name, report)
      heldIn(description, rest, undefined, name, report)
    })
  for (const part of ['functions', 'flows', 'models'] as const)
    for (const [name, record] of Object.entries(description[part]))
      within(part, name, () => heldIn(description, record, undefined, name, report))
  const { seed } = description
  if (seed) within('seed', 'seed', () => heldIn(description, seed, undefined, 'seed', report))
}
