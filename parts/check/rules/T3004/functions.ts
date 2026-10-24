import type { Node } from '../../../build/index.ts'
import type { Finding } from '../../../core/index.ts'
import { fullAccessIn, ofHandle } from '../../fullAccess.ts'
import type { Rule } from '../../rule.ts'
import { arrowOf, at, inside, writtenIn } from '../../rule.ts'
import { isStored } from '../../../core/internal.ts'

/** Full access that a query, a change or an action uses, and that states no `system`: each thing that the list of full access holds. */
export const rule: Rule = {
  code: 'T3004',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      const fn = Object.hasOwn(description.functions, one.name) ? description.functions[one.name] : undefined
      if (!fn || fn.system !== undefined) continue
      // Each thing once, at the first place it stands.
      const used = new Map<string, Node | undefined>()
      inside([fn.body, isStored(fn.access) ? fn.access.test : undefined], (record) => {
        if (isStored(record.plan) && record.plan.system === true && !used.has('`db.system`'))
          used.set('`db.system`', undefined)
        const builtin = isStored(record.call) ? record.call.builtin : undefined
        if (typeof builtin === 'string' && ofHandle.test(builtin) && !used.has(`\`${builtin}\``))
          used.set(`\`${builtin}\``, undefined)
      })
      const run = fn.form === 'code' ? arrowOf(one, 'run') : undefined
      for (const [what, node] of run ? fullAccessIn(run, source) : []) if (!used.has(what)) used.set(what, node)
      for (const [what, node] of used)
        found.push(
          at(
            'T3004',
            one,
            node,
            `it uses ${what}, which is full access, and states no \`system\`. Without it the ${String(fn.kind)} has none, and fails there while it runs.`,
            "State `system: 'why'` with the reason, or reach the rows through `db`, under the rules of the caller.",
          ),
        )
    }
    return found
  },
}
