import type { Node, Source } from '../build/index.ts'
import { keyOf, kids, unwrap } from '../build/index.ts'
import type { Description } from '../core/internal.ts'
import { callsIn, readsIn } from './code.ts'
import { writtenIn } from './rule.ts'

// The members of `db` that are full access, and the handles whose members are: `secrets` for the two that write.
const ofDb = /(?:^|\.)db\.(system|sql|n)$/
export const ofHandle = /^(?:roles|keys|runs|workspaces)\.[A-Za-z]+$|^secrets\.(?:set|remove)$/

/** The keys of a record that is written in place, or none where it is no such record. */
function keysOf(written: Node | undefined): string[] {
  const node = written ? unwrap(written) : undefined
  if (node?.type !== 'ObjectExpression') return []
  return kids(node, 'properties').flatMap((one) => {
    const key = one.type === 'Property' ? keyOf(one) : undefined
    return key === undefined ? [] : [key]
  })
}

/** Whether a call hands a user to `connections` or `grants`, which only full access may: `list(user)`, `end(service, { user })`. */
function handsUser(name: string, args: Node[]): boolean {
  if (name === 'connections.list' || name === 'grants.list') return args.length > 0
  return name === 'connections.end' && keysOf(args[1]).includes('user')
}

/**
 * Takes the code of a `run` and the files of its project. Answers each thing that the code uses of what is full
 * access, as a finding names it, once, at the first place it stands: `db.system`, `db.sql`, `db.n`, the members of `roles`, `keys`, `runs`
 * and `workspaces`, `secrets.set` and `secrets.remove`, `for` on a call of a service, and a user handed to
 * `connections` or `grants`.
 */
export function fullAccessIn(run: Node, source: Source): Map<string, Node> {
  const used = new Map<string, Node>()
  for (const read of readsIn(run)) {
    const member = ofDb.exec(read.name)?.[1]
    if (member !== undefined && !used.has(`\`db.${member}\``)) used.set(`\`db.${member}\``, read.node)
  }
  // A call of a service is reached through the name that its file exports it by.
  const services = writtenIn(source)
    .filter((one) => one.word === 'service')
    .map((one) => one.declared.exportName)
  for (const call of callsIn(run)) {
    const [service, member] = call.name.split('.')
    const what = ofHandle.test(call.name)
      ? `\`${call.name}\``
      : handsUser(call.name, call.args)
        ? `a user handed to \`${call.name}\``
        : member !== undefined && services.includes(service) && keysOf(call.args[1]).includes('for')
          ? `\`for\` on the call \`${call.name}\``
          : undefined
    if (what !== undefined && !used.has(what)) used.set(what, call.node)
  }
  return used
}

/** Whether a flow has full access: it is no agent, and does not run as its starter. */
const hasFullAccess = (description: Description, name: string): boolean =>
  Object.hasOwn(description.flows, name) &&
  description.flows[name].agent === undefined &&
  description.flows[name].as !== 'starter'

/**
 * Takes the code of a `run` and the description. Answers each flow with full access that the code calls and so
 * waits for, once, at its first call: only code with full access may. `start` does not wait, and is none of them.
 */
export function waitedFor(run: Node, description: Description): Map<string, Node> {
  const called = new Map<string, Node>()
  for (const call of callsIn(run))
    if (hasFullAccess(description, call.name) && !called.has(call.name)) called.set(call.name, call.node)
  return called
}
