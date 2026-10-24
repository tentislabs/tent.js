import type { Node } from '../../build/index.ts'
import { child, keyOf, kid, kids, nameOf, unwrap, walk, word } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import { askedOf } from '../asked.ts'
import type { Rule } from '../rule.ts'
import { arrowOf, at, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

// The members of a table that write a row.
const writing = ['add', 'change', 'remove']

/**
 * The names that code gives to what it reads by names alone: `const all = db.system` gives `all` the name
 * `db.system`, so that full access reached through another name is still full access.
 */
function namesGiven(code: Node): Map<string, string> {
  const given = new Map<string, string>()
  walk(code, (node) => {
    if (node.type !== 'VariableDeclarator') return
    const [name, from] = [nameOf(kid(node, 'id')), kid(node, 'init')]
    const read = from ? reached(from, given) : undefined
    if (name !== undefined && read !== undefined) given.set(name, read)
  })
  return given
}

/**
 * The names that a read or a call is reached by, with dots between, through the calls of a chain and through a
 * name that the code gave: `all.orders.where(...).change` is `db.system.orders.where.change`.
 */
function reached(node: Node, given: Map<string, string>): string | undefined {
  const n = unwrap(node)
  if (n.type === 'Identifier') {
    const name = nameOf(n)
    return name === undefined ? undefined : (given.get(name) ?? name)
  }
  if (n.type === 'CallExpression') return reached(child(n, 'callee'), given)
  if (n.type !== 'MemberExpression' || n.computed === true) return undefined
  const [from, name] = [reached(child(n, 'object'), given), word(kid(n, 'property'), 'name')]
  return from !== undefined && name !== undefined ? `${from}.${name}` : undefined
}

/** Every call of a piece of code, by the names it is reached by. */
function callsOf(code: Node, given: Map<string, string>): { name: string; args: Node[] }[] {
  const found: { name: string; args: Node[] }[] = []
  walk(code, (node) => {
    if (node.type !== 'CallExpression') return
    const name = reached(child(node, 'callee'), given)
    if (name !== undefined) found.push({ name, args: kids(node, 'arguments') })
  })
  return found
}

/**
 * Whether the code of a `run` holds the owner column of a table against something: it reads the column of a row,
 * or names it as a key of a filter. A value that is written into the column is no check, and neither is the name
 * of the column in a comment: the code is read, and not its text.
 */
function checksOwner(run: Node, column: string): boolean {
  const given = namesGiven(run)
  const calls = callsOf(run, given)
  // What a write is handed is what is written: nothing in it holds a row to its owner.
  const written = calls
    .filter((call) => writing.includes(call.name.split('.').at(-1) ?? ''))
    .flatMap((call) => call.args)
  const inWrite = (node: Node): boolean => written.some((arg) => node.start >= arg.start && node.end <= arg.end)
  let found = false
  walk(run, (node) => {
    if (found || inWrite(node)) return
    if (node.type === 'MemberExpression' && node.computed !== true && word(kid(node, 'property'), 'name') === column)
      found = true
  })
  for (const call of calls.filter((one) => one.name.endsWith('.where')))
    for (const arg of call.args)
      walk(arg, (node) => {
        if (node.type === 'Property' && keyOf(node) === column) found = true
      })
  return found
}

// The members of a table that read the row, or the rows, they are handed: through the caller's own `db`, whose
// rules then hold what they read to the caller.
const reading = ['get', 'where', 'count', 'history']

/**
 * Whether the code of a `run` holds the caller against a row before it writes: it holds the owner column of the
 * table, reads a row through the caller's own `db`, whose rules hand the caller their rows alone, of the table or
 * of a table it links to, or reads the id of the caller. A check that is only the caller's role holds no row, and
 * neither does a read of another table, or one handed nothing.
 */
function checksCaller(run: Node, owner: string | undefined, tables: string[]): boolean {
  if (owner !== undefined && checksOwner(run, owner)) return true
  const calls = callsOf(run, namesGiven(run))
  const readsRow = calls.some((call) => {
    const [, table, member] = /^db\.(\w+)\.(\w+)$/.exec(call.name) ?? []
    return table !== undefined && tables.includes(table) && reading.includes(member) && call.args.length > 0
  })
  if (readsRow) return true
  // The caller's own id, read anywhere but in what a write is handed: in a filter, a call that asks for its place,
  // a test. Its roles hold no row.
  const written = calls
    .filter((call) => writing.includes(call.name.split('.').at(-1) ?? ''))
    .flatMap((call) => call.args)
  const inWrite = (node: Node): boolean => written.some((arg) => node.start >= arg.start && node.end <= arg.end)
  let found = false
  walk(run, (node) => {
    if (found || inWrite(node) || node.type !== 'MemberExpression' || node.computed === true) return
    const read = reached(node, new Map())
    if (read === 'user.id' || read === 'caller.user.id' || read === 'caller.id') found = true
  })
  return found
}

/** Whether the rule of a table for a write lets in every caller that a function's own rule lets in. */
function letsIn(held: unknown, access: unknown): boolean {
  const rule: unknown = Reflect.get(Object(held), 'rule')
  const own: unknown = Reflect.get(Object(access), 'rule')
  if (rule === 'anyone') return true
  if (rule === 'signedIn') return own !== 'anyone'
  return rule === 'role' && own === 'role' && Reflect.get(Object(held), 'role') === Reflect.get(Object(access), 'role')
}

/**
 * A function open to callers that are not the system - its rule is `signedIn`, `anyone` or a role - that states
 * `system` and changes a row named by its input, of a table whose rules would not let that caller change it, with
 * no check that holds the caller against that row before the write. An add names no row by its input: it is held
 * where the rule of the table is 'owner', which a written owner column passes by.
 */
export const rule: Rule = {
  code: 'T3009',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const asked = askedOf(description)
    for (const one of writtenIn(source)) {
      const fn = Object.hasOwn(description.functions, one.name) ? description.functions[one.name] : undefined
      const open = isStored(fn?.access) ? fn.access.rule : undefined
      if (!fn || fn.system === undefined || (open !== 'signedIn' && open !== 'anyone' && open !== 'role')) continue
      // The writes that pass no rule of their table: those of `set`, and those through `db.system` in a body and in code.
      const writes = asked
        .filter((plan) => plan.definition === one.name && plan.system && plan.write)
        .map((plan) => `${plan.write?.kind} ${plan.table}`)
      const run = arrowOf(one, 'run')
      if (run && fn.form === 'code')
        for (const call of callsOf(run, namesGiven(run))) {
          const [, table, kind] = /(?:^|\.)db\.system\.(\w+)(?:\.\w+)*\.(add|change|remove)$/.exec(call.name) ?? []
          if (table !== undefined) writes.push(`${kind} ${table}`)
        }
      for (const write of new Set(writes)) {
        const [kind, name] = write.split(' ')
        const table = Object.hasOwn(description.tables, name) ? description.tables[name] : undefined
        const held = isStored(table?.access) ? table.access[kind] : undefined
        if (!table || letsIn(held, fn.access)) continue
        if (kind === 'add' && Reflect.get(Object(held), 'rule') !== 'owner') continue
        // A role let past the owner of a row by `system` is what the staff of the words do on purpose: a
        // function open to a role is held where the table lets nobody write the row.
        if (open === 'role' && Reflect.get(Object(held), 'rule') === 'owner') continue
        // A `set` holds nothing against the caller: only the code of a `run` can.
        const linked = Object.values(table.columns ?? {}).flatMap((type) =>
          type.kind === 'link' && typeof type.table === 'string' ? [type.table] : [],
        )
        if (run && checksCaller(run, typeof table.owner === 'string' ? table.owner : undefined, [name, ...linked]))
          continue
        const who = open === 'anyone' ? 'Anyone' : open === 'role' ? 'Anyone of the role' : 'Anyone signed in'
        const said = isStored(held) && typeof held.rule === 'string' ? `is '${held.rule}'` : 'lets nobody in'
        found.push(
          at(
            'T3009',
            one,
            undefined,
            `${who} can ${kind} any row of ${name}: the table rule for "${kind}" on ${name} ${said}, but this ${String(fn.kind)} states \`system\` and skips it.`,
            'Remove `system`, or keep it and add a check that the caller owns the row.',
          ),
        )
      }
    }
    return found
  },
}
