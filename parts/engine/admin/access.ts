import type { Admin } from '../admin.ts'

/**
 * A rule as one word, or two: its kind, and the role that a rule of a role names. A rule that is not stated lets
 * nobody in.
 */
function ruleWords(access: unknown): string {
  const record: Record<string, unknown> = Object(access)
  const rule = typeof record.rule === 'string' ? record.rule : 'nobody'
  return rule === 'role' ? `role ${String(record.role)}` : rule
}

/** A service call as it is stored, in its dotted form: `decisions.decide`. */
const callWords = (call: unknown): string | undefined => {
  const record: Record<string, unknown> = Object(call)
  return typeof record.service === 'string' && typeof record.call === 'string'
    ? `${record.service}.${record.call}`
    : undefined
}

/**
 * `tent access`: one table of who can do what. For each table the rule of each of its four doings, and for each
 * function its kind and its rule, with the reason of its full access and whether it uses raw SQL; every model with
 * its provider, and its service call where it is one; the policy of each agent that builds; and what the
 * project opened of the policy of its pages, `unlock`.
 */
export const admin: Admin = {
  name: 'access',
  async run(o) {
    const sorted = <Record>(records: { [name: string]: Record }): [string, Record][] =>
      Object.entries(records).sort(([a], [b]) => (a < b ? -1 : 1))
    const tables = sorted(o.description.tables).map(([table, record]) => {
      const access: Record<string, unknown> = Object(record.access)
      return {
        table,
        read: ruleWords(access.read),
        add: ruleWords(access.add),
        change: ruleWords(access.change),
        remove: ruleWords(access.remove),
      }
    })
    const functions = sorted(o.description.functions).map(([name, record]) => ({
      name,
      kind: record.kind,
      access: ruleWords(record.access),
      ...(typeof record.system === 'string' ? { system: record.system } : {}),
      ...(record.tiedTo === 'sqlite' ? { sql: true } : {}),
    }))
    const models = sorted(o.description.models).map(([name, record]) => {
      const call = callWords(record.call)
      return { name, provider: String(record.provider), ...(call === undefined ? {} : { call }) }
    })
    const policies = sorted(o.description.flows).flatMap(([name, record]) => {
      const policy: unknown = Reflect.get(Object(record.agent), 'policy')
      return policy === undefined ? [] : [{ agent: name, policy }]
    })
    const opened: unknown = o.description.project.unlock
    return {
      tables,
      functions,
      // What a project has none of is left out.
      ...(models.length ? { models } : {}),
      ...(policies.length ? { policies } : {}),
      ...(opened === undefined ? {} : { unlock: opened }),
    }
  },
}
