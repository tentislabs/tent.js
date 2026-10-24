import { consentsIn } from '../consents.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'

/** The `consent` of a script of the head, whose state is kept in the address, where a link from anywhere gives the yes. A warning. */
export const rule: Rule = {
  code: 'T6031',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    consentsIn(description, source).flatMap(({ written, consent, states, node }) =>
      Object.hasOwn(states, consent) && states[consent].in === 'address'
        ? [
            at(
              'T6031',
              written,
              node,
              `the consent \`${consent}\` is a state kept in the address: a link from anywhere would give the yes for the visitor.`,
              "Keep the state in the device, as `{ type: boolean(), in: 'device' }`, or in the screen.",
              'warning',
            ),
          ]
        : [],
    ),
}
