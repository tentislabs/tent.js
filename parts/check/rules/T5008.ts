import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/**
 * A note: an action that states `worker` or `background` and does not state `sends: false`, whose work may be
 * given again after a machine was lost; and a `batch` that states `split` on a definition that does not state
 * `sends: false`, whose good entries are carried out again.
 */
export const rule: Rule = {
  code: 'T5008',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      const fn = Object.hasOwn(description.functions, one.name) ? description.functions[one.name] : undefined
      if (one.word !== 'action' || !fn || fn.sends === false) continue
      if (fn.worker !== undefined || fn.background !== undefined)
        found.push(
          at(
            'T5008',
            one,
            undefined,
            'it states `worker` or `background`, and not `sends: false`: its work may be given again after a machine was lost, and what it sent out may be sent twice.',
            'State `sends: false` where the work sends nothing out, or give each call it makes outside a once-only key.',
            'note',
          ),
        )
      if (isStored(fn.batch) && fn.batch.split === true)
        found.push(
          at(
            'T5008',
            one,
            undefined,
            'its `batch` states `split`, and the action does not state `sends: false`: the good entries of a batch that is cut are carried out again.',
            'State `sends: false` where the work sends nothing out.',
            'note',
          ),
        )
    }
    return found
  },
}
