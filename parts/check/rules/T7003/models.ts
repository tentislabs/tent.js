import type { Finding } from '../../../core/index.ts'
import { engineUnits, modelUnitsOf, isStored } from '../../../core/internal.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'
import { isEmptyRecord, statedAt } from '../../stated.ts'

/**
 * A limit of use of a model that can never bound: one that names no unit, and one that names a unit which nothing
 * in the project counts, where every model is of a provider that ships. `units` of a model over a service call that
 * names a unit of the engine's own, and `countBy: 'app'` beside `perCallerPerDay`.
 */
export const rule: Rule = {
  code: 'T7003',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const { units, open } = modelUnitsOf(description)
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      if (one.word !== 'model') continue
      const model = Object.hasOwn(description.models, one.name) ? description.models[one.name] : undefined
      if (!model) continue
      const limits = isStored(model.limits) ? model.limits : {}
      for (const limit of ['perDay', 'perCallerPerDay']) {
        // A record with no unit in it is left out of the description, so it is read where the file writes it.
        const written = statedAt(one, ['limits', limit])
        if (isEmptyRecord(written))
          found.push(
            at(
              'T7003',
              one,
              written,
              `\`limits.${limit}\` names no unit, so it bounds nothing.`,
              'Name a unit and its most, as `{ tokensOut: 2000000 }`.',
            ),
          )
        const stated = limits[limit]
        if (!isStored(stated) || open) continue
        for (const unit of Object.keys(stated))
          if (!units.has(unit))
            found.push(
              at(
                'T7003',
                one,
                undefined,
                `\`limits.${limit}\` names the unit \`${unit}\`, which nothing in the project counts, so it bounds nothing.`,
                `Name a unit that is counted: ${[...units].join(', ')}.`,
              ),
            )
      }
      if (model.countBy === 'app' && isStored(limits.perCallerPerDay))
        found.push(
          at(
            'T7003',
            one,
            undefined,
            "`countBy: 'app'` counts the model with no caller, so its `perCallerPerDay` bounds nothing.",
            "Take `countBy: 'app'` away, or the limit for each caller.",
          ),
        )
      for (const unit of Object.keys(isStored(model.units) ? model.units : {}))
        if (engineUnits.includes(unit))
          found.push(
            at(
              'T7003',
              one,
              undefined,
              `\`units\` names \`${unit}\`, a unit of the engine's own, which a model does not report.`,
              'Name the unit by another name.',
            ),
          )
    }
    return found
  },
}
