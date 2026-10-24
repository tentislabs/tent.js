import type { Finding } from '../../../core/index.ts'
import { modelUnitsOf, runUnits, isStored } from '../../../core/internal.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'
import { isEmptyRecord, statedAt } from '../../stated.ts'

/**
 * The budget of an agent's run that bounds nothing: a `perRun` that names no unit, and one that names a unit which
 * nothing in the project counts, where every model is of a provider that ships. Which limits an agent states is the
 * builder's: one with no `steps`, no `perRun` or no `limits` at all is no finding.
 */
export const rule: Rule = {
  code: 'T7003',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const { units, open } = modelUnitsOf(description)
    for (const unit of runUnits) units.add(unit)
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      if (one.word !== 'agent') continue
      const flow = Object.hasOwn(description.flows, one.name) ? description.flows[one.name] : undefined
      const agent = isStored(flow?.agent) ? flow.agent : undefined
      if (!agent || !isStored(agent.limits)) continue
      const { limits } = agent
      // A record with no unit in it is left out of the description, so it is read where the file writes it.
      const written = statedAt(one, ['limits', 'perRun'])
      if (isEmptyRecord(written))
        found.push(
          at(
            'T7003',
            one,
            written,
            '`limits.perRun` names no unit, so it bounds nothing.',
            'Name a unit and its most, as `{ tokensOut: 50000 }`.',
          ),
        )
      const perRun = limits.perRun
      if (!isStored(perRun) || open) continue
      for (const unit of Object.keys(perRun))
        if (!units.has(unit))
          found.push(
            at(
              'T7003',
              one,
              undefined,
              `\`limits.perRun\` names the unit \`${unit}\`, which nothing in the project counts, so it bounds nothing.`,
              `Name a unit that a run uses: ${[...units].join(', ')}.`,
            ),
          )
    }
    return found
  },
}
