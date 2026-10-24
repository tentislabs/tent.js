import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { abilitiesOf } from '../agents.ts'

/**
 * A model in `fallback` that lacks an ability of the model it stands in for: a call that needs that ability
 * passes it over. A warning.
 */
export const rule: Rule = {
  code: 'T7005',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const written of writtenIn(source)) {
      if (written.word !== 'model') continue
      const record = Object.hasOwn(description.models, written.name) ? description.models[written.name] : undefined
      const asked = abilitiesOf(description, written.name)
      if (!record || !asked) continue
      for (const backup of Array.isArray(record.fallback) ? record.fallback.map(String) : []) {
        const has = abilitiesOf(description, backup)
        const lacked = has ? asked.filter((ability) => !has.includes(ability)) : []
        if (lacked.length)
          found.push(
            at(
              'T7005',
              written,
              undefined,
              `its fall-back ${backup} lacks ${lacked.map((one) => `\`${one}\``).join(', ')}: a call that needs it is given to no second model.`,
              'Give it a fall-back that can do what it does, or leave it as it is where those calls need none.',
              'warning',
            ),
          )
      }
    }
    return found
  },
}
