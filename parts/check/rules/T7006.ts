import type { Finding } from '../../core/index.ts'
import { knownModel } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'

/**
 * A model that the list of models does not know, and that states no `abilities`, no `takes` where it replies, or no
 * `voices` where it speaks: what it can do is known from nowhere.
 */
export const rule: Rule = {
  code: 'T7006',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const written of writtenIn(source)) {
      if (written.word !== 'model') continue
      const record = Object.hasOwn(description.models, written.name) ? description.models[written.name] : undefined
      // A model over a service call, and one that states `input` and `output`, is a function and needs none.
      if (!record || record.provider === 'service' || (record.input !== undefined && record.output !== undefined))
        continue
      const known = knownModel(record)
      const can = (ability: string): boolean => !known.abilities || known.abilities.includes(ability)
      // What it takes is known only of a model that replies, and its voices only of one that speaks.
      const lacks = [
        known.abilities ? undefined : 'abilities',
        known.takes === undefined && can('reply') ? 'takes' : undefined,
        known.voices === undefined && known.abilities?.includes('speak') ? 'voices' : undefined,
      ].filter((one): one is string => one !== undefined)
      if (lacks.length)
        found.push(
          at(
            'T7006',
            written,
            undefined,
            `the list of models does not know ${String(record.name)} of ${String(record.provider)}, and it states no ${lacks.map((one) => `\`${one}\``).join(' and no ')}.`,
            "State what it can do and how much it takes: `abilities: ['reply', 'tools'], takes: 128000`.",
          ),
        )
    }
    return found
  },
}
