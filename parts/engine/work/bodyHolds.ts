import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'

/** Every record inside a stored value, the value itself among them. */
function each(value: unknown, see: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) for (const one of value) each(one, see)
  else if (isStored(value)) {
    see(value)
    for (const one of Object.values(value)) each(one, see)
  }
}

/**
 * What a stored body reads and calls: the tables of its plans, and the definitions it calls or starts. A plan
 * that begins at a name the body worked out, as a table handed to it, may read any table: `tables` is then nothing.
 */
function heldBy(body: unknown): { tables?: Set<string>; calls: Set<string> } {
  const tables = new Set<string>()
  const calls = new Set<string>()
  let anyTable = false
  each(body, (record) => {
    // A plan begins at `db.<table>` or at a table, and a stored plan names the table it reads.
    const plan = isStored(record.plan) ? record.plan : undefined
    for (const name of [record.from, plan?.db, plan?.table, record.table])
      if (typeof name === 'string') tables.add(name)
    if (plan && Array.isArray(plan.name)) anyTable = true
    // A call names its definition, and a start names its flow, wherever they stand.
    for (const name of [record.function, record.flow]) if (typeof name === 'string') calls.add(name)
    // A service call names its service and its call, which the writer is asked for as one name.
    if (typeof record.service === 'string' && typeof record.call === 'string')
      calls.add(`${record.service}.${record.call}`)
  })
  return { ...(anyTable ? {} : { tables }), calls }
}

/**
 * Takes a description, the definition whose work a task carries out, and what its worker asks. Where that
 * definition's `run` was read, the worker may read only the tables its body reads and call only what it calls:
 * anything else is T0013, since the writer holds what the work asks for to what its body holds.
 */
export function heldToBody(
  description: Description,
  definition: string,
  what: string,
  message: Record<string, unknown>,
): void {
  const record = description.functions[definition] ?? description.flows[definition]
  if (!record || !Array.isArray(record.body)) return
  const held = heldBy(record.body)
  if (what === 'read') {
    const from = Reflect.get(Object(message.plan), 'from')
    if (typeof from === 'string' && held.tables && !held.tables.has(from))
      throw new TentError('T0013', `The work of ${definition} reads ${from}, which its body does not read.`, {
        fix: 'A worker asks for what the body of the work holds, and no other.',
      })
  }
  if (what === 'do' && !held.calls.has(String(message.name)))
    throw new TentError(
      'T0013',
      `The work of ${definition} calls ${String(message.name)}, which its body does not call.`,
      {
        fix: 'A worker asks for what the body of the work holds, and no other.',
      },
    )
}
