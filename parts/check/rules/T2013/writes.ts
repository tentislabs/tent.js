import type { Finding } from '../../../core/index.ts'
import { tenantTable } from '../../tenant.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'
import { isStored } from '../../../core/internal.ts'

/** A change written with `set` whose writes go to two data files: two tenants, or a tenant and the shared file. */
export const rule: Rule = {
  code: 'T2013',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      const fn = Object.hasOwn(description.functions, one.name) ? description.functions[one.name] : undefined
      const writes = Array.isArray(fn?.writes) ? fn.writes.filter(isStored) : []
      // Each write by the file it goes to: the shared file, or the file of the tenant that its `of` holds.
      const shared: string[] = []
      const tenants = new Map<string, string>()
      for (const write of writes) {
        const table = [write.add, write.change, write.remove].find((name) => typeof name === 'string')
        if (typeof table !== 'string') continue
        if (tenantTable(description, table) === undefined) shared.push(table)
        else tenants.set(JSON.stringify(write.of ?? null), table)
      }
      if (tenants.size > 1)
        found.push(
          at(
            'T2013',
            one,
            undefined,
            `the writes of its \`set\` go to two data files: \`of\` holds ${[...tenants.keys()].join(' in one and ')} in another. One change writes one file.`,
            'Write each tenant in a change of its own: an action or a flow calls a change for each.',
          ),
        )
      else if (tenants.size === 1 && shared.length)
        found.push(
          at(
            'T2013',
            one,
            undefined,
            `its \`set\` writes \`${shared[0]}\`, a table of the shared file, and \`${[...tenants.values()][0]}\`, in the data file of a tenant. One change writes one file.`,
            'Write the shared file in a change of its own: an action or a flow calls both.',
          ),
        )
    }
    return found
  },
}
