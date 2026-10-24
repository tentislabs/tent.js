import { pairsOf } from '../pairs.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'

/** In a plain definition: two lists or two records compared by JavaScript's own rules. */
export const rule: Rule = {
  code: 'T8002',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    writtenIn(source).flatMap((one) =>
      pairsOf(description, one.name)
        .filter((pair) => pair.kinds === 'lists')
        .map((pair) =>
          at(
            'T8002',
            one,
            undefined,
            `\`${pair.sign}\` stands between two lists or records. JavaScript holds two of them to be the same only when they are one thing in memory, and a body that was read makes a list anew at each read.`,
            'Compare a field of each, as their ids, or the entries one by one.',
            'warning',
          ),
        ),
    ),
}
