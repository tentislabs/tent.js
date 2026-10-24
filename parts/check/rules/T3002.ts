import type { Finding } from '../../core/index.ts'
import { isBare } from '../bare.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

const fix = "Write the reason down, `anyone('why')`, or let fewer callers in: 'signedIn', `role(...)`."

/** Bare 'anyone' on a write: on `add`, `change` or `remove` of a table, on a change and on an action. */
export const rule: Rule = {
  code: 'T3002',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      if (one.word === 'table' && Object.hasOwn(description.tables, one.name)) {
        const access = description.tables[one.name].access
        for (const what of ['add', 'change', 'remove'])
          if (isStored(access) && isBare(access[what]))
            found.push(
              at(
                'T3002',
                one,
                undefined,
                `the rule for "${what}" is bare 'anyone': whoever reaches the app may ${what} a row, and nothing says why.`,
                fix,
              ),
            )
      }
      const fn = Object.hasOwn(description.functions, one.name) ? description.functions[one.name] : undefined
      if ((fn?.kind === 'change' || fn?.kind === 'action') && isBare(fn.access))
        found.push(
          at(
            'T3002',
            one,
            undefined,
            `the ${fn.kind} is open to bare 'anyone': whoever reaches the app may call it, and nothing says why.`,
            fix,
          ),
        )
    }
    return found
  },
}
