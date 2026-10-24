import { pairsOf } from '../pairs.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'

/** In a plain definition: two moments compared or taken apart by JavaScript's own rules, and a moment inside a text with values. */
export const rule: Rule = {
  code: 'T8001',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    writtenIn(source).flatMap((one) =>
      pairsOf(description, one.name)
        .filter((pair) => pair.kinds !== 'lists')
        .map((pair) =>
          at(
            'T8001',
            one,
            undefined,
            pair.kinds === 'text'
              ? 'a moment stands inside a text with values, where JavaScript writes it in the zone and the language of the server.'
              : `\`${pair.sign}\` stands between two moments. JavaScript holds two of them to be two things, so its meaning is not the one that is meant.`,
            pair.kinds === 'text'
              ? 'Write the moment with `concat(...)`, which writes it in the standard form.'
              : "Use `between(a, b, 'ms')`: it is 0 for the same moment, and the time from one to the other.",
            'warning',
          ),
        ),
    ),
}
