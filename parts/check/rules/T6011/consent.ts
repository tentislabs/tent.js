import { consentsIn } from '../../consents.ts'
import type { Rule } from '../../rule.ts'
import { at } from '../../rule.ts'

/** `consent` of a script of the head naming a state that is not declared, or that is not true or false. */
export const rule: Rule = {
  code: 'T6011',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    consentsIn(description, source).flatMap(({ written, consent, states, node }) => {
      const declared = Object.hasOwn(states, consent) ? states[consent] : undefined
      if (declared?.type.kind === 'boolean') return []
      return [
        at(
          'T6011',
          written,
          node,
          declared
            ? `\`consent\` names the state \`${consent}\`, which is no true-or-false state: its type is \`${String(declared.type.kind)}\`.`
            : `\`consent\` names \`${consent}\`, which is not declared: it is no state of the screen and none of the project.`,
          'Name a state that the screen or the project declares as `boolean()`.',
        ),
      ]
    }),
}
