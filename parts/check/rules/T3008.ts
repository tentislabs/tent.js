import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'

/** A call coming in that states neither `verify` nor `open`: whoever finds its address would start its flow. */
export const rule: Rule = {
  code: 'T3008',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source).filter((written) => written.word === 'incoming')) {
      const stored = Object.hasOwn(description.incoming, one.name) ? description.incoming[one.name] : undefined
      if (!stored || stored.verify !== undefined || stored.open !== undefined) continue
      found.push(
        at(
          'T3008',
          one,
          undefined,
          `it states neither \`verify\` nor \`open\`: whoever finds ${String(stored.path)} would start its flow.`,
          "State `verify` with the signature of its sender, or `open: 'why'` where nobody can sign it.",
        ),
      )
    }
    return found
  },
}
